## kubernetes multi master

|SERVER NAME| IPADDRESS| OS |
|---|---|---|
|master-server-a|172.31.17.18|ubuntu|
|master-server-b|172.31.17.19|ubuntu|
|master-server-c|172.31.17.20|ubuntu|
|ha-proxy-a|172.31.17.21|ubuntu|
|ha-proxy-b|172.31.17.22|ubuntu|

login into each node

```bash
echo "172.31.17.18 master-server-a" | sudo tee -a /etc/hosts
echo "172.31.17.19 master-server-b" | sudo tee -a /etc/hosts
echo "172.31.17.20 master-server-c" | sudo tee -a /etc/hosts
echo "172.31.17.21 ha-proxy-a" | sudo tee -a /etc/hosts
echo "172.31.17.22 ha-proxy-b" | sudo tee -a /etc/hosts
```
keepalivd  

package installation 

```bash

sudo apt-get update && sudo apt-get install keepalived -y

```
configuration 

The configuration file for Keepalived is located at

```bash
/etc/keepalived/keepalived.conf
```

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

```bash
frontend kubernetes-frontend
  bind *:6443
  mode tcp
  option tcplog
  default_backend kubernetes-backend

backend kubernetes-backend
  option httpchk GET /healthz
  http-check expect status 200
  mode tcp
  option ssl-hello-chk
  balance roundrobin
    server kmaster1 172.16.16.101:6443 check fall 3 rise 2
    server kmaster2 172.16.16.102:6443 check fall 3 rise 2
    server kmaster3 172.16.16.103:6443 check fall 3 rise 2
```

service start 

```bash
sudo systemctl status haproxy
sudo systemctl start haproxy
sudo systemctl stop haproxy
```

_**kubernetes and docker packages**_

```bash
cat >> /etc/sysctl.d/kubernetes.conf <<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
EOF

sysctl --system

cat >> /etc/modules-load.d/containerd.conf <<EOF
overlay
br_netfilter
EOF

modprobe overlay
modprobe br_netfilter

# kubernetes packages
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl
sudo curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# Docker installation
sudo apt-get remove docker docker-engine docker.io containerd runc -y
sudo apt-get update
sudo apt-get install  ca-certificates curl gnupg lsb-release -y
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y
sudo systemctl restart docker  
sudo systemctl enable docker

```
