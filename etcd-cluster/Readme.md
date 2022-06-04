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

## _Generating certificates_

**_Certificate Authority_**

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

This command will generate the files `ca.csr`, `ca.pem`, and `ca-key.pem` for you.

**_Client and Server Certificates_**

In this section you will generate client and server certificates for each Kubernetes component and a client certificate for the Kubernetes `admin user`.

```bash
cat > admin-csr.json <<EOF
{
  "CN": "admin",
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

cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes admin-csr.json | cfssljson -bare admin
  
```



