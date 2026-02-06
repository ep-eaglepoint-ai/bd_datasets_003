FROM node:18-alpine
WORKDIR /app

COPY tests/package.json tests/package-lock.json ./tests/
RUN npm --prefix tests ci

COPY . .

RUN sed -i 's/\r$//' /app/run \
	&& printf '#!/bin/sh\nexec node /app/run "$@"\n' > /usr/local/bin/run \
	&& chmod +x /usr/local/bin/run

CMD ["node", "evaluation/evaluation.js"]
