## Cilium 


Cilium is open source software for transparently securing the network connectivity between application services deployed using Linux container management platforms like Docker and Kubernetes.

Initialize the control-plane node via kubeadm init and skip the installation of the kube-proxy add-on:

|master server| port|
|---|---|
|10.0.0.5|6443|

```bash
kubeadm init --skip-phases=addon/kube-proxy
```
Specifying this is necessary as kubeadm init is run explicitly without setting up kube-proxy and as a consequence, although it exports `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` with a ClusterIP of the kube-apiserver service to the environment, there is no kube-proxy in our setup provisioning that service. The Cilium agent therefore needs to be made aware of this information through below configuration.

```bash
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --version 1.11.6 \
    --namespace kube-system \
    --set kubeProxyReplacement=strict \
    --set k8sServiceHost=10.0.0.5 \
    --set k8sServicePort=6443
```
