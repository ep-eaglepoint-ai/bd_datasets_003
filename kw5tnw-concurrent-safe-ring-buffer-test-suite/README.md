# KW5TNW - Concurrent-Safe-Ring-Buffer-Test-Suite

## Before Test Docker Command
docker-compose run --rm app sh -c 'go test -v ./repository_after || true'

## After Test Docker Command
docker-compose run --rm app go test -v ./tests

## Evaluation Docker Command
docker-compose run --rm app go run evaluation/evaluation.go