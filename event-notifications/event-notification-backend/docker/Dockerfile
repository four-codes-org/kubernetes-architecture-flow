FROM node:alpine
WORKDIR /usr/app
RUN apk update && apk upgade
RUN apk add curl
COPY package.json .
RUN npm install
RUN npm install -g npm@8.6.0
COPY . .
CMD ["npm", "start"]