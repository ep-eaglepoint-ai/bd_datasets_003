# Run tests
docker compose run --rm app

# Run tests against repository_before
docker compose run --rm app npm --prefix tests run test:before

# Run tests against repository_after explicitly
docker compose run --rm app npm --prefix tests run test:after