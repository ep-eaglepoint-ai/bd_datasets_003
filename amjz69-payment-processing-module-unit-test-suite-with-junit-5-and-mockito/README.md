# AMJZ69 - Payment Processing Module Unit Test Suite with JUnit 5 and Mockito

## Before Test Docker Command
```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'cd $REPO_PATH && mvn -B clean test'
```

## After Test Docker Command
```bash
docker compose run --rm -e REPO_PATH=repository_after app bash -c 'cd $REPO_PATH && mvn -B clean test'
```

## Evaluation Docker Command
```bash
docker compose run --rm app bash -c 'javac evaluation/Evaluation.java && java -cp evaluation Evaluation'
```
