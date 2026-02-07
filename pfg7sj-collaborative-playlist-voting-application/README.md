# PFG7SJ - Collaborative Playlist Voting Application

```bash
    ## After Test Docker Command
    docker compose run --rm app sh -c "cd /project/repository_after/backend && npm install --silent && npx jest /project/tests/api.test.js --rootDir /project --moduleDirectories /project/repository_after/backend/node_modules --moduleDirectories /project/node_modules"


    ## Evaluation Docker Command
    docker compose run --rm app node /project/evaluation/runEvaluation.js

    