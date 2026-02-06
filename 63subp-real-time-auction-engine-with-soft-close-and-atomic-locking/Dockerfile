FROM node:20

WORKDIR /app


COPY repository_after/backend/package*.json ./backend/
COPY repository_after/frontend/package*.json ./frontend/


WORKDIR /app/backend
RUN npm install


WORKDIR /app/frontend
RUN npm install


WORKDIR /app

COPY repository_after/backend ./backend
COPY repository_after/frontend ./frontend

COPY tests /app/test

COPY evaluation /app/evaluation

RUN chmod +x /app/backend/node_modules/.bin/jest
RUN chmod +x /app/frontend/node_modules/.bin/vitest

EXPOSE 4000 5173

CMD ["sh", "-c", "node /app/backend/server.js & cd /app/frontend && npm run dev"]

