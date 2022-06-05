## kubernetes multi master

|server name| ipaddress| operatig system |
|---|---|---|
|master-server-001| 172.31.17.134|ubuntu|
|master-server-002|172.31.20.139|ubuntu|
|master-server-003|172.31.27.19|ubuntu|


login into each node

```bash
echo "172.31.17.134 master-server-001" | sudo tee -a /etc/hosts
echo "172.31.20.139 master-server-002" | sudo tee -a /etc/hosts
echo "172.31.27.19 master-server-003" | sudo tee -a /etc/hosts
```
keepalivd  

package installation 

```bash

sudo apt-get update && sudo apt-get install keepalived -y

```
configuration 
The configuration file for Keepalived is located at
~~~bash
/etc/keepalived/keepalived.conf
~~~

```bash
# SERVER 1 keepalived configuration
vrrp_instance VI_1 {
        state MASTER
        interface eth0
        virtual_router_id 51
        priority 255
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
```bash
# server 2 keepalived configuration

vrrp_instance VI_1 {

        state BACKUP
        interface eth0
        virtual_router_id 51
        priority 254
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
```bash
# server 3 keepalived configuration
vrrp_instance VI_1 {

        state BACKUP
        interface eth0
        virtual_router_id 51
        priority 254
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
service start

```bash
sudo systemctl status keepalived
sudo systemctl start keepalived
sudo systemctl stop keepalived
```

## HA proxy 

package installation

~~~bash
sudo apt-get install haproxy -y
~~~

configuration

defualt .conf file for all three servers 

~~~bash
frontend fe-apiserver
   bind 0.0.0.0:8443
   mode tcp
   option tcplog
   default_backend be-apiserver

backend be-apiserver
   mode tcp
   option tcplog
   option tcp-check
   balance roundrobin
   default-server inter 10s downinter 5s rise 2 fall 2 slowstart 60s maxconn 250 maxqueue 256 weight 100

       server master-server-001 172.31.17.134:6443 check
       server master-server-002 172.31.20.139:6443 check
       server master-server-003 172.31.27.19:6443  check
~~~

service start 

~~~bash
sudo systemctl status haproxy
sudo systemctl start haproxy
sudo systemctl stop haproxy
~~~

## Download the etcd binaries

~~~bash
ETCD_VER=v3.5.4

# choose either URL
GOOGLE_URL=https://storage.googleapis.com/etcd
GITHUB_URL=https://github.com/etcd-io/etcd/releases/download
DOWNLOAD_URL=${GOOGLE_URL}

curl -L ${DOWNLOAD_URL}/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz -o /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz
sudo tar xzvf /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz -C /usr/local/bin/ --strip-components=1
rm -rf /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz
rm -rf /usr/local/bin/README*
rm -f /tmp/etcd-${ETCD_VER}-linux-amd64.tar.gz

etcd --version
etcdctl version
etcdutl version

~~~

## Creating a certificate authority

1. Create the certificate authority configuration file.

~~~bash
# vim ca-config.json

{
  "signing": {
    "default": {
      "expiry": "8760h"
    },
    "profiles": {
      "kubernetes": {
        "usages": ["signing", "key encipherment", "server auth", "client auth"],
        "expiry": "8760h"
      }
    }
  }
}

~~~

## Creating the certificate for the Etcd cluster

1. Create the certificate signing request configuration file.

~~~bash
# vim kubernetes-csr.json
{
  "CN": "kubernetes",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
  {
    "C": "IE",
    "L": "Cork",
    "O": "Kubernetes",
    "OU": "Kubernetes",
    "ST": "Cork Co."
  }
 ]
}

~~~

##

~~~bash

~~~









