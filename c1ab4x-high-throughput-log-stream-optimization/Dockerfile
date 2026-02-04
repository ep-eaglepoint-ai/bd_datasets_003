FROM golang:1.21-alpine

RUN apk add --no-cache python3 py3-pip git bash

WORKDIR /app

COPY repository_before/ ./repository_before/
COPY repository_after/ ./repository_after/
COPY tests/ ./tests/
COPY evaluation/ ./evaluation/

RUN cd /app/tests && go mod download 2>/dev/null || true

ENV CGO_ENABLED=0

RUN printf '#!/bin/sh\ncase "$1" in\n  run_before)\n    cp /app/repository_before/main.go /app/tests/main.go\n    cd /app/tests\n    SOURCE_FILE=/app/repository_before/main.go go test -v ./... || true\n    ;;\n  run_after)\n    cp /app/repository_after/main.go /app/tests/main.go\n    cd /app/tests\n    SOURCE_FILE=/app/repository_after/main.go go test -v ./...\n    ;;\n  evaluate)\n    python3 /app/evaluation/evaluation.py\n    ;;\n  *)\n    echo "Usage: run_before | run_after | evaluate"\n    exit 1\n    ;;\nesac\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["evaluate"]
