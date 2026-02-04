FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY package.json /app/
RUN npm install

COPY . /app

CMD ["npm", "test"]
