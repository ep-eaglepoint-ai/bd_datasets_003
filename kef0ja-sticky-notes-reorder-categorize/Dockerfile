FROM node:18-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN sed -i 's/\r$//' /app/run \
	&& printf '#!/bin/sh\nexec node /app/run "$@"\n' > /usr/local/bin/run \
	&& chmod +x /usr/local/bin/run

CMD ["npm", "test"]