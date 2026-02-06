# VY2TAH - checkout system

```bash
    ## After Test Docker Command
    docker compose run --rm -w /app/repository_after app sh run.sh

    ## Evaluation Docker Command
    docker compose run --rm -w /app/evaluation app sh -c "java -cp '../repository_after/target/classes:./libs/*' Evaluation.java"