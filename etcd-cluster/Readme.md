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

_Generating certificates_

cfssl and cfssljson commands are required.

```bash
CFSSL_VERSION=1.6.1

wget -q --show-progress --https-only --timestamping \
  https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssljson_${CFSSL_VERSION}_linux_amd64 \
    https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssl_${CFSSL_VERSION}_linux_amd64

mv "cfssl_${CFSSL_VERSION}_linux_amd64" cfssl
mv "cfssljson_${CFSSL_VERSION}_linux_amd64" cfssljson

chmod +x cfssl cfssljson
sudo mv cfssl cfssljson /usr/local/bin/

```



In this section you will provision a Certificate Authority that can be used to generate additional TLS certificates. Generate the CA configuration file, certificate, and private key

```bash
cat > ca-config.json <<EOF
{
  "signing": {
    "default": {
      "expiry": "864000h"
    },
    "profiles": {
      "kubernetes": {
        "usages": ["signing", "key encipherment", "server auth", "client auth"],
        "expiry": "864000h"
      }
    }
  }
}
EOF

cat > ca-csr.json <<EOF
{
  "CN": "Kubernetes",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "IND",
      "L": "CHENNAI",
      "O": "Kubernetes",
      "OU": "TN",
      "ST": "TAMILNADU"
    }
  ]
}
EOF

cfssl gencert -initca ca-csr.json | cfssljson -bare ca

```


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
