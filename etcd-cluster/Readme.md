## ETCD cluster

Install etcd from pre-built binaries or from source. For details, see

| SERVER NAME | IPADDRESS | OPERATING SYSTEM |
|---|---|---|
|etcd-1| 172.31.24.9| ubuntu
|etcd-2| 172.31.16.103| ubuntu
|etcd-3| 172.31.20.163| ubuntu


connect the each machine and execute the host entry

```bash
echo "172.31.24.9 etcd-1" | sudo tee -a /etc/hosts
echo "172.31.16.103 etcd-2" | sudo tee -a /etc/hosts
echo "172.31.20.163 etcd-3" | sudo tee -a /etc/hosts
```

_cfssl and cfssljson installation_

```bash
CFSSL_VERSION=1.6.1

sudo apt update && sudo apt install wget -y
wget -q --show-progress --https-only --timestamping \
  https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssljson_${CFSSL_VERSION}_linux_amd64 \
    https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssl_${CFSSL_VERSION}_linux_amd64

mv "cfssl_${CFSSL_VERSION}_linux_amd64" cfssl
mv "cfssljson_${CFSSL_VERSION}_linux_amd64" cfssljson

chmod +x cfssl cfssljson
sudo mv cfssl cfssljson /usr/local/bin/

```
