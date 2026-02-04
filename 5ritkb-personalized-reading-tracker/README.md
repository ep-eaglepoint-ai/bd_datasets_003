```bash
    ## Before Test Docker Command
docker compose run --rm -e REPO_PATH=repository_after app pytest -v tests/test_api.py
    

    ## After Test Docker Command
docker compose run --rm -e REPO_PATH=repository_after app pytest tests/test_api.py

    ## Evaluation Docker Command
docker compose run --rm app python evaluation/evaluation.py
    