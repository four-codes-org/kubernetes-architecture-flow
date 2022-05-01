## Rook-ceph cluster monitoring  with existing promotheus in kubernetes

----
**Requiremnets**

| SERVICE | PURPOSE | RELEASE NAME | NAMEPSACE |
| --- | --- | --- | --- |
| rook-ceph | storage cluster | rook-ceph | rook-ceph |
| prometheus | monitor cluster | prometheus-grafana | monitor |

**Labels**

The labels should be mentioned in the service monitor and grafana ceph cluster dashboard configuration files. It cannot be papulated with the prometheus configuration if it is missed.
* `release: prometheus-grafana`


Create the serviceMonitor file for prometheus scraping process

```yml
---
# ceph-cluster-prometheus-service-monitor.yml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: prometheus-grafana-rook-ceph-mgr
  namespace: rook-ceph
  labels:
    release: prometheus-grafana
spec:
  namespaceSelector:
    matchNames:
      - rook-ceph
  selector:
    matchLabels:
      app: rook-ceph-mgr
      rook_cluster: rook-ceph
  endpoints:
  - port: http-metrics
    path: /metrics
    interval: 5s
```

csi driver monitor

```yml
# ceph-cluster-prometheus-csi-service-monitor.yml
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: csi-metrics
  namespace: rook-ceph
  labels:
    release: prometheus-grafana
spec:
  namespaceSelector:
    matchNames:
      - rook-ceph
  selector:
    matchLabels:
      app: csi-metrics
  endpoints:
    - port: csi-http-metrics
      path: /metrics
      interval: 5s
# comment csi-grpc-metrics realated information if csi grpc metrics is not enabled
#   - port: csi-grpc-metrics
#     path: /metrics
#     interval: 5s

```

This serviceMonitor requires RBAC for this namespace.

```yaml
---
# ceph-cluster-prometheus-service-monitor-rbac.yml
# Aspects for creation of monitoring resources
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-monitor
  namespace: rook-ceph
rules:
  - apiGroups:
    - monitoring.coreos.com
    resources:
    - servicemonitors
    - prometheusrules
    verbs:
    - '*'
---
# Allow creation of monitoring resources
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-monitor
  namespace: rook-ceph
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: rook-ceph-monitor
subjects:
- kind: ServiceAccount
  name: rook-ceph-system
  namespace: rook-ceph
---
# Aspects for metrics collection
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-metrics
  namespace: rook-ceph
rules:
 - apiGroups:
   - ""
   resources:
    - services
    - endpoints
    - pods
   verbs:
    - get
    - list
    - watch
---
# Allow collection of metrics
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-metrics
  namespace: rook-ceph
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: rook-ceph-metrics
subjects:
- kind: ServiceAccount
  # change to the serviceaccount and namespace to use for monitoring
  name: prometheus-k8s
  namespace: rook-ceph
---
# Allow management of monitoring resources in the mgr
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-monitor-mgr
  namespace: rook-ceph
rules:
- apiGroups:
  - monitoring.coreos.com
  resources:
  - servicemonitors
  verbs:
  - get
  - list
  - create
  - update
---
# Allow creation of monitoring resources in the mgr
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: rook-ceph-monitor-mgr
  namespace: rook-ceph
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: rook-ceph-monitor-mgr
subjects:
- kind: ServiceAccount
  name: rook-ceph-mgr
  namespace: rook-ceph
---
```

create the alerts for ceph cluster

