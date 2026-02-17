
# After 
docker compose up --build --abort-on-container-exit --exit-code-from test-runner test-runner

# Evaluation
docker compose run --rm test-runner node evaluation/evaluation.js

echo $LASTEXITCODE
    