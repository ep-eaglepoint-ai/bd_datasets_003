FROM node:20-alpine AS base

FROM base AS backend-deps
WORKDIR /app/backend
COPY repository_after/backend/package*.json ./
RUN npm install --omit=dev

FROM base AS frontend-deps
WORKDIR /app/frontend
COPY repository_after/frontend/package*.json ./
RUN npm install

FROM base AS frontend-builder
WORKDIR /app/frontend
COPY repository_after/frontend/package*.json ./
RUN npm install
COPY repository_after/frontend ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://backend:5000/api
ENV NEXT_PUBLIC_WS_URL=ws://backend:5000/ws
ENV NEXT_PUBLIC_HMAC_SECRET=your-hmac-secret-key-change-in-production
RUN npm run build

FROM base AS backend
WORKDIR /app
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY repository_after/backend ./
RUN mkdir -p logs
EXPOSE 5000
ENV NODE_ENV=production
CMD ["echo", "backend build success"]

FROM base AS frontend
WORKDIR /app
COPY --from=frontend-deps /app/frontend/node_modules ./node_modules
COPY --from=frontend-builder /app/frontend/.next ./.next
COPY --from=frontend-builder /app/frontend/public ./public
COPY --from=frontend-builder /app/frontend/package.json ./
COPY --from=frontend-builder /app/frontend/next.config.js ./
EXPOSE 3000
ENV NODE_ENV=production
CMD ["echo", "frontend build success"]

FROM base AS test
WORKDIR /app
COPY repository_after/backend/package*.json ./backend/
RUN cd backend && npm install
COPY repository_after/backend ./backend/
COPY tests ./tests/
WORKDIR /app/tests
RUN npm install

CMD ["npm", "test"]

FROM base AS evaluation
WORKDIR /app
COPY repository_after/backend/package*.json ./backend/
RUN cd backend && npm install
COPY repository_after/backend ./backend/
COPY tests ./tests/
WORKDIR /app/tests
RUN npm install
WORKDIR /app
COPY evaluation ./evaluation/
CMD ["node", "evaluation/evaluation.js"]
