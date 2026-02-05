FROM golang:1.25-alpine

WORKDIR /app

# Copy go module files
COPY go.mod ./

# Copy all source directories
COPY repository_after ./repository_after
COPY repository_before ./repository_before
COPY tests ./tests
COPY evaluation ./evaluation

# Default command runs the evaluation
CMD ["go", "run", "evaluation/evaluate.go"]
