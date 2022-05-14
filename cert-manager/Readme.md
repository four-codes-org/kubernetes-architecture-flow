Certificate-manager
---

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm show values jetstack/cert-manager > values.yml
helm install cert-manager jetstack/cert-manager --namespace cert-manager -f values.yml
```
