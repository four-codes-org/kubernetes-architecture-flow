### Event-notification-backend

`this is application design to store the events, based on the success and failure.`



Evironment variables

| Key | Value | Required | Description |
|------|----| ---- | ------ |
|  DB_NAME | " " | yes | Database |
|  DB_HOST | " " | yes | Database |
|  DB_USERNAME | " " | yes | Database |
|  DB_PASSWORD | " " | yes | Database |
|  PORT | 4000 | no | Application |

How to set environment variables in linux

    export DB_NAME=""
    export DB_HOST=""
    export DB_USERNAME=""
    export DB_PASSWORD=""

In the project directory, you can run

    npm install
    node main.js

Docker build and run the following command

    docker build -t event-notification .
    docker run -d -p 4000:40000 --name event-notification event-notification

Docker compose command

```yml

# vim docker-compose.yml
version: "3"
services:
  database:
    image: mysql:5.7
    networks:
      - events
    volumes:
    - events:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: events
      MYSQL_DATABASE: events
      MYSQL_USER: events
      MYSQL_PASSWORD: events
  events:
    image: jjino/event-notification
    depends_on:
    - database
    ports:
    - "80:4000"
    restart: always
    networks:
      - events
    environment:
      DB_HOST: database
      DB_USERNAME: events
      DB_PASSWORD: events
      DB_NAME: events
networks:
  events:
    driver: bridge
volumes:
  events:

```

Requests

```bash
curl -X POST -d '{ "name": "fourtimes", "sports": "cricket" }' "http://ado.dodonotdo.in/events/create"  -H "Content-Type: application/json"
```


kubernetes life-cycle process

```yml
# https://github.com/kubernetes-client/javascript
---
apiVersion: v1
kind: Pod
metadata:
  name: lifecycle-demo
spec:
  containers:
  - name: lifecycle-demo-container
    image: nginx
    terminationMessagePath: "/tmp/termination.log"
    env:
    - name: NODE_NAME
      valueFrom:
        fieldRef:
          fieldPath: spec.nodeName
    - name: POD_NAME
      valueFrom:
        fieldRef:
          fieldPath: metadata.name
    - name: POD_NAMESPACE
      valueFrom:
        fieldRef:
          fieldPath: metadata.namespace
    - name: POD_IP
      valueFrom:
        fieldRef:
          fieldPath: status.podIP
    - name: POD_SERVICE_ACCOUNT
      valueFrom:
        fieldRef:
          fieldPath: spec.serviceAccountName
    lifecycle:
      postStart:
        exec:
          command:
          - sh
          - -c
          - |
              curl -H "Content-Type: application/json" -d '{"Namespace": "'$POD_NAMESPACE'", "POD": "'$POD_NAME'", "POD_IP": "'$POD_IP'", "RUNNING_POD_HOSTNAME": "'$NODE_NAME'", "STATUS": "Pod started"}' -X POST http://ado.dodonotdo.in/events/create
      preStop:
        exec:
          command:
          - sh
          - -c
          - |
              reason=`cat /tmp/termination.log`
              curl -H "Content-Type: application/json" -d '{"Namespace": "'$POD_NAMESPACE'", "POD": "'$POD_NAME'", "POD_IP": "'$POD_IP'", "RUNNING_POD_HOSTNAME": "'$NODE_NAME'", "STATUS": "Pod deleted"}' -X POST http://ado.dodonotdo.in/events/create
```

![kubernetes notification](https://user-images.githubusercontent.com/57703276/142879784-c21c3855-8b1d-4c8e-a78b-b6f7448e19a5.png)
