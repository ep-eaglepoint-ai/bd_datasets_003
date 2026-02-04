# K0TUZ5 - Distributed Reservation System with Exponential Backoff

    ## Before Test Docker Command
    docker compose run --rm -e TEST_TARGET=before tests bash -c "go test ./tests || true"

    ## After Test Docker Command
    docker compose run --rm -e TEST_TARGET=after tests bash -c "go test ./tests || true"

    ## Evaluation Docker Command
    docker compose run --rm evaluator

    