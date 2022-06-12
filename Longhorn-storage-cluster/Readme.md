## [Longhorn-storage-cluster](https://longhorn.io/docs/1.2.4/deploy/important-notes/)


![Longhorn](https://longhorn.io/img/diagrams/architecture/how-longhorn-works.svg)

_**Requirements**_

Each node in the Kubernetes cluster where Longhorn is installed must fulfill the following requirements:

* A container runtime compatible with Kubernetes (Docker v1.13+, containerd v1.3.7+, etc.)
* Kubernetes v1.18+.
* open-iscsi is installed, and the iscsid daemon is running on all the nodes. This is necessary, since Longhorn relies on iscsiadm on the host to provide persistent volumes to Kubernetes. For help installing open-iscsi, [refer to this section](https://longhorn.io/docs/1.2.4/deploy/install/#installing-open-iscsi).
* RWX support requires that each node has a NFSv4 client installed.
    For installing a NFSv4 client, refer to this section.
* The host filesystem supports the file extents feature to store the data. Currently we support:
    * ext4
    * XFS
* bash, curl, findmnt, grep, awk, blkid, lsblk must be installed.
* Mount propagation must be enabled.

The Longhorn workloads must be able to run as root in order for Longhorn to be deployed and operated properly.

_**installation**_

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm show values longhorn/longhorn > longhorn-values.yml
helm install longhorn longhorn/longhorn --namespace longhorn-system --create-namespace
helm upgrade longhorn longhorn/longhorn
```
