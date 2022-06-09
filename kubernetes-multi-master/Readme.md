#### Haproxy with kubernetes multi master cluster

|SERVER NAME| IPADDRESS| OS |ROLE|
|---|---|---|---|
|master-server-a|172.31.17.18|ubuntu 20.04| master |
|master-server-b|172.31.17.19|ubuntu 20.04| master |
|master-server-c|172.31.17.20|ubuntu 20.04| master |
|ha-proxy-a|172.31.17.21|ubuntu 20.04| load balancer |

_**execute each node**_

```bash
echo "172.31.17.18 master-server-a" | sudo tee -a /etc/hosts
echo "172.31.17.19 master-server-b" | sudo tee -a /etc/hosts
echo "172.31.17.20 master-server-c" | sudo tee -a /etc/hosts
echo "172.31.17.21 ha-proxy-a" | sudo tee -a /etc/hosts
```

_**keepalived installtion**_

```bash
journalctl -flu keepalived
```

_**configure keepalived**_

on both nodes create the health check script /etc/keepalived/check_apiserver.sh

```bash

VIRTUAL_IP=172.31.17.25

cat >> /etc/keepalived/check_apiserver.sh <<EOF

#!/usr/bin/env bash

errorExit() {
  echo "*** $@" 1>&2
  exit 1
}

curl --silent --max-time 2 --insecure https://localhost:6443/ -o /dev/null || errorExit "Error GET https://localhost:6443/"
if ip addr | grep -q $VIRTUAL_IP; then
  curl --silent --max-time 2 --insecure https://$VIRTUAL_IP:6443/ -o /dev/null || errorExit "Error GET https://$VIRTUAL_IP:6443/"
fi
EOF

chmod +x /etc/keepalived/check_apiserver.sh
```

_**haproxy installation**_

```bash

sudo apt update
sudo apt install haproxy -y
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

```

_**configuration**_

`vim /etc/haproxy/haproxy.conf`

```bash

global
	log /dev/log	local0
	log /dev/log	local1 notice
	chroot /var/lib/haproxy
	stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
	stats timeout 30s
	user haproxy
	group haproxy
	daemon

	# Default SSL material locations
	ca-base /etc/ssl/certs
	crt-base /etc/ssl/private

	# See: https://ssl-config.mozilla.org/#server=haproxy&server-version=2.0.3&config=intermediate
        ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
        ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
        ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

defaults
	log	global
	mode	http
	option	httplog
	option	dontlognull
        timeout connect 5000
        timeout client  50000
        timeout server  50000
	errorfile 400 /etc/haproxy/errors/400.http
	errorfile 403 /etc/haproxy/errors/403.http
	errorfile 408 /etc/haproxy/errors/408.http
	errorfile 500 /etc/haproxy/errors/500.http
	errorfile 502 /etc/haproxy/errors/502.http
	errorfile 503 /etc/haproxy/errors/503.http
	errorfile 504 /etc/haproxy/errors/504.http

frontend kubernetes
	bind *:6443
	mode tcp
	option tcplog
	default_backend api-server

backend api-server
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
[_**overlay network**_](https://www.weave.works/docs/net/latest/kubernetes/kube-addon/)

```bash
kubectl apply -f "https://cloud.weave.works/k8s/net?k8s-version=$(kubectl version | base64 | tr -d '\n')"
```

_**worker node adds**_

```bash

```

_**node information**_

![image](https://user-images.githubusercontent.com/57703276/172707575-8b6d5af0-93e7-4343-a23e-41aec5c4c7e1.png)

_**kube-system pods information**_

![image](https://user-images.githubusercontent.com/57703276/172707798-5e8e3f14-cb5c-4e0e-8316-155ac9722798.png)



[_**metric server**_](https://github.com/kubernetes-sigs/metrics-server)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```
