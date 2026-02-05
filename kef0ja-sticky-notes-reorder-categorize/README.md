# Run tests
docker compose run --rm app

# Run tests against repository_before
docker compose run --rm app npm run test:before

# Run tests against repository_after explicitly
docker compose run --rm app npm run test:after