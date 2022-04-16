#### Event-notification-backend

This is an application designed to save events based on success and failure. In the future, we should implement notification alerts based on the scope.

**Evironment variables**

This event notification application will use a database as a Mysql service, either on-premises or in the cloud. It is up to us to handle events and store them somewhere.

**Environment values**

| Key         | Value | Required | Description |
| ----------- | ----- | -------- | ----------- |
| DB_NAME     | " "   | yes      | Database    |
| DB_HOST     | " "   | yes      | Database    |
| DB_USERNAME | " "   | yes      | Database    |
| DB_PASSWORD | " "   | yes      | Database    |
| PORT        | 8080  | no       | Application |

**Runtime Environment variables**

How to set environment variables in linux

```bash
export DB_NAME=""
export DB_HOST=""
export DB_USERNAME=""
export DB_PASSWORD=""
```

**How to run this application?**

You can run the project directory as a normal service in linux terminal.

```bash
npm install
node main.js
```
**api call process**

Provide two types of operations in this application.

1. POST METHOD - `http://URL/events/create`
2. GET METHOD - `http://URL/events`

**Docker build and run the following command**

```bash
docker build -t event-notification:v1.0 .
docker run -d -p 8080:8080 --name event-notification event-notification:v1.0
```
**Docker push images**

```bash
docker login 
docker tag event-notification:v1.0 jjino/event-notification:v1.0
docker push jjino/event-notification:v1.0
```

**Docker compose command**

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
    image: jjino/event-notification:v1.0
    depends_on:
      - database
    ports:
      - "8080:8080"
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

**`curl` command is used to raise requests**

```bash
curl \
  -X POST  \
  -H "Content-Type: application/json" \
  -d '{ "name": "fourtimes", "sports": "cricket" }' \
  "http://localhost:8080/events/create"  

```

**kubernetes life-cycle process**

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
                curl -H "Content-Type: application/json" -d '{"Namespace": "'$POD_NAMESPACE'", "POD": "'$POD_NAME'", "POD_IP": "'$POD_IP'", "RUNNING_POD_HOSTNAME": "'$NODE_NAME'", "STATUS": "Pod started"}' -X POST http://localhost:8080/events/create
        preStop:
          exec:
            command:
              - sh
              - -c
              - |
                reason=`cat /tmp/termination.log`
                curl -H "Content-Type: application/json" -d '{"Namespace": "'$POD_NAMESPACE'", "POD": "'$POD_NAME'", "POD_IP": "'$POD_IP'", "RUNNING_POD_HOSTNAME": "'$NODE_NAME'", "STATUS": "Pod deleted"}' -X POST http://localhost:8080/events/create
```

**output**
![kubernetes notification](https://user-images.githubusercontent.com/57703276/142879784-c21c3855-8b1d-4c8e-a78b-b6f7448e19a5.png)