```yaml
---
# ceph-cluster-prometehus-rule.yml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  labels:
    release: prometheus-grafana
  name: prometheus-ceph-rules
  namespace: rook-ceph
spec:
  groups:
    - name: cluster health
      rules:
        - alert: CephHealthError
          expr: ceph_health_status == 2
          for: 5m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.2.1
          annotations:
            summary: Cluster is in an ERROR state
            description: >
              Ceph in HEALTH_ERROR state for more than 5 minutes.
              Please check "ceph health detail" for more information.

        - alert: CephHealthWarning
          expr: ceph_health_status == 1
          for: 15m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: Cluster is in a WARNING state
            description: >
              Ceph has been in HEALTH_WARN for more than 15 minutes.
              Please check "ceph health detail" for more information.

    - name: mon
      rules:
        - alert: CephMonDownQuorumAtRisk
          expr: ((ceph_health_detail{name="MON_DOWN"} == 1) * on() (count(ceph_mon_quorum_status == 1) == bool (floor(count(ceph_mon_metadata) / 2) + 1))) == 1
          for: 30s
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.3.1
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#mon-down
            summary: Monitor quorum is at risk
            description: |
              {{ $min := query "floor(count(ceph_mon_metadata) / 2) +1" | first | value }}Quorum requires a majority of monitors (x {{ $min }}) to be active
              Without quorum the cluster will become inoperable, affecting all connected clients and services.

              The following monitors are down:
              {{- range query "(ceph_mon_quorum_status == 0) + on(ceph_daemon) group_left(hostname) (ceph_mon_metadata * 0)" }}
                - {{ .Labels.ceph_daemon }} on {{ .Labels.hostname }}
              {{- end }}
        - alert: CephMonDown
          expr: (count(ceph_mon_quorum_status == 0) <= (count(ceph_mon_metadata) - floor(count(ceph_mon_metadata) / 2) + 1))
          for: 30s
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#mon-down
            summary: One of more ceph monitors are down
            description: |
              {{ $down := query "count(ceph_mon_quorum_status == 0)" | first | value }}{{ $s := "" }}{{ if gt $down 1.0 }}{{ $s = "s" }}{{ end }}You have {{ $down }} monitor{{ $s }} down.
              Quorum is still intact, but the loss of further monitors will make your cluster inoperable.

              The following monitors are down:
              {{- range query "(ceph_mon_quorum_status == 0) + on(ceph_daemon) group_left(hostname) (ceph_mon_metadata * 0)" }}
                - {{ .Labels.ceph_daemon }} on {{ .Labels.hostname }}
              {{- end }}
        - alert: CephMonDiskspaceCritical
          expr: ceph_health_detail{name="MON_DISK_CRIT"} == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.3.2
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#mon-disk-crit
            summary: Disk space on at least one monitor is critically low
            description: |
              The free space available to a monitor's store is critically low (<5% by default).
              You should increase the space available to the monitor(s). The
              default location for the store sits under /var/lib/ceph. Your monitor hosts are;
              {{- range query "ceph_mon_metadata"}}
                - {{ .Labels.hostname }}
              {{- end }}

        - alert: CephMonDiskspaceLow
          expr: ceph_health_detail{name="MON_DISK_LOW"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#mon-disk-low
            summary: Disk space on at least one monitor is approaching full
            description: |
              The space available to a monitor's store is approaching full (>70% is the default).
              You should increase the space available to the monitor store. The
              default location for the store sits under /var/lib/ceph. Your monitor hosts are;
              {{- range query "ceph_mon_metadata"}}
                - {{ .Labels.hostname }}
              {{- end }}

        - alert: CephMonClockSkew
          expr: ceph_health_detail{name="MON_CLOCK_SKEW"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#mon-clock-skew
            summary: Clock skew across the Monitor hosts detected
            description: |
              The ceph monitors rely on a consistent time reference to maintain
              quorum and cluster consistency. This event indicates that at least
              one of your mons is not sync'd correctly.

              Review the cluster status with ceph -s. This will show which monitors
              are affected. Check the time sync status on each monitor host.

    - name: osd
      rules:
        - alert: CephOSDDownHigh
          expr: count(ceph_osd_up == 0) / count(ceph_osd_up) * 100 >= 10
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.1
          annotations:
            summary: More than 10% of OSDs are down
            description: |
              {{ $value | humanize }}% or {{ with query "count(ceph_osd_up == 0)" }}{{ . | first | value }}{{ end }} of {{ with query "count(ceph_osd_up)" }}{{ . | first | value }}{{ end }} OSDs are down (>= 10%).

              The following OSDs are down:
              {{- range query "(ceph_osd_up * on(ceph_daemon) group_left(hostname) ceph_osd_metadata) == 0" }}
                - {{ .Labels.ceph_daemon }} on {{ .Labels.hostname }}
              {{- end }}
        - alert: CephOSDHostDown
          expr: ceph_health_detail{name="OSD_HOST_DOWN"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.8
          annotations:
            summary: An OSD host is offline
            description: |
              The following OSDs are down:
              {{- range query "(ceph_osd_up * on(ceph_daemon) group_left(hostname) ceph_osd_metadata) == 0" }}
              - {{ .Labels.hostname }} : {{ .Labels.ceph_daemon }}
              {{- end }}
        - alert: CephOSDDown
          expr: ceph_health_detail{name="OSD_DOWN"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.2
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#osd-down
            summary: An OSD has been marked down/unavailable
            description: |
              {{ $num := query "count(ceph_osd_up == 0)" | first | value }}{{ $s := "" }}{{ if gt $num 1.0 }}{{ $s = "s" }}{{ end }}{{ $num }} OSD{{ $s }} down for over 5mins.

              The following OSD{{ $s }} {{ if eq $s "" }}is{{ else }}are{{ end }} down:
                {{- range query "(ceph_osd_up * on(ceph_daemon) group_left(hostname) ceph_osd_metadata) == 0"}}
                - {{ .Labels.ceph_daemon }} on {{ .Labels.hostname }}
                {{- end }}

        - alert: CephOSDNearFull
          expr: ceph_health_detail{name="OSD_NEARFULL"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.3
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#osd-nearfull
            summary: OSD(s) running low on free space (NEARFULL)
            description: |
              One or more OSDs have reached their NEARFULL threshold

              Use 'ceph health detail' to identify which OSDs have reached this threshold.
              To resolve, either add capacity to the cluster, or delete unwanted data
        - alert: CephOSDFull
          expr: ceph_health_detail{name="OSD_FULL"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.6
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#osd-full
            summary: OSD(s) is full, writes blocked
            description: |
              An OSD has reached it's full threshold. Writes from all pools that share the
              affected OSD will be blocked.

              To resolve, either add capacity to the cluster, or delete unwanted data
        - alert: CephOSDBackfillFull
          expr: ceph_health_detail{name="OSD_BACKFILLFULL"} > 0
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#osd-backfillfull
            summary: OSD(s) too full for backfill operations
            description: |
              An OSD has reached it's BACKFILL FULL threshold. This will prevent rebalance operations
              completing for some pools. Check the current capacity utilisation with 'ceph df'

              To resolve, either add capacity to the cluster, or delete unwanted data
        - alert: CephOSDTooManyRepairs
          expr: ceph_health_detail{name="OSD_TOO_MANY_REPAIRS"} == 1
          for: 30s
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#osd-too-many-repairs
            summary: OSD has hit a high number of read errors
            description: |
              Reads from an OSD have used a secondary PG to return data to the client, indicating
              a potential failing disk.
        - alert: CephOSDTimeoutsPublicNetwork
          expr: ceph_health_detail{name="OSD_SLOW_PING_TIME_FRONT"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: Network issues delaying OSD heartbeats (public network)
            description: |
              OSD heartbeats on the cluster's 'public' network (frontend) are running slow. Investigate the network
              for any latency issues on this subnet. Use 'ceph health detail' to show the affected OSDs.
        - alert: CephOSDTimeoutsClusterNetwork
          expr: ceph_health_detail{name="OSD_SLOW_PING_TIME_BACK"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: Network issues delaying OSD heartbeats (cluster network)
            description: |
              OSD heartbeats on the cluster's 'cluster' network (backend) are running slow. Investigate the network
              for any latency issues on this subnet. Use 'ceph health detail' to show the affected OSDs.
        - alert: CephOSDInternalDiskSizeMismatch
          expr: ceph_health_detail{name="BLUESTORE_DISK_SIZE_MISMATCH"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#bluestore-disk-size-mismatch
            summary: OSD size inconsistency error
            description: |
              One or more OSDs have an internal inconsistency between the size of the physical device and it's metadata.
              This could lead to the OSD(s) crashing in future. You should redeploy the effected OSDs.
        - alert: CephDeviceFailurePredicted
          expr: ceph_health_detail{name="DEVICE_HEALTH"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#id2
            summary: Device(s) have been predicted to fail soon
            description: |
              The device health module has determined that one or more devices will fail
              soon. To review the device states use 'ceph device ls'. To show a specific
              device use 'ceph device info <dev id>'.

              Mark the OSD as out (so data may migrate to other OSDs in the cluster). Once
              the osd is empty remove and replace the OSD.
        - alert: CephDeviceFailurePredictionTooHigh
          expr: ceph_health_detail{name="DEVICE_HEALTH_TOOMANY"} == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.7
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#device-health-toomany
            summary: Too many devices have been predicted to fail, unable to resolve
            description: |
              The device health module has determined that the number of devices predicted to
              fail can not be remediated automatically, since it would take too many osd's out of
              the cluster, impacting performance and potentially availabililty. You should add new
              OSDs to the cluster to allow data to be relocated to avoid the data integrity issues.
        - alert: CephDeviceFailureRelocationIncomplete
          expr: ceph_health_detail{name="DEVICE_HEALTH_IN_USE"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#device-health-in-use
            summary: A device failure is predicted, but unable to relocate data
            description: |
              The device health module has determined that one or more devices will fail
              soon, but the normal process of relocating the data on the device to other
              OSDs in the cluster is blocked.

              Check the the cluster has available freespace. It may be necessary to add
              more disks to the cluster to allow the data from the failing device to
              successfully migrate.

        - alert: CephOSDFlapping
          expr: |
            (
              rate(ceph_osd_up[5m])
              * on(ceph_daemon) group_left(hostname) ceph_osd_metadata
            ) * 60 > 1
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.4
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/troubleshooting/troubleshooting-osd#flapping-osds
            summary: Network issues are causing OSD's to flap (mark each other out)
            description: >
              OSD {{ $labels.ceph_daemon }} on {{ $labels.hostname }} was
              marked down and back up at {{ $value | humanize }} times once a
              minute for 5 minutes. This could indicate a network issue (latency,
              packet drop, disruption) on the clusters "cluster network". Check the
              network environment on the listed host(s).

        - alert: CephOSDReadErrors
          expr: ceph_health_detail{name="BLUESTORE_SPURIOUS_READ_ERRORS"} == 1
          for: 30s
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#bluestore-spurious-read-errors
            summary: Device read errors detected
            description: >
              An OSD has encountered read errors, but the OSD has recovered by retrying
              the reads. This may indicate an issue with the Hardware or Kernel.
        # alert on high deviation from average PG count
        - alert: CephPGImbalance
          expr: |
            abs(
              (
                (ceph_osd_numpg > 0) - on (job) group_left avg(ceph_osd_numpg > 0) by (job)
              ) / on (job) group_left avg(ceph_osd_numpg > 0) by (job)
            ) * on(ceph_daemon) group_left(hostname) ceph_osd_metadata > 0.30
          for: 5m
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.4.5
          annotations:
            summary: PG allocations are not balanced across devices
            description: >
              OSD {{ $labels.ceph_daemon }} on {{ $labels.hostname }} deviates
              by more than 30% from average PG count.
        # alert on high commit latency...but how high is too high

    - name: mds
      rules:
        - alert: CephFilesystemDamaged
          expr: ceph_health_detail{name="MDS_DAMAGE"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.5.1
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages#cephfs-health-messages
            summary: Ceph filesystem is damaged.
            description: >
              The filesystems metadata has been corrupted. Data access
              may be blocked.

              Either analyse the output from the mds daemon admin socket, or
              escalate to support
        - alert: CephFilesystemOffline
          expr: ceph_health_detail{name="MDS_ALL_DOWN"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.5.3
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages/#mds-all-down
            summary: Ceph filesystem is offline
            description: >
              All MDS ranks are unavailable. The ceph daemons providing the metadata
              for the Ceph filesystem are all down, rendering the filesystem offline.
        - alert: CephFilesystemDegraded
          expr: ceph_health_detail{name="FS_DEGRADED"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.5.4
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages/#fs-degraded
            summary: Ceph filesystem is degraded
            description: >
              One or more metadata daemons (MDS ranks) are failed or in a
              damaged state. At best the filesystem is partially available,
              worst case is the filesystem is completely unusable.
        - alert: CephFilesystemMDSRanksLow
          expr: ceph_health_detail{name="MDS_UP_LESS_THAN_MAX"} > 0
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages/#mds-up-less-than-max
            summary: Ceph MDS daemon count is lower than configured
            description: >
              The filesystem's "max_mds" setting defined the number of MDS ranks in
              the filesystem. The current number of active MDS daemons is less than
              this setting.
        - alert: CephFilesystemInsufficientStandby
          expr: ceph_health_detail{name="MDS_INSUFFICIENT_STANDBY"} > 0
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages/#mds-insufficient-standby
            summary: Ceph filesystem standby daemons too low
            description: >
              The minimum number of standby daemons determined by standby_count_wanted
              is less than the actual number of standby daemons. Adjust the standby count
              or increase the number of mds daemons within the filesystem.
        - alert: CephFilesystemFailureNoStandby
          expr: ceph_health_detail{name="FS_WITH_FAILED_MDS"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.5.5
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages/#fs-with-failed-mds
            summary: Ceph MDS daemon failed, no further standby available
            description: >
              An MDS daemon has failed, leaving only one active rank without
              further standby. Investigate the cause of the failure or add a
              standby daemon
        - alert: CephFilesystemReadOnly
          expr: ceph_health_detail{name="MDS_HEALTH_READ_ONLY"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.5.2
          annotations:
            documentation: https://docs.ceph.com/en/latest/cephfs/health-messages#cephfs-health-messages
            summary: Ceph filesystem in read only mode, due to write error(s)
            description: >
              The filesystem has switched to READ ONLY due to an unexpected
              write error, when writing to the metadata pool

              Either analyse the output from the mds daemon admin socket, or
              escalate to support

    - name: mgr
      rules:
        - alert: CephMgrModuleCrash
          expr: ceph_health_detail{name="RECENT_MGR_MODULE_CRASH"} == 1
          for: 5m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.6.1
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#recent-mgr-module-crash
            summary: A mgr module has recently crashed
            description: >
              One or more mgr modules have crashed and are yet to be acknowledged by the administrator. A
              crashed module may impact functionality within the cluster. Use the 'ceph crash' commands to
              investigate which module has failed, and archive it to acknowledge the failure.
        - alert: CephMgrPrometheusModuleInactive
          expr: up{job="ceph"} == 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.6.2
          annotations:
            summary: Ceph's mgr/prometheus module is not available
            description: >
              The mgr/prometheus module at {{ $labels.instance }} is unreachable. This
              could mean that the module has been disabled or the mgr itself is down.

              Without the mgr/prometheus module metrics and alerts will no longer
              function. Open a shell to ceph and use 'ceph -s' to to determine whether the
              mgr is active. If the mgr is not active, restart it, otherwise you can check
              the mgr/prometheus module is loaded with 'ceph mgr module ls'  and if it's
              not listed as enabled, enable it with 'ceph mgr module enable prometheus'

    - name: pgs
      rules:
        - alert: CephPGsInactive
          expr: ceph_pool_metadata * on(pool_id,instance) group_left() (ceph_pg_total - ceph_pg_active) > 0
          for: 5m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.1
          annotations:
            summary: One or more Placement Groups are inactive
            description: >
              {{ $value }} PGs have been inactive for more than 5 minutes in pool {{ $labels.name }}.
              Inactive placement groups aren't able to serve read/write
              requests.
        - alert: CephPGsUnclean
          expr: ceph_pool_metadata * on(pool_id,instance) group_left() (ceph_pg_total - ceph_pg_clean) > 0
          for: 15m
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.2
          annotations:
            summary: One or more platcment groups are marked unclean
            description: >
              {{ $value }} PGs haven't been clean for more than 15 minutes in pool {{ $labels.name }}.
              Unclean PGs haven't been able to completely recover from a previous failure.
        - alert: CephPGsDamaged
          expr: ceph_health_detail{name=~"PG_DAMAGED|OSD_SCRUB_ERRORS"} == 1
          for: 5m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.4
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-damaged
            summary: Placement group damaged, manual intervention needed
            description: >
              During data consistency checks (scrub), at least one PG has been flagged as being
              damaged or inconsistent.

              Check to see which PG is affected, and attempt a manual repair if necessary. To list
              problematic placement groups, use 'rados list-inconsistent-pg <pool>'. To repair PGs use
              the 'ceph pg repair <pg_num>' command.
        - alert: CephPGRecoveryAtRisk
          expr: ceph_health_detail{name="PG_RECOVERY_FULL"} == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.5
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-recovery-full
            summary: OSDs are too full for automatic recovery
            description: >
              Data redundancy may be reduced, or is at risk, since one or more OSDs are at or above their
              'full' threshold. Add more capacity to the cluster, or delete unwanted data.
        - alert: CephPGUnavilableBlockingIO
          # PG_AVAILABILITY, but an OSD is not in a DOWN state
          expr: ((ceph_health_detail{name="PG_AVAILABILITY"} == 1) - scalar(ceph_health_detail{name="OSD_DOWN"})) == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.3
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-availability
            summary: Placement group is unavailable, blocking some I/O
            description: >
              Data availability is reduced impacting the clusters ability to service I/O to some data. One or
              more placement groups (PGs) are in a state that blocks IO.
        - alert: CephPGBackfillAtRisk
          expr: ceph_health_detail{name="PG_BACKFILL_FULL"} == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.7.6
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-backfill-full
            summary: Backfill operations are blocked, due to lack of freespace
            description: >
              Data redundancy may be at risk due to lack of free space within the cluster. One or more OSDs
              have breached their 'backfillfull' threshold. Add more capacity, or delete unwanted data.
        - alert: CephPGNotScrubbed
          expr: ceph_health_detail{name="PG_NOT_SCRUBBED"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-not-scrubbed
            summary: Placement group(s) have not been scrubbed
            description: |
              One or more PGs have not been scrubbed recently. The scrub process is a data integrity
              feature, protectng against bit-rot. It checks that objects and their metadata (size and
              attributes) match across object replicas. When PGs miss their scrub window, it may
              indicate the scrub window is too small, or PGs were not in a 'clean' state during the
              scrub window.

              You can manually initiate a scrub with: ceph pg scrub <pgid>
        - alert: CephPGsHighPerOSD
          expr: ceph_health_detail{name="TOO_MANY_PGS"} == 1
          for: 1m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks/#too-many-pgs
            summary: Placement groups per OSD is too high
            description: |
              The number of placement groups per OSD is too high (exceeds the mon_max_pg_per_osd setting).

              Check that the pg_autoscaler hasn't been disabled for any of the pools, with 'ceph osd pool autoscale-status'
              and that the profile selected is appropriate. You may also adjust the target_size_ratio of a pool to guide
              the autoscaler based on the expected relative size of the pool
              (i.e. 'ceph osd pool set cephfs.cephfs.meta target_size_ratio .1')
        - alert: CephPGNotDeepScrubbed
          expr: ceph_health_detail{name="PG_NOT_DEEP_SCRUBBED"} == 1
          for: 5m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pg-not-deep-scrubbed
            summary: Placement group(s) have not been deep scrubbed
            description: |
              One or more PGs have not been deep scrubbed recently. Deep scrub is a data integrity
              feature, protectng against bit-rot. It compares the contents of objects and their
              replicas for inconsistency. When PGs miss their deep scrub window, it may indicate
              that the window is too small or PGs were not in a 'clean' state during the deep-scrub
              window.

              You can manually initiate a deep scrub with: ceph pg deep-scrub <pgid>

    - name: nodes
      rules:
        - alert: CephNodeRootFilesystemFull
          expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100 < 5
          for: 5m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.8.1
          annotations:
            summary: Root filesystem is dangerously full
            description: >
              Root volume (OSD and MON store) is dangerously full: {{ $value | humanize }}% free.

        # alert on nic packet errors and drops rates > 1% packets/s
        - alert: CephNodeNetworkPacketDrops
          expr: |
            (
              increase(node_network_receive_drop_total{device!="lo"}[1m]) +
              increase(node_network_transmit_drop_total{device!="lo"}[1m])
            ) / (
              increase(node_network_receive_packets_total{device!="lo"}[1m]) +
              increase(node_network_transmit_packets_total{device!="lo"}[1m])
            ) >= 0.0001 or (
              increase(node_network_receive_drop_total{device!="lo"}[1m]) +
              increase(node_network_transmit_drop_total{device!="lo"}[1m])
            ) >= 10
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.8.2
          annotations:
            summary: One or more Nics is seeing packet drops
            description: >
              Node {{ $labels.instance }} experiences packet drop > 0.01% or >
              10 packets/s on interface {{ $labels.device }}.

        - alert: CephNodeNetworkPacketErrors
          expr: |
            (
              increase(node_network_receive_errs_total{device!="lo"}[1m]) +
              increase(node_network_transmit_errs_total{device!="lo"}[1m])
            ) / (
              increase(node_network_receive_packets_total{device!="lo"}[1m]) +
              increase(node_network_transmit_packets_total{device!="lo"}[1m])
            ) >= 0.0001 or (
              increase(node_network_receive_errs_total{device!="lo"}[1m]) +
              increase(node_network_transmit_errs_total{device!="lo"}[1m])
            ) >= 10
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.8.3
          annotations:
            summary: One or more Nics is seeing packet errors
            description: >
              Node {{ $labels.instance }} experiences packet errors > 0.01% or
              > 10 packets/s on interface {{ $labels.device }}.

        # Restrict to device names beginning with '/' to skip false alarms from
        # tmpfs, overlay type filesystems
        - alert: CephNodeDiskspaceWarning
          expr: |
            predict_linear(node_filesystem_free_bytes{device=~"/.*"}[2d], 3600 * 24 * 5) *
            on(instance) group_left(nodename) node_uname_info < 0
          labels:
            severity: warning
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.8.4
          annotations:
            summary: Host filesystem freespace is getting low
            description: >
              Mountpoint {{ $labels.mountpoint }} on {{ $labels.nodename }}
              will be full in less than 5 days assuming the average fill-up
              rate of the past 48 hours.

        - alert: CephNodeInconsistentMTU
          expr: node_network_mtu_bytes{device!="lo"} * (node_network_up{device!="lo"} > 0) != on() group_left() (quantile(0.5, node_network_mtu_bytes{device!="lo"}))
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: MTU settings across Ceph hosts are inconsistent
            description: >
              Node {{ $labels.instance }} has a different MTU size ({{ $value }})
              than the median value on device {{ $labels.device }}.

    - name: pools
      rules:
        - alert: CephPoolBackfillFull
          expr: ceph_health_detail{name="POOL_BACKFILLFULL"} > 0
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: Freespace in a pool is too low for recovery/rebalance
            description: >
              A pool is approaching it's near full threshold, which will
              prevent rebalance operations from completing. You should
              consider adding more capacity to the pool.

        - alert: CephPoolFull
          expr: ceph_health_detail{name="POOL_FULL"} > 0
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.9.1
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#pool-full
            summary: Pool is full - writes are blocked
            description: |
              A pool has reached it's MAX quota, or the OSDs supporting the pool
              have reached their FULL threshold. Until this is resolved, writes to
              the pool will be blocked.
              Pool Breakdown (top 5)
              {{- range query "topk(5, sort_desc(ceph_pool_percent_used * on(pool_id) group_right ceph_pool_metadata))" }}
                - {{ .Labels.name }} at {{ .Value }}%
              {{- end }}
              Either increase the pools quota, or add capacity to the cluster first
              then increase it's quota (e.g. ceph osd pool set quota <pool_name> max_bytes <bytes>)
        - alert: CephPoolNearFull
          expr: ceph_health_detail{name="POOL_NEAR_FULL"} > 0
          for: 5m
          labels:
            severity: warning
            type: ceph_default
          annotations:
            summary: One or more Ceph pools are getting full
            description: |
              A pool has exceeeded it warning (percent full) threshold, or the OSDs
              supporting the pool have reached their NEARFULL thresholds. Writes may
              continue, but you are at risk of the pool going read only if more capacity
              isn't made available.

              Determine the affected pool with 'ceph df detail', for example looking
              at QUOTA BYTES and STORED. Either increase the pools quota, or add
              capacity to the cluster first then increase it's quota
              (e.g. ceph osd pool set quota <pool_name> max_bytes <bytes>)
    - name: healthchecks
      rules:
        - alert: CephSlowOps
          expr: ceph_healthcheck_slow_ops > 0
          for: 30s
          labels:
            severity: warning
            type: ceph_default
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#slow-ops
            summary: MON/OSD operations are slow to complete
            description: >
              {{ $value }} OSD requests are taking too long to process (osd_op_complaint_time exceeded)

    # Object related events
    - name: rados
      rules:
        - alert: CephObjectMissing
          expr: (ceph_health_detail{name="OBJECT_UNFOUND"} == 1) * on() (count(ceph_osd_up == 1) == bool count(ceph_osd_metadata)) == 1
          for: 30s
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.10.1
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks#object-unfound
            summary: Object(s) has been marked UNFOUND
            description: |
              A version of a RADOS object can not be found, even though all OSDs are up. I/O
              requests for this object from clients will block (hang). Resolving this issue may
              require the object to be rolled back to a prior version manually, and manually verified.
    # Generic
    - name: generic
      rules:
        - alert: CephDaemonCrash
          expr: ceph_health_detail{name="RECENT_CRASH"} == 1
          for: 1m
          labels:
            severity: critical
            type: ceph_default
            oid: 1.3.6.1.4.1.50495.1.2.1.1.2
          annotations:
            documentation: https://docs.ceph.com/en/latest/rados/operations/health-checks/#recent-crash
            summary: One or more Ceph daemons have crashed, and are pending acknowledgement
            description: |
              One or more daemons have crashed recently, and need to be acknowledged. This notification
              ensures that software crashes don't go unseen. To acknowledge a crash, use the
              'ceph crash archive <id>' command.
              
    # ceph pvc
    - name: rook-ceph-persistent-volume-alert.rules
      rules:
        - alert: RookCephPersistentVolumeUsageNearFull
          annotations:
            description: PVC {{ $labels.persistentvolumeclaim }} utilization has crossed 75%. Free up some space or expand the PVC.
            message: PVC {{ $labels.persistentvolumeclaim }} is nearing full. Data deletion or PVC expansion is required.
            severity_level: warning
            storage_type: ceph
          expr: |
            (kubelet_volume_stats_used_bytes * on (namespace,persistentvolumeclaim) group_left(storageclass, provisioner) (kube_persistentvolumeclaim_info * on (storageclass)  group_left(provisioner) kube_storageclass_info {provisioner=~"(.*rbd.csi.ceph.com)|(.*cephfs.csi.ceph.com)"})) / (kubelet_volume_stats_capacity_bytes * on (namespace,persistentvolumeclaim) group_left(storageclass, provisioner) (kube_persistentvolumeclaim_info * on (storageclass)  group_left(provisioner) kube_storageclass_info {provisioner=~"(.*rbd.csi.ceph.com)|(.*cephfs.csi.ceph.com)"})) > 0.75
          for: 5s
          labels:
            severity: warning
        - alert: RookCephPersistentVolumeUsageCritical
          annotations:
            description: PVC {{ $labels.persistentvolumeclaim }} utilization has crossed 85%. Free up some space or expand the PVC immediately.
            message: PVC {{ $labels.persistentvolumeclaim }} is critically full. Data deletion or PVC expansion is required.
            severity_level: error
            storage_type: ceph
          expr: |
            (kubelet_volume_stats_used_bytes * on (namespace,persistentvolumeclaim) group_left(storageclass, provisioner) (kube_persistentvolumeclaim_info * on (storageclass)  group_left(provisioner) kube_storageclass_info {provisioner=~"(.*rbd.csi.ceph.com)|(.*cephfs.csi.ceph.com)"})) / (kubelet_volume_stats_capacity_bytes * on (namespace,persistentvolumeclaim) group_left(storageclass, provisioner) (kube_persistentvolumeclaim_info * on (storageclass)  group_left(provisioner) kube_storageclass_info {provisioner=~"(.*rbd.csi.ceph.com)|(.*cephfs.csi.ceph.com)"})) > 0.85
          for: 5s
          labels:
            severity: critical

```

