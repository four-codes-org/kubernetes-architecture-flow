#### Rook-Ceph storage cluster

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
| master1 |192.168.0.2 |50GB|NA|
| worker1 |192.168.0.3 |50GB|50GB
| worker2 |192.168.0.4 |50GB |50GB|
| worker3 |192.168.0.5 |50GB |50GB|

worker node details

![image](https://user-images.githubusercontent.com/57703276/166090888-d1759814-319d-4204-bd5f-7af071f879ce.png)


**installation**

In this scenario, I'm utilising the Raw devices (no partitions or formatted filesystems).

```bash
git clone --single-branch --branch v1.9.2 https://github.com/rook/rook.git
cd rook/deploy/examples
kubectl create -f crds.yaml -f common.yaml -f operator.yaml
kubectl create -f cluster.yaml
```
**installation output**

```bash
kubectl get po -n rook-ceph
```

![image](https://user-images.githubusercontent.com/57703276/166090821-af020227-be27-4d08-903c-3d6c4cbdf9d8.png)













