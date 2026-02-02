# Frontend Stage
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY repository_after/frontend/package*.json ./
RUN npm install
COPY repository_after/frontend ./
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Backend Stage
FROM python:3.11-slim AS backend
WORKDIR /app
COPY repository_after/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "repository_after.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
