# Run tests (defaults to repository_after)
docker compose run --rm app

# Run tests against repository_before (expected to fail for baseline)
docker compose run --rm app npm run test:before

# Run tests against repository_after explicitly
docker compose run --rm app npm run test:after