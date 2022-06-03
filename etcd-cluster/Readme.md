## ETCD cluster

Install etcd from pre-built binaries or from source. For details, see


|server name| ipaddress| operating system |
|---|---|---|
|etcd-1| 192.168.0.2| ubuntu
|etcd-2| 192.168.0.3| ubuntu
|etcd-3| 192.168.0.4| ubuntu

_Instllation_

```bash

ETCD_VER=v3.5.4

# choose either URL
GOOGLE_URL=https://storage.googleapis.com/etcd
GITHUB_URL=https://github.com/etcd-io/etcd/releases/download
DOWNLOAD_URL=${GOOGLE_URL}

curl -L ${DOWNLOAD_URL}/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz -o /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz
sudo tar xzvf /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz -C /usr/local/bin/ --strip-components=1
rm -rf /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz
rm -rf /usr/local/bin/README*

etcd --version
etcdctl version
etcdutl version

```
