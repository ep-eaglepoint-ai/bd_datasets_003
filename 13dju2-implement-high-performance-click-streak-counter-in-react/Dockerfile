FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY repository_after/package.json repository_after/package-lock.json* ./repository_after/
RUN cd repository_after && npm install

COPY . .

EXPOSE 5173

CMD ["npx", "jest"]
