## kubernetes multi master

|server name| ipaddress| operatig system |
|---|---|---|
|master-server-001| 172.31.17.134|ubuntu|
|master-server-002|172.31.20.139|ubuntu|
|master-server-003|172.31.27.19|ubuntu|


login into each node

```bash
echo "172.31.17.134 master-server-001" | sudo tee -a /etc/hosts
echo "172.31.20.139 master-server-002" | sudo tee -a /etc/hosts
echo "172.31.27.19 master-server-003" | sudo tee -a /etc/hosts
```
keepalivd  

package installation 

```bash

sudo apt-get update && sudo apt-get install keepalived -y

```
configuration 
The configuration file for Keepalived is located at
~~~bash
/etc/keepalived/keepalived.conf
~~~

```bash
# SERVER 1 keepalived configuration
vrrp_instance VI_1 {
        state MASTER
        interface eth0
        virtual_router_id 51
        priority 255
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
```bash
# server 2 keepalived configuration

vrrp_instance VI_1 {

        state BACKUP
        interface eth0
        virtual_router_id 51
        priority 254
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
```bash
# server 3 keepalived configuration
vrrp_instance VI_1 {

        state BACKUP
        interface eth0
        virtual_router_id 51
        priority 254
        advert_int 1
        authentication {
              auth_type PASS
              auth_pass 12345
        }
        virtual_ipaddress {
              172.31.17.150/32
        }
}

```
service start

```bash
sudo systemctl status keepalived
sudo systemctl start keepalived
sudo systemctl stop keepalived
```
