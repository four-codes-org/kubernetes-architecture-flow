## kubernetes multi master

|SERVER NAME| IPADDRESS| OS |ROLE|
|---|---|---|---|
|master-server-a|172.31.17.18|ubuntu 20.04| master |
|master-server-b|172.31.17.19|ubuntu 20.04| master |
|master-server-c|172.31.17.20|ubuntu 20.04| master |
|ha-proxy-a|172.31.17.21|ubuntu 20.04| load balancer |

login into each node

```bash
echo "172.31.17.18 master-server-a" | sudo tee -a /etc/hosts
echo "172.31.17.19 master-server-b" | sudo tee -a /etc/hosts
echo "172.31.17.20 master-server-c" | sudo tee -a /etc/hosts
echo "172.31.17.21 ha-proxy-a" | sudo tee -a /etc/hosts
```
_**haproxy installation**_

```bash

sudo apt update
sudo apt install haproxy -y

```

_**configuration**_

`vim /etc/haproxy/haproxy.conf`

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

_**service start**_

```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
sudo systemctl status haproxy

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
# apt install -y kubeadm=1.22.0-00 kubelet=1.22.0-00 kubectl=1.22.0-00 # specific version

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

# remove the containerd
rm /etc/containerd/config.toml
systemctl restart containerd

```
_**cluster initial commands**_

```bash

kubeadm init --control-plane-endpoint="172.31.17.21:6443" --upload-certs --apiserver-advertise-address=172.31.17.18 --pod-network-cidr=10.0.0.0/16

```
_**master addition commands**_

```bash
kubeadm join 172.31.17.21:6443 --token iwk9k5.j0qx4qz284k0vmg7 \
	--discovery-token-ca-cert-hash sha256:2da0552eea637fa5d31860157d2a6578f4f3dab7f04e2ceeb65a7dc900c0305e \
	--control-plane --certificate-key e850b9e7f0c1147548207e829be86d8c77d6ae0ad58e7e328e27126f42c04796 --apiserver-advertise-address=172.31.17.18
```
_**overlay network**_

https://projectcalico.docs.tigera.io/getting-started/kubernetes/quickstart

```bash

```

_**worker node adds**_

```bash

```
