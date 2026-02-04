FROM postgres:15-alpine

WORKDIR /app

# Copy all files
COPY . .

# Default command to run the evaluation
CMD ["psql", "-h", "db", "-U", "testuser", "-d", "testdb", "-f", "evaluation/evaluation.sql"]
