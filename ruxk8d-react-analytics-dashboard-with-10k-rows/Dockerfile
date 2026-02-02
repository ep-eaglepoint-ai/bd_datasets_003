FROM node:20-slim

WORKDIR /app

COPY repository_before/package.json ./package.json
RUN npm install

RUN npm install immer @tanstack/react-virtual

RUN npm install vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event --save-dev

COPY . .

CMD ["echo", "build success"]
