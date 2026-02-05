# BEFORE (SKIPPED)

docker compose run --rm noop

# AFTER (META TEST)

docker compose up --build

# EVALUATION

docker compose run --rm evaluation
