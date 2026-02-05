FROM golang:1.21-alpine

WORKDIR /app
COPY . .

# Environment variable to detect inside docker
ENV INSIDE_DOCKER=true

# Command runs the evaluation script
CMD ["go", "run", "evaluation/eval.go"]

