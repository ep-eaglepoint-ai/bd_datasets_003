FROM alpine:3.19

# Install Python
RUN apk add --no-cache python3

WORKDIR /app

# Copy the source files
COPY . .

# Run the execution script
CMD ["python3", "main.py"]