**ceph cluster modification**

You must modify the monitoring parameters in linue 1058 in the ceph cluster yaml file.

```yaml
#################################################################################################################
# Define the settings for the rook-ceph cluster with common settings for a production cluster.
# All nodes with available raw devices will be used for the Ceph cluster. At least three nodes are required
# in this example. See the documentation for more details on storage settings available.

# For example, to create the cluster:
#   kubectl create -f crds.yaml -f common.yaml -f operator.yaml
#   kubectl create -f cluster.yaml
#################################################################################################################

apiVersion: ceph.rook.io/v1
kind: CephCluster
metadata:
  name: rook-ceph
  namespace: rook-ceph # namespace:cluster
spec:
  cephVersion:
    # The container image used to launch the Ceph daemon pods (mon, mgr, osd, mds, rgw).
    # v15 is octopus, and v16 is pacific.
    # RECOMMENDATION: In production, use a specific version tag instead of the general v14 flag, which pulls the latest release and could result in different
    # versions running within the cluster. See tags available at https://hub.docker.com/r/ceph/ceph/tags/.
    # If you want to be more precise, you can always use a timestamp tag such quay.io/ceph/ceph:v16.2.7-20220216
    # This tag might not contain a new Ceph version, just security fixes from the underlying operating system, which will reduce vulnerabilities
    image: quay.io/ceph/ceph:v16.2.7
    # Whether to allow unsupported versions of Ceph. Currently `octopus` and `pacific` are supported.
    # Future versions such as `pacific` would require this to be set to `true`.
    # Do not set to true in production.
    allowUnsupported: false
  # The path on the host where configuration files will be persisted. Must be specified.
  # Important: if you reinstall the cluster, make sure you delete this directory from each host or else the mons will fail to start on the new cluster.
  # In Minikube, the '/data' directory is configured to persist across reboots. Use "/data/rook" in Minikube environment.
  dataDirHostPath: /var/lib/rook
  # Whether or not upgrade should continue even if a check fails
  # This means Ceph's status could be degraded and we don't recommend upgrading but you might decide otherwise
  # Use at your OWN risk
  # To understand Rook's upgrade process of Ceph, read https://rook.io/docs/rook/latest/ceph-upgrade.html#ceph-version-upgrades
  skipUpgradeChecks: false
  # Whether or not continue if PGs are not clean during an upgrade
  continueUpgradeAfterChecksEvenIfNotHealthy: false
  # WaitTimeoutForHealthyOSDInMinutes defines the time (in minutes) the operator would wait before an OSD can be stopped for upgrade or restart.
  # If the timeout exceeds and OSD is not ok to stop, then the operator would skip upgrade for the current OSD and proceed with the next one
  # if `continueUpgradeAfterChecksEvenIfNotHealthy` is `false`. If `continueUpgradeAfterChecksEvenIfNotHealthy` is `true`, then opertor would
  # continue with the upgrade of an OSD even if its not ok to stop after the timeout. This timeout won't be applied if `skipUpgradeChecks` is `true`.
  # The default wait timeout is 10 minutes.
  waitTimeoutForHealthyOSDInMinutes: 10
  mon:
    # Set the number of mons to be started. Generally recommended to be 3.
    # For highest availability, an odd number of mons should be specified.
    count: 3
    # The mons should be on unique nodes. For production, at least 3 nodes are recommended for this reason.
    # Mons should only be allowed on the same node for test environments where data loss is acceptable.
    allowMultiplePerNode: false
  mgr:
    # When higher availability of the mgr is needed, increase the count to 2.
    # In that case, one mgr will be active and one in standby. When Ceph updates which
    # mgr is active, Rook will update the mgr services to match the active mgr.
    count: 2
    allowMultiplePerNode: false
    modules:
      # Several modules should not need to be included in this list. The "dashboard" and "monitoring" modules
      # are already enabled by other settings in the cluster CR.
      - name: pg_autoscaler
        enabled: true
  # enable the ceph dashboard for viewing cluster status
  dashboard:
    enabled: false
    # serve the dashboard under a subpath (useful when you are accessing the dashboard via a reverse proxy)
    # urlPrefix: /ceph-dashboard
    # serve the dashboard at the given port.
    # port: 8443
    # serve the dashboard using SSL
    ssl: true
  # enable prometheus alerting for cluster
  monitoring:
    # requires Prometheus to be pre-installed
    enabled: true
  network:
    connections:
      # Whether to encrypt the data in transit across the wire to prevent eavesdropping the data on the network.
      # The default is false. When encryption is enabled, all communication between clients and Ceph daemons, or between Ceph daemons will be encrypted.
      # When encryption is not enabled, clients still establish a strong initial authentication and data integrity is still validated with a crc check.
      # IMPORTANT: Encryption requires the 5.11 kernel for the latest nbd and cephfs drivers. Alternatively for testing only,
      # you can set the "mounter: rbd-nbd" in the rbd storage class, or "mounter: fuse" in the cephfs storage class.
      # The nbd and fuse drivers are *not* recommended in production since restarting the csi driver pod will disconnect the volumes.
      encryption:
        enabled: false
      # Whether to compress the data in transit across the wire. The default is false.
      # Requires Ceph Quincy (v17) or newer. Also see the kernel requirements above for encryption.
      compression:
        enabled: false
    # enable host networking
    #provider: host
    # enable the Multus network provider
    #provider: multus
    #selectors:
      # The selector keys are required to be `public` and `cluster`.
      # Based on the configuration, the operator will do the following:
      #   1. if only the `public` selector key is specified both public_network and cluster_network Ceph settings will listen on that interface
      #   2. if both `public` and `cluster` selector keys are specified the first one will point to 'public_network' flag and the second one to 'cluster_network'
      #
      # In order to work, each selector value must match a NetworkAttachmentDefinition object in Multus
      #
      #public: public-conf --> NetworkAttachmentDefinition object name in Multus
      #cluster: cluster-conf --> NetworkAttachmentDefinition object name in Multus
    # Provide internet protocol version. IPv6, IPv4 or empty string are valid options. Empty string would mean IPv4
    #ipFamily: "IPv6"
    # Ceph daemons to listen on both IPv4 and Ipv6 networks
    #dualStack: false
  # enable the crash collector for ceph daemon crash collection
  crashCollector:
    disable: false
    # Uncomment daysToRetain to prune ceph crash entries older than the
    # specified number of days.
    #daysToRetain: 30
  # enable log collector, daemons will log on files and rotate
  # logCollector:
  #   enabled: true
  #   periodicity: 24h # SUFFIX may be 'h' for hours or 'd' for days.
  # automate [data cleanup process](https://github.com/rook/rook/blob/master/Documentation/ceph-teardown.md#delete-the-data-on-hosts) in cluster destruction.
  cleanupPolicy:
    # Since cluster cleanup is destructive to data, confirmation is required.
    # To destroy all Rook data on hosts during uninstall, confirmation must be set to "yes-really-destroy-data".
    # This value should only be set when the cluster is about to be deleted. After the confirmation is set,
    # Rook will immediately stop configuring the cluster and only wait for the delete command.
    # If the empty string is set, Rook will not destroy any data on hosts during uninstall.
    confirmation: ""
    # sanitizeDisks represents settings for sanitizing OSD disks on cluster deletion
    sanitizeDisks:
      # method indicates if the entire disk should be sanitized or simply ceph's metadata
      # in both case, re-install is possible
      # possible choices are 'complete' or 'quick' (default)
      method: quick
      # dataSource indicate where to get random bytes from to write on the disk
      # possible choices are 'zero' (default) or 'random'
      # using random sources will consume entropy from the system and will take much more time then the zero source
      dataSource: zero
      # iteration overwrite N times instead of the default (1)
      # takes an integer value
      iteration: 1
    # allowUninstallWithVolumes defines how the uninstall should be performed
    # If set to true, cephCluster deletion does not wait for the PVs to be deleted.
    allowUninstallWithVolumes: false
  # To control where various services will be scheduled by kubernetes, use the placement configuration sections below.
  # The example under 'all' would have all services scheduled on kubernetes nodes labeled with 'role=storage-node' and
 # tolerate taints with a key of 'storage-node'.
  placement:
    all:
      nodeAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          nodeSelectorTerms:
          - matchExpressions:
            - key: "cephnode"
              operator: In
              values:
              - "true"
#      podAffinity:
#      podAntiAffinity:
#      topologySpreadConstraints:
#      tolerations:
#      - key: storage-node
#        operator: Exists
# The above placement information can also be specified for mon, osd, and mgr components
#    mon:
# Monitor deployments may contain an anti-affinity rule for avoiding monitor
# collocation on the same node. This is a required rule when host network is used
# or when AllowMultiplePerNode is false. Otherwise this anti-affinity rule is a
# preferred rule with weight: 50.
#    osd:
#    mgr:
#    cleanup:
  annotations:
#    all:
#    mon:
#    osd:
#    cleanup:
#    prepareosd:
# clusterMetadata annotations will be applied to only `rook-ceph-mon-endpoints` configmap and the `rook-ceph-mon` and `rook-ceph-admin-keyring` secrets.
# And clusterMetadata annotations will not be merged with `all` annotations.
#    clusterMetadata:
#       kubed.appscode.com/sync: "true"
# If no mgr annotations are set, prometheus scrape annotations will be set by default.
#    mgr:
  labels:
#    all:
#    mon:
#    osd:
#    cleanup:
#    mgr:
#    prepareosd:
# monitoring is a list of key-value pairs. It is injected into all the monitoring resources created by operator.
# These labels can be passed as LabelSelector to Prometheus
#    monitoring:
#    crashcollector:
  resources:
# The requests and limits set here, allow the mgr pod to use half of one CPU core and 1 gigabyte of memory
#    mgr:
#      limits:
#        cpu: "500m"
#        memory: "1024Mi"
#      requests:
#        cpu: "500m"
#        memory: "1024Mi"
# The above example requests/limits can also be added to the other components
#    mon:
#    osd:
# For OSD it also is a possible to specify requests/limits based on device class
#    osd-hdd:
#    osd-ssd:
#    osd-nvme:
#    prepareosd:
#    mgr-sidecar:
#    crashcollector:
#    logcollector:
#    cleanup:
  # The option to automatically remove OSDs that are out and are safe to destroy.
  removeOSDsIfOutAndSafeToRemove: false
  priorityClassNames:
    #all: rook-ceph-default-priority-class
    mon: system-node-critical
    osd: system-node-critical
    mgr: system-cluster-critical
    #crashcollector: rook-ceph-crashcollector-priority-class
  storage: # cluster level storage configuration and selection
    useAllNodes: true
    useAllDevices: false
    deviceFilter: "^sdb"
    config:
      # crushRoot: "custom-root" # specify a non-default root label for the CRUSH map
      # metadataDevice: "md0" # specify a non-rotational storage so ceph-volume will use it as block db device of bluestore.
      # databaseSizeMB: "1024" # uncomment if the disks are smaller than 100 GB
      # journalSizeMB: "1024"  # uncomment if the disks are 20 GB or smaller
      # osdsPerDevice: "1" # this value can be overridden at the node or device level
      # encryptedDevice: "true" # the default value for this option is "false"
# Individual nodes and their config can be specified as well, but 'useAllNodes' above must be set to false. Then, only the named
# nodes below will be used as storage resources.  Each node's 'name' field should match their 'kubernetes.io/hostname' label.
    # nodes:
    #   - name: "172.17.4.201"
    #     devices: # specific devices to use for storage can be specified for each node
    #       - name: "sdb"
    #       - name: "nvme01" # multiple osds can be created on high performance devices
    #         config:
    #           osdsPerDevice: "5"
    #       - name: "/dev/disk/by-id/ata-ST4000DM004-XXXX" # devices can be specified using full udev paths
    #     config: # configuration can be specified at the node level which overrides the cluster level config
    #   - name: "172.17.4.301"
    #     deviceFilter: "^sd."
    # when onlyApplyOSDPlacement is false, will merge both placement.All() and placement.osd
    onlyApplyOSDPlacement: false
  # The section for configuring management of daemon disruptions during upgrade or fencing.
  disruptionManagement:
    # If true, the operator will create and manage PodDisruptionBudgets for OSD, Mon, RGW, and MDS daemons. OSD PDBs are managed dynamically
    # via the strategy outlined in the [design](https://github.com/rook/rook/blob/master/design/ceph/ceph-managed-disruptionbudgets.md). The operator will
    # block eviction of OSDs by default and unblock them safely when drains are detected.
    managePodBudgets: true
    # A duration in minutes that determines how long an entire failureDomain like `region/zone/host` will be held in `noout` (in addition to the
    # default DOWN/OUT interval) when it is draining. This is only relevant when  `managePodBudgets` is `true`. The default value is `30` minutes.
    osdMaintenanceTimeout: 30
    # A duration in minutes that the operator will wait for the placement groups to become healthy (active+clean) after a drain was completed and OSDs came back up.
    # Operator will continue with the next drain if the timeout exceeds. It only works if `managePodBudgets` is `true`.
    # No values or 0 means that the operator will wait until the placement groups are healthy before unblocking the next drain.
    pgHealthCheckTimeout: 0
    # If true, the operator will create and manage MachineDisruptionBudgets to ensure OSDs are only fenced when the cluster is healthy.
    # Only available on OpenShift.
    manageMachineDisruptionBudgets: false
    # Namespace in which to watch for the MachineDisruptionBudgets.
    machineDisruptionBudgetNamespace: openshift-machine-api

  # healthChecks
  # Valid values for daemons are 'mon', 'osd', 'status'
  healthCheck:
    daemonHealth:
      mon:
        disabled: false
        interval: 45s
      osd:
        disabled: false
        interval: 60s
      status:
        disabled: false
        interval: 60s
    # Change pod liveness probe timing or threshold values. Works for all mon,mgr,osd daemons.
    livenessProbe:
      mon:
        disabled: false
      mgr:
        disabled: false
      osd:
        disabled: false
    # Change pod startup probe timing or threshold values. Works for all mon,mgr,osd daemons.
    startupProbe:
      mon:
        disabled: false
      mgr:
        disabled: false
      osd:
        disabled: false

```

