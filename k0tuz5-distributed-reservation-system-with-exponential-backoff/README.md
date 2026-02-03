# K0TUZ5 - Distributed Reservation System with Exponential Backoff

    ## Before Test Docker Command
    docker compose run --rm -e REPO_PATH=repository_before app bash -c 'go test || true'

    ## After Test Docker Command
    docker compose run --rm -e REPO_PATH=repository_after app go test

    ## Evaluation Docker Command
    docker compose run --rm app go run evaluation/evaluation.js
    