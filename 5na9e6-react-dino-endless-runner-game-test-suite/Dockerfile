FROM node:18-alpine

WORKDIR /app

# Copy only what's needed
COPY tests/ ./tests/
COPY repository_after/src/__tests__/DinoGame.test.jsx ./tests/suite.jsx
COPY tests/resources/dino/ ./tests/resources/dino/

# Run the meta test
CMD ["node", "tests/test_dino_meta.test.js"]