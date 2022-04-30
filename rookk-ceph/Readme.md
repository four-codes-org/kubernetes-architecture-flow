#### Rook-Ceph storage cluster

![image](https://user-images.githubusercontent.com/57703276/166111720-581f221a-f2fe-430b-9e56-469c8115d051.png)

---

**Foundation**

`Open-Source, Cloud-Native Storage for Kubernetes`

**Minimum Version**

* Kubernetes v1.17 or higher is supported by Rook.

**Prerequisites**

In order to configure the Ceph storage cluster, at least one of these `local storage` options are required:

* Raw devices (no partitions or formatted filesystems)
* This requires lvm2 to be installed on the host. To avoid this dependency, you can create a single full-disk partition on the disk (see below) Raw partitions (no formatted filesystem)
* Persistent Volumes available from a storage class in block mode

**Kubernetes setup**

|server| ipaddress | root volume | add volume |
|---|---|---|---|
| master |192.168.0.2 |50GB|NA|
| worker1 |192.168.0.3 |50GB|50GB
| worker2 |192.168.0.4 |50GB |50GB|
| worker3 |192.168.0.5 |50GB |50GB|

**Disk details**

Your worker nodes should resemble.

* `sda` is root disk
* `sdb` is additional volume

![image](https://user-images.githubusercontent.com/57703276/166091705-4ee5056f-2435-47eb-ab59-54289049fb70.png)


**worker node details**

![image](https://user-images.githubusercontent.com/57703276/166090888-d1759814-319d-4204-bd5f-7af071f879ce.png)

```bash
kubectl label node tscout-worker1 kubernetes.io/role=worker
kubectl label node tscout-worker2 kubernetes.io/role=worker
kubectl label node tscout-worker3 kubernetes.io/role=worker

# this is require for rook-ceph cluster 
kubectl label node tscout-worker1 cephnode=true
kubectl label node tscout-worker2 cephnode=true
kubectl label node tscout-worker3 cephnode=true
```

![image](https://user-images.githubusercontent.com/57703276/166091296-d4631dd5-92f4-4f38-a727-537292f9f9eb.png)

**Cluster Environments**

* Cluster settings for a production cluster running on bare metal. Requires at least three worker nodes.

**installation**

In this scenario, I'm utilising the Raw devices (no partitions or formatted filesystems).

**operator consideration**

* Consider if you want to enable certain Rook features that are disabled by default. See the operator.yaml for these and other advanced settings.
  * Device discovery: Rook will watch for new devices to configure if the `ROOK_ENABLE_DISCOVERY_DAEMON` setting is enabled, commonly used in bare metal clusters.
  * Node affinity and tolerations: The CSI driver by default will run on any node in the cluster. To configure the CSI driver affinity, several settings are available.

**operator installation**

```bash
git clone --single-branch --branch v1.9.2 https://github.com/rook/rook.git
cd rook/deploy/examples
kubectl create -f crds.yaml -f common.yaml -f operator.yaml
```
![image](https://user-images.githubusercontent.com/57703276/166111270-1634c378-cfe4-444e-b73f-6b90d2067c5d.png)

**cluster installtion**

In this scenario, I will use an unformatted sdb disc with no fstab entries in Oracle Cloud.

* sdb
* kubernetes label cephnode=true
* dashboard disabled
* prometheus metric enabled

You can use the 'cluster.yml.md' file as a reference.

```bash
cd ~/rook/deploy/examples
kubectl create -f cluster.yaml
```
**installation output**

```bash
kubectl get po -n rook-ceph
```

![image](https://user-images.githubusercontent.com/57703276/166090821-af020227-be27-4d08-903c-3d6c4cbdf9d8.png)


**validation**

Once installed the ceph cluster you have verify the confihguration use tool.yaml

**installtion of tools**

```yaml
cd ~/rook/deploy/examples
kubectl create -f toolbox.yaml
```

![image](https://user-images.githubusercontent.com/57703276/166112442-772a2514-d58a-4166-80f5-fa357f9d50cf.png)

open the toolbox terminal

![image](https://user-images.githubusercontent.com/57703276/166113084-267b472d-23fc-428f-99a1-a869156b6488.png)

To verify that the cluster is in a healthy state, connect to the Rook toolbox and run the ceph status command.

cluster status

* All mons should be in quorum
* A mgr should be active
* At least one OSD should be active
* If the health is not HEALTH_OK, the warnings or errors should be investigated

![image](https://user-images.githubusercontent.com/57703276/166113109-c9056a86-c80e-4706-b700-d192a9d2df07.png)

ceph number of nodes cluster status

![image](https://user-images.githubusercontent.com/57703276/166113141-7a8959f4-34ea-42e9-85c5-d537fb6e83aa.png)

![image](https://user-images.githubusercontent.com/57703276/166113164-27caccb2-6aa3-445a-86d8-17a22828bdfe.png)


![image](https://user-images.githubusercontent.com/57703276/166113188-b989d5b3-54b5-4e62-864e-8ad6246c7a10.png)










