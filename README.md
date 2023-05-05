# kubernetes-architecture-flow

kubernetes-architecture-flow end to end

to get ready for the Kubernetes integration

    1. Event Notifications  - events 
    2. Log Tracing          - application tracing
    3. Gatekeeper           - policy checker
    4. Prometheus           - monitor
    5. Hashicorp vault      - secret management 
    6. rook-ceph            - storage cluster


```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress ingress-nginx/ingress-nginx -set controller.admissionWebhooks.enabled=false -n namespace
```

https://vstsagentpackage.azureedge.net/agent/3.220.0/vsts-agent-win-x64-3.220.0.zip
PS C:\> mkdir agent ; cd agent
PS C:\agent> Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$HOME\Downloads\vsts-agent-win-x64-3.220.0.zip", "$PWD")
PS C:\agent> .\config.cmd
PS C:\agent> .\run.cmd
