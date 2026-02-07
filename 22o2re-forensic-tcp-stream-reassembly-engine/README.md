# 22O2RE - Forensic TCP Stream Reassembly Engine

    ## Before Test Docker Command
    Docker compose run --rm -e REPO_PATH="repository_before" pytest tests || true

    ## After Test Docker Command
    docker compose run --rm -e REPO_PATH="repository_after" app pytest tests 

    ## Evaluation Docker Command
    docker compose run --rm app
    