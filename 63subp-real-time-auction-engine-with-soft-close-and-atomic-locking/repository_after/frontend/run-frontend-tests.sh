#!/bin/bash
set -e

echo "Running frontend integration tests..."

# Go to project root (from frontend)
cd ..

# Copy shared test into frontend src
cp tests/frontend.test.js frontend/src/integration.test.jsx

# Go back to frontend
cd frontend

# Run vitest
npx vitest run src/integration.test.jsx
