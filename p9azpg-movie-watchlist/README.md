# P9AZPG - movie watchlist

    ## Before Test Docker Command
    <docker before command here>

    ## After Test Docker Command
    <docker after command here>
    # Generate the database First to test
    docker compose run --rm app npm run db:push
    docker compose run --rm -e REPO_PATH=repository_after app npm test

    ## Evaluation Docker Command
    <evaluation command here>
    docker compose run --rm app node evaluation/evaluation.js
