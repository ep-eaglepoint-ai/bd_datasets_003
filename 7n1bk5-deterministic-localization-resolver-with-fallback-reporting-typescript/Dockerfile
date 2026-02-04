FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

RUN apk add --no-cache python3 py3-pip
RUN if [ -f requirements.txt ]; then pip install --break-system-packages -r requirements.txt; fi

CMD ["npm", "test"]
