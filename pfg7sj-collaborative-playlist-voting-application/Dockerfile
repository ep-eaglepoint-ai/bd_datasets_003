# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM node:20-slim

WORKDIR /app

COPY repository_after/backend/package*.json ./repository_after/backend/

RUN cd repository_after/backend && npm install

COPY . .

CMD ["bash", "-c", "cd repository_after/backend && npm test"]