# 5TPLRQ - GraphQL Subscription Server for Real-time Collaboration

    ## Before Test Docker Command
    docker compose up --build --exit-code-from tests

    ## After Test Docker Command
    docker compose up --build --exit-code-from tests

    ## Evaluation Docker Command
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v $(pwd):$(pwd) -w $(pwd) docker:latest sh -c "apk add --no-cache nodejs npm && npm install -g tsx && npx tsx evaluation/evaluation.ts"
    
