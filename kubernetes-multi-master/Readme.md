[HAProxy with kubernetes multi master cluster](https://www.golinuxcloud.com/kubernetes-architecture/)

|SERVER NAME| IPADDRESS| OS |ROLE|
|---|---|---|---|
|master-server-a|172.31.17.18|ubuntu 20.04| master |
|master-server-b|172.31.17.19|ubuntu 20.04| master |
|master-server-c|172.31.17.20|ubuntu 20.04| master |
|worker-server-a|172.31.17.23|ubuntu 20.04| master |
|ha-proxy-a|172.31.17.21|ubuntu 20.04| load balancer |

_**execute each node**_

```bash
echo "172.31.17.18 master-server-a" | sudo tee -a /etc/hosts
echo "172.31.17.19 master-server-b" | sudo tee -a /etc/hosts
echo "172.31.17.20 master-server-c" | sudo tee -a /etc/hosts
echo "172.31.17.23 worker-server-c" | sudo tee -a /etc/hosts
echo "172.31.17.21 ha-proxy-a" | sudo tee -a /etc/hosts
```

_**haproxy installation**_

```bash

sudo apt update
sudo apt install haproxy -y
cat > /etc/sysctl.d/kubernetes.conf <<EOF
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

```bash
MASTER_SERVER_A=172.31.17.18
MASTER_SERVER_B=172.31.17.19
MASTER_SERVER_C=172.31.17.20

cat >>  /etc/haproxy/haproxy.conf <<EOF

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
		server kmaster1 $MASTER_SERVER_A:6443 check fall 3 rise 2
		server kmaster2 $MASTER_SERVER_B:6443 check fall 3 rise 2
		server kmaster3 $MASTER_SERVER_C:6443 check fall 3 rise 2
EOF
```

_**service start**_

```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
sudo systemctl status haproxy

```

_**kubernetes and docker packages**_

```bash
cat > /etc/sysctl.d/kubernetes.conf <<EOF
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

kubeadm init --control-plane-endpoint="172.31.17.21:6443" --upload-certs \ 
	--apiserver-advertise-address=172.31.17.18 \ 
	--pod-network-cidr=10.0.0.0/16

```
_**master addition commands**_

```bash
kubeadm join 172.31.17.21:6443 --token iwk9k5.j0qx4qz284k0vmg7 \
	--discovery-token-ca-cert-hash sha256:2da0552eea637fa5d31860157d2a6578f4f3dab7f04e2ceeb65a7dc900c0305e \
	--control-plane --certificate-key e850b9e7f0c1147548207e829be86d8c77d6ae0ad58e7e328e27126f42c04796 \ 
	--apiserver-advertise-address=172.31.17.18
```

_**add the mester with existing cluster**_

```bash
# add master nodes in the cluster
kubeadm init phase upload-certs --upload-certs

> [upload-certs] Storing the certificates in Secret "kubeadm-certs" in the "kube-system" Namespace
> [upload-certs] Using certificate key:
> 4f9028046dc71a3b5d2370f1a7ed1526e86d67be838da802b4255e922b87cc2b

# master nodes add into the existing cluster
kubeadm token create --print-join-command --certificate-key 4f9028046dc71a3b5d2370f1a7ed1526e86d67be838da802b4255e922b87cc2b
```

[_**overlay network**_](https://www.weave.works/docs/net/latest/kubernetes/kube-addon/)

```bash
kubectl apply -f "https://cloud.weave.works/k8s/net?k8s-version=$(kubectl version | base64 | tr -d '\n')"
```

_**kubectl autocomplete**_

```bash
echo 'source <(kubectl completion bash)' >>~/.bashrc
# optional configuration
kubectl completion bash >> /etc/bash_completion.d/kubectl
```

_**kubectl credential configuration**_

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

_**cluster verification**_

```bash
kubectl get cs
kubectl cluster-info
```

_**worker node adds**_

```bash
# on master node
kubeadm token list
kubeadm token create --print-join-command

# on worker node
kubeadm join 10.0.14.125:6443 --token p6eyzb.djhxjdb1a3byup8r \ 
	--discovery-token-ca-cert-hash sha256:a29929cd3a4db33c6da8aeece5d999bc535c331a3b512827497dc161151a71eb
```

_**configuration labels**_

```bash
# add Label
kubectl label nodes worker-server-a kubernetes.io/role=worker
# update Label
kubectl label --overwrite nodes <your_node> kubernetes.io/role=<your_node>
# remove Label
kubectl label node <node name> node-role.kubernetes.io/<role name>-
```

_**node information**_

![image](https://user-images.githubusercontent.com/57703276/172707575-8b6d5af0-93e7-4343-a23e-41aec5c4c7e1.png)

_**kube-system pods information**_

![image](https://user-images.githubusercontent.com/57703276/172707798-5e8e3f14-cb5c-4e0e-8316-155ac9722798.png)

[_**helm installtion**_](https://helm.sh/docs/intro/install/)

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

_**Metallb installation**_

_helm configuration_

```yml
# values.yml
configInline:
  address-pools:
   - name: default
     protocol: layer2
     addresses:
     - 10.0.1.100-10.0.1.120
```

_configuration modififcation_

```bash
kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl diff -f - -n kube-system

# actually apply the changes, returns nonzero returncode on errors only
kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
```

_helm commands_

```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb  -f values.yml -n kube-system
# if you want to upgrade the 
helm upgrade metallb metallb/metallb  -f values.yml -n kube-system
```

[_**metric server**_](https://github.com/kubernetes-sigs/metrics-server)

_helm configuration_

```yml
# values.yml
defaultArgs:
  - --cert-dir=/tmp
  - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
  - --kubelet-use-node-status-port
  - --metric-resolution=15s
  - --kubelet-insecure-tls
```

_helm commands_

```bash
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm install metrics-server metrics-server/metrics-server -n kube-system -f values.yml
# to upgrade the metrics-server
helm upgrade metrics-server metrics-server/metrics-server -n kube-system -f values.yml
```

_metric server verifcation_

```bash
kubectl top pods -A
kubectl top nodes
```
