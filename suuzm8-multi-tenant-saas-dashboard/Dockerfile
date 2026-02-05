FROM python:3.11-slim AS app

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
                PIP_DEFAULT_TIMEOUT=120

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

CMD ["pytest", "-q", "--cov=repository_after/server", "--cov-report=term-missing", "tests"]


FROM node:20-bookworm AS test

WORKDIR /app

# Python + venv for backend tests
RUN apt-get update -y \
        && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
        && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv \
        && /opt/venv/bin/pip install --no-cache-dir -r /app/requirements.txt

ENV PATH="/opt/venv/bin:$PATH" \
                PIP_DISABLE_PIP_VERSION_CHECK=1

# Cache Node deps for client tests
COPY repository_after/client/package.json repository_after/client/package.json
COPY repository_after/client/package-lock.json repository_after/client/package-lock.json
RUN cd repository_after/client && npm ci --silent --include=dev

COPY . /app
