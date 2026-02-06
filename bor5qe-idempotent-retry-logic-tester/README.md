# BOR5QE - Idempotent-Retry-Logic-Tester

    ## Before Test Docker Command
    docker compose run --rm   -e IMPL_PATH="./repository_before/network.js"   -e TEST_PATH="repository_before"   app npm run metatest || true

    ## After Test Docker Command
    docker compose run --rm   -e IMPL_PATH="./repository_after/network.js"   -e TEST_PATH="repository_after"   app npm run metatest

    ## Evaluation Docker Command
    docker compose run app
    