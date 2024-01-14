##### certification-preparation.md

```console
kubectl run web-server --image=nginx --dry-run=client
kubectl run web-server --image=nginx
kubectl run web-server --image=nginx --labels=production=januo --port=80
kubectl run web-server --image=nginx --labels=production=januo --port=80 --labels=production=januo
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
