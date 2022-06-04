
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
      "O": "system:masters",
      "OU": "Kubernetes cluster",
      "ST": "TAMILNADU"
    }
  ]
}
EOF

cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes admin-csr.json | cfssljson -bare admin
  
```
This command will generate the files `admin.csr`, `admin.pem`, and `admin-key.pem` for you.

**_The Kubelet Client Certificates_**

Kubernetes uses a special-purpose authorization mode called Node Authorizer, that specifically authorizes API requests made by Kubelets. In order to be authorized by the Node Authorizer, Kubelets must use a credential that identifies them as being in the system:nodes group, with a username of system:node:<nodeName>. In this section you will create a certificate for each Kubernetes worker node that meets the Node Authorizer requirements.

```bash
for instance in worker-0 worker-1 worker-2; do
cat > ${instance}-csr.json <<EOF
{
  "CN": "system:node:${instance}",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "IND",
      "L": "CHENNAI",
      "O": "system:nodes",
      "OU": "Kubernetes cluster",
      "ST": "TAMILNADU"
    }
  ]
}
EOF

INTERNAL_IP=$(gcloud compute instances describe ${instance} \
  --format 'value(networkInterfaces[0].networkIP)')

cfssl gencert \
  -ca=ca.pem \
  -ca-key=ca-key.pem \
  -config=ca-config.json \
  -hostname=${instance},${INTERNAL_IP} \
  -profile=kubernetes \
  ${instance}-csr.json | cfssljson -bare ${instance}
done
```
