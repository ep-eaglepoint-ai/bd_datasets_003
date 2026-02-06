FROM node:18-alpine

WORKDIR /app

# Copy tests and evaluation code into the image (compose mounts override as needed)
COPY tests/ ./tests/
COPY evaluation/ ./evaluation/

CMD ["node", "tests/test_dino_meta.test.js"]
