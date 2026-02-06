FROM node:18-slim

WORKDIR /app

# Copy project files
COPY . .

# Install dependencies at root level
RUN npm install

CMD ["npm", "test"]
