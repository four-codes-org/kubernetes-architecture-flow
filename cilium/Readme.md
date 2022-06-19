## Cilium 


Cilium is open source software for transparently securing the network connectivity between application services deployed using Linux container management platforms like Docker and Kubernetes.

At the foundation of Cilium is a new Linux kernel technology called eBPF, which enables the dynamic insertion of powerful security, visibility, and networking control logic into the Linux kernel. eBPF is used to provide high-performance networking, multi-cluster and multi-cloud capabilities, advanced load balancing, transparent encryption, extensive network security capabilities, transparent observability, and much more.

![Architecture](https://user-images.githubusercontent.com/57703276/174486351-f29d1dce-5470-493a-ae15-38c3b799cd00.png)

Initialize the control-plane node via kubeadm init and skip the installation of the kube-proxy add-on:

|master server| port|
|---|---|
|10.0.0.5|6443|

```bash
kubeadm init \
    --skip-phases=addon/kube-proxy \ 
    --pod-network-cidr=192.168.0.0/16 \
    --service-cidr=172.16.0.0/16 \
    --service-dns-domain="rcms.io" \
    --v=5
```
Specifying this is necessary as kubeadm init is run explicitly without setting up kube-proxy and as a consequence, although it exports `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` with a ClusterIP of the kube-apiserver service to the environment, there is no kube-proxy in our setup provisioning that service. The Cilium agent therefore needs to be made aware of this information through below configuration.

```bash
helm repo add cilium https://helm.cilium.io/
helm search repo cilium/cilium
helm install cilium cilium/cilium --version 1.11.6 \
    --namespace kube-system \
    --set kubeProxyReplacement=strict \
    --set k8sServiceHost=10.0.0.5 \
    --set k8sServicePort=6443
```
