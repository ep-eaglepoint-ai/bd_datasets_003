FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate --schema=repository_after/backend/prisma/schema.prisma

CMD ["npm", "test"]