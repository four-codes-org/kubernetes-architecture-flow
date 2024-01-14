##### certification-preparation.md

###### pod information

```console
kubectl run web-server --image=nginx --dry-run=client
kubectl run web-server --image=nginx
kubectl run web-server --image=nginx --labels=production=januo --port=80 
kubectl run web-server --image=nginx --labels=production=januo --port=80 --labels=production=januo --env=production=bca
kubectl get pods web-server -v=6

kubectl set image pod web-server web-server=httpd
```

###### service information

```console
kubectl expose pod web-server --port=80 --target-port=80 -oyaml --dry-run=client
kubectl expose pod web-server --type=LoadBalancer --port=80
kubectl get svc/web-server -oyaml
```

###### deploymentset information
```console
kubectl create deployment nginx --image=nginx -r=3
kubectl set image deployment nginx nginx=httpd
kubectl expose deploy/nginx --port=80 --target-port=80
```

###### list all the resources

```console
kubectl get all -l production=januo
```

###### _ingress service_
```console
kubectl create ingress web-server-svc --rule=dcm4che.januo.io/=web-server:80
```

##### service account

```bash
kubectl create serviceaccount pvviewer
kubectl create clusterrole pvviewer-role --verb=list --resource=PersistentVolumes
kubectl create clusterrolebinding pvviewer-role-binding --clusterrole=pvviewer-role --serviceaccount=default:pvviewer
kubectl auth can-i delete pv --as=system:serviceaccount:default:pvviewer
```

```console
kubectl  get nodes --show-labels
kubectl label nodes node-name disktype=ssd
kubectl  get nodes --show-labels
```

_etcd snapshot backup_
```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/var/lib/minikube/certs/etcd/ca.crt \
     --cert=/var/lib/minikube/certs/etcd/server.crt --key=/var/lib/minikube/certs/etcd/server.key \
     snapshot save /tmp/snapshot-pre-boot.db
```


_etcd snapshot restore_
```bash
ETCDCTL_API=3 etcdctl --endpoints=127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt \
     --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key \
     --data-dir /opt/xxx/snapshot.db \
     snapshot restore /opt/snapshot-pre-boot.db
```
