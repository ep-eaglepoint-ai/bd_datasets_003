# BEFORE

docker compose run --rm test-runner sh -lc "cd /app/repository_before && npm install --no-audit --no-fund && npm test -- --watchAll=false"

# AFTER (META TEST)

docker compose up --build

# EVALUATION

docker compose run --rm evaluation
