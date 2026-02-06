
        FROM node:18-bullseye

WORKDIR /app

# Install TypeScript tools globally
RUN npm install -g typescript ts-node @types/node

# Copy the rest (requirements.txt is not needed for a pure TS environment, but we ensure /app exists)
COPY . /app

# Default command
CMD ["ts-node", "evaluation/evaluator.ts"]
