#### Hashicorp vault
----

Running Vault with Kubernetes can be done differently based on the environments and needs, whether you’re running Vault side-by-side or within Kubernetes. The goal is to provide a variety of options around how to leverage Vault and Kubernetes to securely introduce secrets into applications and infrastructure.

Hashicorp vault has contains three important features

* Integrate a Kubernetes Cluster with an External Vault
* Injecting Secrets into Kubernetes Pods via Vault Helm Sidecar
* Mount Vault Secrets through Container Storage Interface (CSI) Volume

`In this case we are going to implement two types of approaches`

_Injecting Secrets into Kubernetes Pods via Vault Helm Sidecar_
---

_Prepare the vault values.yml file_

```bah
```

_Installation of vault cluster with raft via helm charts_

```bash

```

_Initiate the vault_

```bash

```

_create the secrets and policies_

```bash

```

_Enabled the kubernetes authentication in vault_

```bash

```

_create the demo pods to inject the credentials from hashicorp vault server_

```bash

```
