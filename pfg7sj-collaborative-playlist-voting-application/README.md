# PFG7SJ - Collaborative Playlist Voting Application

```bash
    ## After Test Docker Command
    docker compose run --rm app sh -c "cd /app/repository_after/backend && npm install && npx jest /app/tests/api.test.js --rootDir /app"


    ## Evaluation Docker Command
    docker compose run --rm app node /app/evaluation/runEvaluation.js

    