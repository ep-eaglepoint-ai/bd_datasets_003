# Backend API tests only
docker-compose run --rm test-runner npm run test:backend

# Frontend component tests only  
docker-compose up -d db api frontend

# Integration/E2E tests only
docker-compose run --rm test-runner npm run test:integration

# Evaluation
docker-compose run --rm test-runner node evaluation/evaluation.js
    