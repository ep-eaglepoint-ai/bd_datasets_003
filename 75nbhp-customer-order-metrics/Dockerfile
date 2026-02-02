FROM postgres:15-alpine

WORKDIR /app

# Install pg_prove (optional, if we use pgTAP) or just basic tools
RUN apk add --no-cache perl make jq bash

# Copy the entire project
COPY . /app

# Ensure scripts continue even if one fails (for dev) or strict for CI?
# We'll rely on the test runner script to handle exit codes.
CMD ["/bin/bash"]
