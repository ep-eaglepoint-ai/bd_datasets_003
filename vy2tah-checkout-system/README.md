# VY2TAH - checkout system

```bash
    ## After Test Docker Command
        docker compose run --rm -w /app/repository_after app sh -c "mvn -q compile dependency:copy-dependencies -DoutputDirectory=target/lib && javac -cp 'target/classes:target/lib/*' ../tests/SystemTestSuite.java -d ../tests && java -cp 'target/classes:../tests:target/lib/*' SystemTestSuite"

    ## Evaluation Docker Command
    docker compose run --rm -w /app/evaluation app sh -c "java -cp '../repository_after/target/classes:./libs/*' Evaluation.java"
    