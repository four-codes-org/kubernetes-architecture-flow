## certificate creation


This demonstrates using Cloudflare's [cfssl](https://github.com/cloudflare/cfssl) to easily generate certificates for an etcd cluster.

Defaults generate an ECDSA-384 root and leaf certificates for `localhost`. etcd nodes will use the same certificates for both sides of mutual authentication, but won't require client certs for non-peer clients.

**Instructions**

1. Install git, cfssl, cfssljson, and make
2. Amend `req-csr.json` - IP's currently in the config should be replaced/added with IP addresses of each cluster node, please note 127.0.0.1 is always required for loopback purposes:

```json
{
  "CN": "etcd",
  "hosts": [
    "127.0.0.1",
    "3.8.121.201",
    "46.4.19.20",
  ],
  "key": {
    "algo": "ecdsa",
    "size": 384
  },
  "names": [
    {
      "O": "autogenerated",
      "OU": "etcd cluster",
      "L": "the internet"
    }
  ]
}
```

3. Set the following environment variables subsituting your IP address:

```bash

export infra0={IP-0}
export infra1={IP-1}
export infra2={IP-2}
export CFSSL=cfssl
export JSON=cfssljson

```
4. Run `make` to generate the certs