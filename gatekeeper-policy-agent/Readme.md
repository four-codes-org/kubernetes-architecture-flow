## [Kyverno docs](https://kyverno.io/docs)

**_How Kyverno works_**

Kyverno runs as a dynamic admission controller in a Kubernetes cluster. Kyverno receives validating and mutating admission webhook HTTP callbacks from the kube-apiserver and applies matching policies to return results that enforce admission policies or reject requests.

Kyverno policies can match resources using the resource kind, name, and label selectors. Wildcards are supported in names.

Mutating policies can be written as overlays (similar to Kustomize) or as a RFC 6902 JSON Patch. Validating policies also use an overlay style syntax, with support for pattern matching and conditional (if-then-else) processing.

Policy enforcement is captured using Kubernetes events. Kyverno also reports policy violations for existing resources.

The picture below shows the high-level architecture for Kyverno:

![image](https://user-images.githubusercontent.com/57703276/168957094-c0afaf04-3fec-483f-aa0f-0af48d51f58c.png)


**_installtion via helm_**

```bash
# Add the Helm repository
helm repo add kyverno https://kyverno.github.io/kyverno/

# Scan your Helm repositories to fetch the latest available charts.
helm repo update

# Install the Kyverno Helm chart into a new namespace called "kyverno"
helm install kyverno kyverno/kyverno -n kyverno --create-namespace

```

**_cluster policy_**

```yaml
---
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: enforce
  rules:
  - name: check-for-labels
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "label 'app.kubernetes.io/name' is required"
      pattern:
        metadata:
          labels:
            app.kubernetes.io/name: "?*"
---
apiVersion: kyverno.io/v1
# The `ClusterPolicy` kind applies to the entire cluster.
kind: ClusterPolicy
metadata:
  name: require-ns-purpose-label
# The `spec` defines properties of the policy.
spec:
  # The `validationFailureAction` tells Kyverno if the resource being validated should be allowed but reported (`audit`) or blocked (`enforce`).
  validationFailureAction: enforce
  # The `rules` is one or more rules which must be true.
  rules:
  - name: require-ns-purpose-label
    # The `match` statement sets the scope of what will be checked. In this case, it is any `Namespace` resource.
    match:
      any:
      - resources:
          kinds:
          - Namespace
    # The `validate` statement tries to positively check what is defined. If the statement, when compared with the requested resource, is true, it is allowed. If false, it is blocked.
    validate:
      # The `message` is what gets displayed to a user if this rule fails validation and is therefore blocked.
      message: "You must have label `purpose` with value `production` set on all new namespaces."
      # The `pattern` object defines what pattern will be checked in the resource. In this case, it is looking for `metadata.labels` with `purpose=production`.
      pattern:
        metadata:
          labels:
            purpose: production

```
