## ETCD cluster

Install etcd from pre-built binaries or from source. For details, see

| SERVER NAME | IPADDRESS | OPERATING SYSTEM |
|---|---|---|
|etcd-1| 172.31.24.9| ubuntu
|etcd-2| 172.31.16.103| ubuntu
|etcd-3| 172.31.20.163| ubuntu


connect the each machine and execute the host entry

```bash
echo "172.31.24.9 etcd-1" | sudo tee -a /etc/hosts
echo "172.31.16.103 etcd-2" | sudo tee -a /etc/hosts
echo "172.31.20.163 etcd-3" | sudo tee -a /etc/hosts
```

_cfssl and cfssljson installation_

```bash
CFSSL_VERSION=1.6.1

sudo apt update && sudo apt install wget -y
wget -q --show-progress --https-only --timestamping \
  https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssljson_${CFSSL_VERSION}_linux_amd64 \
    https://github.com/cloudflare/cfssl/releases/download/v${CFSSL_VERSION}/cfssl_${CFSSL_VERSION}_linux_amd64

mv "cfssl_${CFSSL_VERSION}_linux_amd64" cfssl
mv "cfssljson_${CFSSL_VERSION}_linux_amd64" cfssljson

chmod +x cfssl cfssljson
sudo mv cfssl cfssljson /usr/local/bin/

```

_**cluster creation with out tls certificates**_

```bash
# run as root user
mkdir -p /etc/etcd /var/lib/etcd
groupadd -f -g 1501 etcd
useradd -c "etcd user" -d /var/lib/etcd -s /bin/false -g etcd -u 1501 etcd
chown -R etcd:etcd /var/lib/etcd

ETCD_HOST_IP=$(ip addr show eth0 | grep "inet\b" | awk '{print $2}' | cut -d/ -f1)
ETCD_NAME=$(hostname -s)

cat << EOF > /lib/systemd/system/etcd.service
[Unit]
Description=etcd service
Documentation=https://github.com/coreos/etcd
 
[Service]
User=etcd
Type=notify
ExecStart=/usr/local/bin/etcd \\
 --name ${ETCD_NAME} \\
 --data-dir /var/lib/etcd \\
 --initial-advertise-peer-urls http://${ETCD_HOST_IP}:2380 \\
 --listen-peer-urls http://${ETCD_HOST_IP}:2380 \\
 --listen-client-urls http://${ETCD_HOST_IP}:2379,http://127.0.0.1:2379 \\
 --advertise-client-urls http://${ETCD_HOST_IP}:2379 \\
 --initial-cluster-token etcd-cluster-1 \\
 --initial-cluster etcd-1=http://172.31.24.9:2380,etcd-2=http://172.31.16.103:2380,etcd-3=http://172.31.20.163:2380 \\
 --initial-cluster-state new \\
 --heartbeat-interval 1000 \\
 --election-timeout 5000
Restart=on-failure
RestartSec=5
 
[Install]
WantedBy=multi-user.target
EOF
```

_**Bootsrap the etcd cluster**_

```bash
systemctl daemon-reload
systemctl enable etcd
systemctl start etcd.service
systemctl status -l etcd.service
```