**Grafana dashboard**

Add the ceph-cluster dashboard to the Grafana configmap.

```yaml
# ceph-cluster-prometheus-grafana-configmap.yml
---
apiVersion: v1
data:
  ceph-cluster.json: |-
    {
      "annotations": {
        "list": [
          {
            "builtIn": 1,
            "datasource": "-- Grafana --",
            "enable": true,
            "hide": true,
            "iconColor": "rgba(0, 211, 255, 1)",
            "name": "Annotations & Alerts",
            "target": {
              "limit": 100,
              "matchAny": false,
              "tags": [],
              "type": "dashboard"
            },
            "type": "dashboard"
          }
        ]
      },
      "description": "Ceph Cluster overview.\r\n",
      "editable": true,
      "fiscalYearStartMonth": 0,
      "gnetId": 2842,
      "graphTooltip": 0,
      "id": 27,
      "iteration": 1651392297382,
      "links": [],
      "liveNow": false,
      "panels": [
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 0
          },
          "id": 37,
          "panels": [],
          "title": "CLUSTER STATE",
          "type": "row"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "0": {
                      "text": "HEALTHY"
                    },
                    "1": {
                      "text": "WARNING"
                    },
                    "2": {
                      "text": "ERROR"
                    }
                  },
                  "type": "value"
                },
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "#9ac48a",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 1
                  },
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": 2
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 0,
            "y": 1
          },
          "id": 21,
          "interval": "1m",
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "center",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance) (ceph_health_status{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": " ",
              "refId": "A",
              "step": 300
            }
          ],
          "transparent": true,
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 1,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "Bps"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 3,
            "y": 1
          },
          "id": 92,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_op_w_in_bytes{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Write Throughput",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 1,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "Bps"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 6,
            "y": 1
          },
          "id": 93,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (ceph_daemon, instance) (irate(ceph_osd_op_r_out_bytes{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Read Throughput",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(255, 255, 255, 0.97)",
                    "value": null
                  }
                ]
              },
              "unit": "decbytes"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 9,
            "y": 1
          },
          "id": 33,
          "interval": "1m",
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "area",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance) (ceph_cluster_total_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Cluster Capacity",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "max": 1,
              "min": 0,
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 0.1
                  },
                  {
                    "color": "rgba(50, 172, 45, 0.97)",
                    "value": 0.3
                  }
                ]
              },
              "unit": "percentunit"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 6,
            "w": 3,
            "x": 12,
            "y": 1
          },
          "id": 23,
          "interval": "1m",
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "showThresholdLabels": false,
            "showThresholdMarkers": true
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance) ((ceph_cluster_total_bytes{cluster=\"$cluster\"}-ceph_cluster_total_used_bytes{cluster=\"$cluster\"})/ceph_cluster_total_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Available Capacity",
          "type": "gauge"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "dark-yellow",
                    "value": 75000000
                  },
                  {
                    "color": "dark-red",
                    "value": 100000000
                  }
                ]
              },
              "unit": "short"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 15,
            "y": 1
          },
          "id": 48,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, pool_id) (ceph_pool_objects{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Number of Objects",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 1,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "decbytes"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 18,
            "y": 1
          },
          "id": 99,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "delta"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (ceph_osd_op_w_in_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Bytes Written",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 1,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "decbytes"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 21,
            "y": 1
          },
          "id": 100,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "delta"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (ceph_osd_op_r_out_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Bytes Read",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "#9ac48a",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 1
                  },
                  {
                    "color": "#e24d42",
                    "value": 1
                  }
                ]
              },
              "unit": "short"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 0,
            "y": 4
          },
          "id": 75,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "count(ALERTS{cluster='$cluster',alertstate='firing',alertname=~'^CephCluster.*'}) OR vector(0)",
              "format": "time_series",
              "instant": true,
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Alerts",
          "transparent": true,
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 2,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "ops"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 3,
            "y": 4
          },
          "id": 97,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (ceph_daemon, instance) (irate(ceph_osd_op_w{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Write IOPS",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "decimals": 2,
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgb(255, 255, 255)",
                    "value": null
                  }
                ]
              },
              "unit": "ops"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 6,
            "y": 4
          },
          "id": 96,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (ceph_daemon, instance) (irate(ceph_osd_op_r{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Read IOPS",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(255, 255, 255, 0.97)",
                    "value": null
                  }
                ]
              },
              "unit": "decbytes"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 9,
            "y": 4
          },
          "id": 34,
          "interval": "1m",
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "area",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance) (ceph_cluster_total_used_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Used Capacity",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "red",
                    "value": 80
                  }
                ]
              },
              "unit": "short"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 18,
            "y": 4
          },
          "id": 102,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (ceph_mon_num_sessions{cluster='$cluster'})",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Mon Session Num",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 2
                  },
                  {
                    "color": "green",
                    "value": 3
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 21,
            "y": 4
          },
          "id": 14,
          "interval": "1m",
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "count without (instance, ceph_daemon) (ceph_mon_quorum_status{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Monitors In Quorum",
          "type": "stat"
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 7
          },
          "id": 38,
          "panels": [],
          "title": "OSD STATE",
          "type": "row"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "#9ac48a",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 40, 40, 0.89)",
                    "value": 1
                  },
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": 1
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 2,
            "x": 0,
            "y": 8
          },
          "id": 27,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "count without (instance, ceph_daemon) (ceph_osd_up{cluster=\"$cluster\"}) - count without (instance, ceph_daemon) (ceph_osd_in{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "OSDs OUT",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(50, 172, 45, 0.97)",
                    "value": null
                  },
                  {
                    "color": "#eab839",
                    "value": 1
                  },
                  {
                    "color": "#ea6460",
                    "value": 1
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 2,
            "x": 2,
            "y": 8
          },
          "id": 29,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "count(ceph_osd_up{cluster=\"$cluster\"} == 0.0) OR vector(0)",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "OSDs DOWN",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "red",
                    "value": 80
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 2,
            "x": 4,
            "y": 8
          },
          "id": 28,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (ceph_osd_up{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "OSDs UP",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "red",
                    "value": 80
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 2,
            "x": 6,
            "y": 8
          },
          "id": 26,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (ceph_osd_in{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "OSDs IN",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(50, 172, 45, 0.97)",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 250
                  },
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": 300
                  }
                ]
              },
              "unit": "none"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 2,
            "x": 8,
            "y": 8
          },
          "id": 30,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "avg without (instance, ceph_daemon) (ceph_osd_numpg{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Avg PGs",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(50, 172, 45, 0.97)",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 10
                  },
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": 50
                  }
                ]
              },
              "unit": "ms"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 10,
            "y": 8
          },
          "id": 31,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "avg without (instance, ceph_daemon) (ceph_osd_apply_latency_ms{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Avg Apply Latency",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "rgba(50, 172, 45, 0.97)",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 10
                  },
                  {
                    "color": "rgba(245, 54, 54, 0.9)",
                    "value": 50
                  }
                ]
              },
              "unit": "ms"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 13,
            "y": 8
          },
          "id": 32,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "avg(ceph_osd_commit_latency_ms{cluster=\"$cluster\"})",
              "format": "time_series",
              "instant": true,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A",
              "step": 300
            }
          ],
          "title": "Avg Commit Latency",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "color": "#299c46",
                      "text": "0"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "#299c46",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 1
                  },
                  {
                    "color": "#d44a3a",
                    "value": 2
                  }
                ]
              },
              "unit": "ms"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 16,
            "y": 8
          },
          "id": 51,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "avg without (instance, ceph_daemon) (rate(ceph_osd_op_w_latency_sum{cluster=\"$cluster\"}[5m]) / rate(ceph_osd_op_w_latency_count{cluster=\"$cluster\"}[5m]) >= 0)",
              "format": "time_series",
              "instant": false,
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Avg Op Write Latency",
          "type": "stat"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fieldConfig": {
            "defaults": {
              "mappings": [
                {
                  "options": {
                    "match": "null",
                    "result": {
                      "text": "N/A"
                    }
                  },
                  "type": "special"
                }
              ],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "#299c46",
                    "value": null
                  },
                  {
                    "color": "rgba(237, 129, 40, 0.89)",
                    "value": 1
                  },
                  {
                    "color": "#d44a3a",
                    "value": 2
                  }
                ]
              },
              "unit": "ms"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 3,
            "w": 3,
            "x": 19,
            "y": 8
          },
          "id": 50,
          "links": [],
          "maxDataPoints": 100,
          "options": {
            "colorMode": "value",
            "graphMode": "none",
            "justifyMode": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": [
                "lastNotNull"
              ],
              "fields": "",
              "values": false
            },
            "textMode": "auto"
          },
          "pluginVersion": "8.4.5",
          "targets": [
            {
              "expr": "avg without (instance, ceph_daemon) (rate(ceph_osd_op_r_latency_sum{cluster=\"$cluster\"}[5m])/rate(ceph_osd_op_r_latency_count{cluster=\"$cluster\"}[5m]) >= 0)",
              "format": "time_series",
              "instant": true,
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "Avg  Op Read Latency",
          "type": "stat"
        },
        {
          "collapsed": true,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 11
          },
          "id": 53,
          "panels": [
            {
              "columns": [],
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fontSize": "100%",
              "gridPos": {
                "h": 6,
                "w": 8,
                "x": 0,
                "y": 12
              },
              "id": 70,
              "links": [],
              "scroll": true,
              "showHeader": true,
              "sort": {
                "col": 0,
                "desc": true
              },
              "styles": [
                {
                  "alias": "Time",
                  "align": "auto",
                  "dateFormat": "YYYY-MM-DD HH:mm:ss",
                  "pattern": "Time",
                  "type": "date"
                },
                {
                  "alias": "",
                  "align": "auto",
                  "colors": [
                    "rgba(245, 54, 54, 0.9)",
                    "rgba(237, 129, 40, 0.89)",
                    "rgba(50, 172, 45, 0.97)"
                  ],
                  "decimals": 2,
                  "pattern": "/.*/",
                  "thresholds": [],
                  "type": "number",
                  "unit": "short"
                }
              ],
              "targets": [
                {
                  "expr": "ALERTS{cluster='$cluster', alertstate='firing'}",
                  "format": "table",
                  "instant": true,
                  "intervalFactor": 1,
                  "legendFormat": "",
                  "refId": "A"
                }
              ],
              "title": "Alerts from CephThanos",
              "transform": "table",
              "type": "table-old"
            },
            {
              "columns": [],
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fontSize": "100%",
              "gridPos": {
                "h": 6,
                "w": 8,
                "x": 8,
                "y": 12
              },
              "id": 105,
              "links": [],
              "scroll": true,
              "showHeader": true,
              "sort": {
                "col": 5,
                "desc": true
              },
              "styles": [
                {
                  "alias": "Time",
                  "align": "auto",
                  "dateFormat": "YYYY-MM-DD HH:mm:ss",
                  "pattern": "Time",
                  "type": "date"
                },
                {
                  "alias": "",
                  "align": "auto",
                  "colors": [
                    "rgba(245, 54, 54, 0.9)",
                    "rgba(237, 129, 40, 0.89)",
                    "rgba(50, 172, 45, 0.97)"
                  ],
                  "decimals": 2,
                  "pattern": "/.*/",
                  "thresholds": [],
                  "type": "number",
                  "unit": "short"
                }
              ],
              "targets": [
                {
                  "expr": "topk(5,sort_desc(ceph_osd_apply_latency_ms{cluster='$cluster'} + ceph_osd_commit_latency_ms{cluster='$cluster'}))",
                  "format": "table",
                  "instant": true,
                  "intervalFactor": 1,
                  "refId": "A",
                  "target": ""
                }
              ],
              "title": "Top Sluggish OSD's",
              "transform": "table",
              "type": "table-old"
            },
            {
              "columns": [],
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fontSize": "100%",
              "gridPos": {
                "h": 6,
                "w": 8,
                "x": 16,
                "y": 12
              },
              "id": 103,
              "links": [],
              "scroll": true,
              "showHeader": true,
              "sort": {
                "col": 0,
                "desc": true
              },
              "styles": [
                {
                  "alias": "Time",
                  "align": "auto",
                  "dateFormat": "YYYY-MM-DD HH:mm:ss",
                  "pattern": "Time",
                  "type": "date"
                },
                {
                  "alias": "",
                  "align": "auto",
                  "colors": [
                    "rgba(245, 54, 54, 0.9)",
                    "rgba(237, 129, 40, 0.89)",
                    "rgba(50, 172, 45, 0.97)"
                  ],
                  "decimals": 2,
                  "pattern": "/.*/",
                  "thresholds": [],
                  "type": "number",
                  "unit": "short"
                }
              ],
              "targets": [
                {
                  "expr": "ceph_osd_up{cluster=\"$cluster\"} == 0",
                  "format": "table",
                  "instant": true,
                  "intervalFactor": 1,
                  "legendFormat": "",
                  "refId": "A"
                }
              ],
              "title": "Down OSD's",
              "transform": "table",
              "type": "table-old"
            }
          ],
          "title": "Alerts",
          "type": "row"
        },
        {
          "collapsed": true,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 12
          },
          "id": 108,
          "panels": [
            {
              "aliasColors": {},
              "bars": false,
              "dashLength": 10,
              "dashes": false,
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fill": 1,
              "fillGradient": 0,
              "gridPos": {
                "h": 9,
                "w": 6,
                "x": 0,
                "y": 13
              },
              "hiddenSeries": false,
              "id": 110,
              "legend": {
                "avg": false,
                "current": false,
                "max": false,
                "min": false,
                "show": true,
                "total": false,
                "values": false
              },
              "lines": true,
              "linewidth": 1,
              "links": [],
              "nullPointMode": "null",
              "options": {
                "alertThreshold": true
              },
              "percentage": false,
              "pluginVersion": "7.2.0",
              "pointradius": 5,
              "points": false,
              "renderer": "flot",
              "seriesOverrides": [],
              "spaceLength": 10,
              "stack": false,
              "steppedLine": false,
              "targets": [
                {
                  "expr": "count by (ceph_version) (ceph_osd_metadata{cluster='$cluster'})",
                  "format": "time_series",
                  "interval": "",
                  "intervalFactor": 1,
                  "legendFormat": "{{ ceph_version }}",
                  "refId": "A",
                  "target": ""
                }
              ],
              "thresholds": [],
              "timeRegions": [],
              "title": "Ceph OSD Versions",
              "tooltip": {
                "shared": true,
                "sort": 0,
                "value_type": "individual"
              },
              "type": "graph",
              "xaxis": {
                "mode": "time",
                "show": true,
                "values": []
              },
              "yaxes": [
                {
                  "decimals": 0,
                  "format": "short",
                  "logBase": 1,
                  "show": true
                },
                {
                  "format": "short",
                  "logBase": 1,
                  "show": true
                }
              ],
              "yaxis": {
                "align": false
              }
            },
            {
              "aliasColors": {},
              "bars": false,
              "dashLength": 10,
              "dashes": false,
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fill": 1,
              "fillGradient": 0,
              "gridPos": {
                "h": 9,
                "w": 6,
                "x": 6,
                "y": 13
              },
              "hiddenSeries": false,
              "id": 111,
              "legend": {
                "avg": false,
                "current": false,
                "max": false,
                "min": false,
                "show": true,
                "total": false,
                "values": false
              },
              "lines": true,
              "linewidth": 1,
              "links": [],
              "nullPointMode": "null",
              "options": {
                "alertThreshold": true
              },
              "percentage": false,
              "pluginVersion": "7.2.0",
              "pointradius": 5,
              "points": false,
              "renderer": "flot",
              "seriesOverrides": [],
              "spaceLength": 10,
              "stack": false,
              "steppedLine": false,
              "targets": [
                {
                  "expr": "count by (ceph_version)(ceph_mon_metadata{cluster='$cluster'})",
                  "format": "time_series",
                  "interval": "",
                  "intervalFactor": 1,
                  "legendFormat": "{{ ceph_version }}",
                  "refId": "A",
                  "target": ""
                }
              ],
              "thresholds": [],
              "timeRegions": [],
              "title": "Ceph Mon Versions",
              "tooltip": {
                "shared": true,
                "sort": 0,
                "value_type": "individual"
              },
              "type": "graph",
              "xaxis": {
                "mode": "time",
                "show": true,
                "values": []
              },
              "yaxes": [
                {
                  "decimals": 0,
                  "format": "short",
                  "label": "",
                  "logBase": 1,
                  "show": true
                },
                {
                  "format": "short",
                  "logBase": 1,
                  "show": true
                }
              ],
              "yaxis": {
                "align": false
              }
            },
            {
              "aliasColors": {},
              "bars": false,
              "dashLength": 10,
              "dashes": false,
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fill": 1,
              "fillGradient": 0,
              "gridPos": {
                "h": 9,
                "w": 6,
                "x": 12,
                "y": 13
              },
              "hiddenSeries": false,
              "id": 112,
              "legend": {
                "avg": false,
                "current": false,
                "max": false,
                "min": false,
                "show": true,
                "total": false,
                "values": false
              },
              "lines": true,
              "linewidth": 1,
              "links": [],
              "nullPointMode": "null",
              "options": {
                "alertThreshold": true
              },
              "percentage": false,
              "pluginVersion": "7.2.0",
              "pointradius": 5,
              "points": false,
              "renderer": "flot",
              "seriesOverrides": [],
              "spaceLength": 10,
              "stack": false,
              "steppedLine": false,
              "targets": [
                {
                  "expr": "count by (ceph_version)(ceph_mds_metadata{cluster='$cluster'})",
                  "format": "time_series",
                  "interval": "",
                  "intervalFactor": 1,
                  "legendFormat": "{{ ceph_version }}",
                  "refId": "A",
                  "target": ""
                }
              ],
              "thresholds": [],
              "timeRegions": [],
              "title": "Ceph MDS Versions",
              "tooltip": {
                "shared": true,
                "sort": 0,
                "value_type": "individual"
              },
              "type": "graph",
              "xaxis": {
                "mode": "time",
                "show": true,
                "values": []
              },
              "yaxes": [
                {
                  "decimals": 0,
                  "format": "short",
                  "label": "",
                  "logBase": 1,
                  "show": true
                },
                {
                  "format": "short",
                  "logBase": 1,
                  "show": true
                }
              ],
              "yaxis": {
                "align": false
              }
            },
            {
              "aliasColors": {},
              "bars": false,
              "dashLength": 10,
              "dashes": false,
              "datasource": {
                "type": "prometheus",
                "uid": "prometheus"
              },
              "fieldConfig": {
                "defaults": {
                  "custom": {}
                },
                "overrides": []
              },
              "fill": 1,
              "fillGradient": 0,
              "gridPos": {
                "h": 9,
                "w": 6,
                "x": 18,
                "y": 13
              },
              "hiddenSeries": false,
              "id": 113,
              "legend": {
                "avg": false,
                "current": false,
                "max": false,
                "min": false,
                "show": true,
                "total": false,
                "values": false
              },
              "lines": true,
              "linewidth": 1,
              "links": [],
              "nullPointMode": "null",
              "options": {
                "alertThreshold": true
              },
              "percentage": false,
              "pluginVersion": "7.2.0",
              "pointradius": 5,
              "points": false,
              "renderer": "flot",
              "seriesOverrides": [],
              "spaceLength": 10,
              "stack": false,
              "steppedLine": false,
              "targets": [
                {
                  "expr": "count by (ceph_version)(ceph_rgw_metadata{cluster='$cluster'})",
                  "format": "time_series",
                  "interval": "",
                  "intervalFactor": 1,
                  "legendFormat": "{{ ceph_version }}",
                  "refId": "A",
                  "target": ""
                }
              ],
              "thresholds": [],
              "timeRegions": [],
              "title": "Ceph RGW Versions",
              "tooltip": {
                "shared": true,
                "sort": 0,
                "value_type": "individual"
              },
              "type": "graph",
              "xaxis": {
                "mode": "time",
                "show": true,
                "values": []
              },
              "yaxes": [
                {
                  "decimals": 0,
                  "format": "short",
                  "label": "",
                  "logBase": 1,
                  "show": true
                },
                {
                  "format": "short",
                  "logBase": 1,
                  "show": true
                }
              ],
              "yaxis": {
                "align": false
              }
            }
          ],
          "title": "Ceph Versions",
          "type": "row"
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 13
          },
          "id": 39,
          "panels": [],
          "title": "CLUSTER",
          "type": "row"
        },
        {
          "aliasColors": {
            "Available": "#EAB839",
            "Total Capacity": "#447EBC",
            "Used": "#BF1B00",
            "total_avail": "#6ED0E0",
            "total_space": "#7EB26D",
            "total_used": "#890F02"
          },
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 4,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 8,
            "w": 8,
            "x": 0,
            "y": 14
          },
          "height": "300",
          "hiddenSeries": false,
          "id": 1,
          "interval": "$interval",
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": true,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 0,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [
            {
              "alias": "Total Capacity",
              "fill": 0,
              "linewidth": 3,
              "stack": false
            }
          ],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance) (ceph_cluster_total_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Total Capacity",
              "refId": "C",
              "step": 300
            },
            {
              "expr": "sum without (instance) (ceph_cluster_total_bytes{cluster=\"$cluster\"}-ceph_cluster_total_used_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Available",
              "refId": "A",
              "step": 300
            },
            {
              "expr": "sum without (instance) (ceph_cluster_total_used_bytes{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Used",
              "refId": "B",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Capacity",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 2,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:905",
              "format": "bytes",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:906",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {
            "Total Capacity": "#7EB26D",
            "Used": "#BF1B00",
            "total_avail": "#6ED0E0",
            "total_space": "#7EB26D",
            "total_used": "#890F02"
          },
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "decimals": 0,
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 8,
            "w": 8,
            "x": 8,
            "y": 14
          },
          "height": "300",
          "hiddenSeries": false,
          "id": 3,
          "interval": "$interval",
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_op_w{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Write",
              "refId": "A",
              "step": 300
            },
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_op_r{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Read",
              "refId": "B",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "IOPS",
          "tooltip": {
            "msResolution": true,
            "shared": true,
            "sort": 2,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2411",
              "format": "none",
              "label": "",
              "logBase": 1,
              "min": 0,
              "show": true
            },
            {
              "$$hashKey": "object:2412",
              "format": "short",
              "logBase": 1,
              "min": 0,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 8,
            "w": 8,
            "x": 16,
            "y": 14
          },
          "height": "300",
          "hiddenSeries": false,
          "id": 7,
          "interval": "$interval",
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_op_w_in_bytes{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Write",
              "refId": "A",
              "step": 300
            },
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_op_r_out_bytes{cluster=\"$cluster\"}[5m]))",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Read",
              "refId": "B",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Throughput",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 2,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2382",
              "format": "decbytes",
              "logBase": 1,
              "min": 0,
              "show": true
            },
            {
              "$$hashKey": "object:2383",
              "format": "short",
              "logBase": 1,
              "min": 0,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "description": "",
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 8,
            "w": 8,
            "x": 0,
            "y": 22
          },
          "hiddenSeries": false,
          "id": 78,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum((ceph_pool_num_bytes_recovered{cluster='$cluster'}) *on (instance, pool_id) group_left(name)(ceph_pool_metadata{cluster='$cluster'})) by (name)",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{name}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Pool Bytes Recovered",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2148",
              "format": "bytes",
              "label": "",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:2149",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "description": "",
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 8,
            "w": 7,
            "x": 8,
            "y": 22
          },
          "hiddenSeries": false,
          "id": 114,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, pool_id) ((ceph_pool_num_objects_recovered{cluster='$cluster'}) *on (instance, pool_id) group_left(name)(ceph_pool_metadata{cluster='$cluster'}))",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{name}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Pool Objects Recovered",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2148",
              "format": "short",
              "label": "",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:2149",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 8,
            "w": 9,
            "x": 15,
            "y": 22
          },
          "hiddenSeries": false,
          "id": 79,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": false,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance) ((ceph_pool_objects{cluster='$cluster'}) *on (instance, pool_id) group_left(name)(ceph_pool_metadata{cluster='$cluster'}))",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{name}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Objects Per Pool",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:795",
              "format": "short",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:796",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 7,
            "w": 8,
            "x": 0,
            "y": 30
          },
          "hiddenSeries": false,
          "id": 80,
          "legend": {
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "show": true,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance) ((ceph_pool_quota_bytes{cluster='$cluster'}) *on (instance, pool_id) group_left(name)(ceph_pool_metadata{cluster='$cluster'}))",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{name}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Pool Quota Bytes",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:685",
              "format": "bytes",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:686",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 7,
            "w": 8,
            "x": 8,
            "y": 30
          },
          "hiddenSeries": false,
          "id": 81,
          "legend": {
            "alignAsTable": false,
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance) (ceph_pool_quota_objects{cluster='$cluster'}) *on (instance, pool_id) group_left(name)(ceph_pool_metadata{cluster='$cluster'})",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{name}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Pool Objects Quota",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:656",
              "format": "short",
              "logBase": 1,
              "min": "0",
              "show": true
            },
            {
              "$$hashKey": "object:657",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 7,
            "w": 8,
            "x": 16,
            "y": 30
          },
          "hiddenSeries": false,
          "id": 106,
          "legend": {
            "alignAsTable": false,
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "count without (instance, ceph_daemon) (ceph_bluestore_commit_lat_count{cluster='$cluster'})",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "BlueStore",
              "refId": "A"
            },
            {
              "expr": "count without (instance, ceph_daemon) (ceph_filestore_journal_latency_count{cluster='$cluster'})",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "FileStore",
              "refId": "B"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "OSD Type Count",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "short",
              "logBase": 1,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 37
          },
          "id": 41,
          "panels": [],
          "title": "OBJECTS",
          "type": "row"
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 12,
            "w": 6,
            "x": 0,
            "y": 38
          },
          "hiddenSeries": false,
          "id": 18,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "rightSide": false,
            "show": false,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 2,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [
            {
              "alias": "/^Total.*$/",
              "stack": false
            }
          ],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, pool_id) (ceph_pool_objects)",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Total",
              "refId": "A",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Objects in the Cluster",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 1,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "short",
              "logBase": 1,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 12,
            "w": 8,
            "x": 6,
            "y": 38
          },
          "hiddenSeries": false,
          "id": 19,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": true,
            "max": false,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 2,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [
            {
              "alias": "/^Total.*$/",
              "stack": false
            }
          ],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_active{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Active",
              "refId": "M"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_clean{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Clean",
              "refId": "U"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_peering{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Peering",
              "refId": "I"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_degraded{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Degraded",
              "refId": "B",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_stale{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Stale",
              "refId": "C",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_unclean_pgs{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Unclean",
              "refId": "D",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_undersized{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Undersized",
              "refId": "E",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_incomplete{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Incomplete",
              "refId": "G"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_forced_backfill{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Forced Backfill",
              "refId": "H"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_inconsistent{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Inconsistent",
              "refId": "F"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_forced_recovery{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Forced Recovery",
              "refId": "J"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_creating{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Creating",
              "refId": "K"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_wait_backfill{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Wait Backfill",
              "refId": "L"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_deep{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Deep",
              "refId": "N"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_scrubbing{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Scrubbing",
              "refId": "O"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_recovering{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Recovering",
              "refId": "P"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_repair{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Repair",
              "refId": "Q"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_down{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Down",
              "refId": "R"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_peered{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Peered",
              "refId": "S"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_backfill{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Backfill",
              "refId": "T"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_remapped{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Remapped",
              "refId": "V"
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_backfill_toofull{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Backfill Toofull",
              "refId": "W"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "PGs State",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 1,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "short",
              "logBase": 2,
              "min": 0,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 6,
            "w": 10,
            "x": 14,
            "y": 38
          },
          "hiddenSeries": false,
          "id": 20,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": false,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 2,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [
            {
              "alias": "/^Total.*$/",
              "stack": false
            }
          ],
          "spaceLength": 10,
          "stack": true,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_degraded{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Degraded",
              "refId": "F",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_stale{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Stale",
              "refId": "A",
              "step": 300
            },
            {
              "expr": "sum without (instance, pool_id) (ceph_pg_undersized{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "Undersized",
              "refId": "B",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Stuck PGs",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 1,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "short",
              "logBase": 1,
              "min": 0,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "editable": true,
          "error": false,
          "fill": 1,
          "fillGradient": 0,
          "grid": {},
          "gridPos": {
            "h": 6,
            "w": 10,
            "x": 14,
            "y": 44
          },
          "hiddenSeries": false,
          "id": 15,
          "legend": {
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "show": false,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 2,
          "links": [],
          "nullPointMode": "connected",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum without (instance, ceph_daemon) (irate(ceph_osd_recovery_ops{cluster=\"$cluster\"}[$__rate_interval]))",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "OPS",
              "refId": "A",
              "step": 300
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Recovery Operations",
          "tooltip": {
            "msResolution": false,
            "shared": true,
            "sort": 0,
            "value_type": "cumulative"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2458",
              "format": "short",
              "logBase": 1,
              "min": 0,
              "show": true
            },
            {
              "$$hashKey": "object:2459",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 50
          },
          "id": 40,
          "panels": [],
          "title": "LATENCY",
          "type": "row"
        },
        {
          "cards": {},
          "color": {
            "cardColor": "#b4ff00",
            "colorScale": "sqrt",
            "colorScheme": "interpolateOranges",
            "exponent": 0.5,
            "mode": "opacity"
          },
          "dataFormat": "timeseries",
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 0,
            "y": 51
          },
          "heatmap": {},
          "hideZeroBuckets": false,
          "highlightCards": true,
          "id": 83,
          "legend": {
            "show": true
          },
          "links": [],
          "reverseYBuckets": false,
          "targets": [
            {
              "expr": "ceph_osd_apply_latency_ms{cluster='$cluster'}",
              "format": "time_series",
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "OSD Apply Latency Distribution",
          "tooltip": {
            "show": true,
            "showHistogram": false
          },
          "type": "heatmap",
          "xAxis": {
            "show": true
          },
          "xBucketSize": "",
          "yAxis": {
            "format": "ms",
            "logBase": 2,
            "min": "0",
            "show": true,
            "splitFactor": 1
          },
          "yBucketBound": "auto",
          "yBucketSize": 10
        },
        {
          "cards": {},
          "color": {
            "cardColor": "#65c5db",
            "colorScale": "sqrt",
            "colorScheme": "interpolateOranges",
            "exponent": 0.5,
            "mode": "opacity"
          },
          "dataFormat": "timeseries",
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 12,
            "y": 51
          },
          "heatmap": {},
          "hideZeroBuckets": false,
          "highlightCards": true,
          "id": 84,
          "legend": {
            "show": true
          },
          "links": [],
          "reverseYBuckets": false,
          "targets": [
            {
              "expr": "ceph_osd_commit_latency_ms{cluster='$cluster'}",
              "format": "time_series",
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "refId": "A"
            }
          ],
          "title": "OSD Commit Latency Distribution",
          "tooltip": {
            "show": true,
            "showHistogram": false
          },
          "type": "heatmap",
          "xAxis": {
            "show": true
          },
          "xBucketSize": "",
          "yAxis": {
            "format": "ms",
            "logBase": 2,
            "min": "0",
            "show": true
          },
          "yBucketBound": "auto"
        },
        {
          "cards": {},
          "color": {
            "cardColor": "#806eb7",
            "colorScale": "sqrt",
            "colorScheme": "interpolateOranges",
            "exponent": 0.5,
            "mode": "opacity"
          },
          "dataFormat": "timeseries",
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 0,
            "y": 59
          },
          "heatmap": {},
          "hideZeroBuckets": false,
          "highlightCards": true,
          "id": 85,
          "legend": {
            "show": true
          },
          "links": [],
          "reverseYBuckets": false,
          "targets": [
            {
              "expr": "rate(ceph_osd_op_r_latency_sum{cluster=\"$cluster\"}[5m]) / rate(ceph_osd_op_r_latency_count{cluster=\"$cluster\"}[5m]) >= 0",
              "format": "time_series",
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "refId": "A"
            }
          ],
          "title": "OSD Read Op Latency Distribution",
          "tooltip": {
            "show": true,
            "showHistogram": false
          },
          "type": "heatmap",
          "xAxis": {
            "show": true
          },
          "xBucketSize": "",
          "yAxis": {
            "decimals": 2,
            "format": "ms",
            "logBase": 2,
            "min": "0",
            "show": true
          },
          "yBucketBound": "auto"
        },
        {
          "cards": {},
          "color": {
            "cardColor": "#f9934e",
            "colorScale": "sqrt",
            "colorScheme": "interpolateOranges",
            "exponent": 0.5,
            "mode": "opacity"
          },
          "dataFormat": "timeseries",
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 12,
            "y": 59
          },
          "heatmap": {},
          "hideZeroBuckets": false,
          "highlightCards": true,
          "id": 86,
          "legend": {
            "show": true
          },
          "links": [],
          "reverseYBuckets": false,
          "targets": [
            {
              "expr": "rate(ceph_osd_op_w_latency_sum{cluster=\"$cluster\"}[5m]) / rate(ceph_osd_op_w_latency_count{cluster=\"$cluster\"}[5m]) >= 0",
              "format": "time_series",
              "hide": false,
              "instant": false,
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "title": "OSD Write Op Latency Distribution",
          "tooltip": {
            "show": true,
            "showHistogram": false
          },
          "type": "heatmap",
          "xAxis": {
            "show": true
          },
          "xBucketSize": "",
          "yAxis": {
            "decimals": 2,
            "format": "ms",
            "logBase": 2,
            "min": "0",
            "show": true
          },
          "yBucketBound": "auto"
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 7,
            "w": 12,
            "x": 0,
            "y": 67
          },
          "hiddenSeries": false,
          "id": 44,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "avg without (instance,ceph_daemon) (rate(ceph_osd_op_r_latency_sum{cluster=\"$cluster\"}[5m]) / rate(ceph_osd_op_r_latency_count{cluster=\"$cluster\"}[5m]) >= 0)",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "read",
              "refId": "A"
            },
            {
              "expr": "avg without (instance, ceph_daemon) (rate(ceph_osd_op_w_latency_sum{cluster=\"$cluster\"}[5m]) / rate(ceph_osd_op_w_latency_count{cluster=\"$cluster\"}[5m]) >= 0)",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "write",
              "refId": "B"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Avg OSD  Op  Latency",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "ms",
              "logBase": 1,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 7,
            "w": 12,
            "x": 12,
            "y": 67
          },
          "hiddenSeries": false,
          "id": 35,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": true,
            "hideEmpty": false,
            "max": true,
            "min": false,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 1,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "avg without (instance, ceph_daemon) (ceph_osd_apply_latency_ms{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "apply",
              "metric": "ceph_osd_perf_apply_latency_seconds",
              "refId": "A",
              "step": 4
            },
            {
              "expr": "avg without (instance, ceph_daemon) (ceph_osd_commit_latency_ms{cluster=\"$cluster\"})",
              "format": "time_series",
              "interval": "$interval",
              "intervalFactor": 1,
              "legendFormat": "commit",
              "metric": "ceph_osd_perf_commit_latency_seconds",
              "refId": "B",
              "step": 4
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "AVG OSD Apply + Commit Latency",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:1258",
              "format": "ms",
              "logBase": 1,
              "show": true
            },
            {
              "$$hashKey": "object:1259",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 74
          },
          "id": 61,
          "panels": [],
          "title": "Node Statistics (NodeExporter)",
          "type": "row"
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 0,
            "y": 75
          },
          "hiddenSeries": false,
          "id": 63,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": false,
            "max": true,
            "min": true,
            "rightSide": false,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "node_memory_Active_anon_bytes{cluster=\"$cluster\"}",
              "format": "time_series",
              "intervalFactor": 1,
              "legendFormat": "{{instance}}",
              "refId": "A"
            },
            {
              "expr": "sum without (instance) (node_memory_Active_anon_bytes{cluster='$cluster'})",
              "format": "time_series",
              "intervalFactor": 1,
              "legendFormat": "Cluster Memory Usage",
              "refId": "B"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Node Memory Usage",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2713",
              "format": "bytes",
              "logBase": 2,
              "show": true
            },
            {
              "$$hashKey": "object:2714",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 12,
            "y": 75
          },
          "hiddenSeries": false,
          "id": 64,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "avg by (instance) (irate(node_cpu_seconds_total{cluster='$cluster',mode!=\"idle\"}[$interval])) * 100",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{instance}}",
              "refId": "B"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Node CPU Usage",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2684",
              "format": "percent",
              "logBase": 2,
              "show": true
            },
            {
              "$$hashKey": "object:2685",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 0,
            "y": 84
          },
          "hiddenSeries": false,
          "id": 65,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum by (instance)(irate(node_disk_read_bytes_total{cluster='$cluster'}[$interval]))",
              "format": "time_series",
              "interval": "",
              "intervalFactor": 1,
              "legendFormat": "{{instance}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Node Out",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2742",
              "format": "decbytes",
              "logBase": 1,
              "show": true
            },
            {
              "$$hashKey": "object:2743",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 12,
            "y": 84
          },
          "hiddenSeries": false,
          "id": 66,
          "legend": {
            "alignAsTable": true,
            "avg": true,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "sum by (instance)(irate(node_disk_written_bytes_total{cluster='$cluster'}[$interval]))",
              "format": "time_series",
              "intervalFactor": 1,
              "legendFormat": "{{instance}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Node In",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "$$hashKey": "object:2771",
              "format": "decbytes",
              "logBase": 1,
              "show": true
            },
            {
              "$$hashKey": "object:2772",
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        },
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": {
            "type": "prometheus",
            "uid": "prometheus"
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 9,
            "w": 12,
            "x": 0,
            "y": 93
          },
          "hiddenSeries": false,
          "id": 68,
          "legend": {
            "alignAsTable": true,
            "avg": false,
            "current": true,
            "max": true,
            "min": false,
            "rightSide": true,
            "show": true,
            "total": false,
            "values": true
          },
          "lines": true,
          "linewidth": 1,
          "links": [],
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "8.4.5",
          "pointradius": 5,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "(node_filesystem_free_bytes{cluster=\"$cluster\", mountpoint='/', device != 'rootfs'})*100 / (node_filesystem_size_bytes{cluster=\"$cluster\", mountpoint='/', device != 'rootfs'})",
              "format": "time_series",
              "intervalFactor": 1,
              "legendFormat": "{{instance}}",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeRegions": [],
          "title": "Free Space in root filesystem",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "mode": "time",
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "percent",
              "logBase": 1,
              "show": true
            },
            {
              "format": "short",
              "logBase": 1,
              "show": true
            }
          ],
          "yaxis": {
            "align": false
          }
        }
      ],
      "refresh": "1m",
      "schemaVersion": 35,
      "style": "dark",
      "tags": [
        "ceph",
        "cluster"
      ],
      "templating": {
        "list": [
          {
            "auto": true,
            "auto_count": 10,
            "auto_min": "1m",
            "current": {
              "selected": false,
              "text": "10s",
              "value": "10s"
            },
            "hide": 0,
            "includeAll": false,
            "label": "Interval",
            "multi": false,
            "name": "interval",
            "options": [
              {
                "selected": false,
                "text": "auto",
                "value": "$__auto_interval_interval"
              },
              {
                "selected": false,
                "text": "5s",
                "value": "5s"
              },
              {
                "selected": true,
                "text": "10s",
                "value": "10s"
              },
              {
                "selected": false,
                "text": "30s",
                "value": "30s"
              },
              {
                "selected": false,
                "text": "1m",
                "value": "1m"
              },
              {
                "selected": false,
                "text": "10m",
                "value": "10m"
              },
              {
                "selected": false,
                "text": "30m",
                "value": "30m"
              },
              {
                "selected": false,
                "text": "1h",
                "value": "1h"
              },
              {
                "selected": false,
                "text": "6h",
                "value": "6h"
              },
              {
                "selected": false,
                "text": "12h",
                "value": "12h"
              },
              {
                "selected": false,
                "text": "1d",
                "value": "1d"
              },
              {
                "selected": false,
                "text": "7d",
                "value": "7d"
              },
              {
                "selected": false,
                "text": "14d",
                "value": "14d"
              },
              {
                "selected": false,
                "text": "30d",
                "value": "30d"
              }
            ],
            "query": "5s,10s,30s,1m,10m,30m,1h,6h,12h,1d,7d,14d,30d",
            "queryValue": "",
            "refresh": 2,
            "skipUrlSync": false,
            "type": "interval"
          },
          {
            "allValue": "cephpolbo|cepherin|cephkelly",
            "current": {
              "isNone": true,
              "selected": false,
              "text": "None",
              "value": ""
            },
            "datasource": {
              "type": "prometheus",
              "uid": "prometheus"
            },
            "definition": "",
            "hide": 0,
            "includeAll": false,
            "label": "cluster",
            "multi": false,
            "name": "cluster",
            "options": [],
            "query": {
              "query": "label_values(cluster)",
              "refId": "Prometheus-cluster-Variable-Query"
            },
            "refresh": 1,
            "regex": "",
            "skipUrlSync": false,
            "sort": 0,
            "tagValuesQuery": "",
            "tagsQuery": "",
            "type": "query",
            "useTags": false
          }
        ]
      },
      "time": {
        "from": "now-12h",
        "to": "now"
      },
      "timepicker": {
        "refresh_intervals": [
          "5s",
          "10s",
          "30s",
          "1m",
          "5m",
          "15m",
          "30m",
          "1h",
          "2h",
          "1d"
        ],
        "time_options": [
          "5m",
          "15m",
          "1h",
          "6h",
          "12h",
          "24h",
          "2d",
          "7d",
          "30d"
        ]
      },
      "timezone": "browser",
      "title": "Ceph - Cluster",
      "uid": "r6lloPJmz",
      "version": 1,
      "weekStart": ""
    }
kind: ConfigMap
metadata:
  labels:
    release: prometheus-grafana
  name: prometheus-grafana-kube-pr-ceph-cluster
  namespace: monitor
```

Once the config map is created, it is automatically replicated to the Garafana dashboard.
