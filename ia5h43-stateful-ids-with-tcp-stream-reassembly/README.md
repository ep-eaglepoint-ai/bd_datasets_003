# IA5H43 - Stateful IDS with TCP Stream Reassembly

    ## Before Test Docker Command
    docker build -t ids_final . && docker run --rm ids_final python3 -u tests/test_ids.py

    ## After Test Docker Command
    docker build -t ids_final . && docker run --rm ids_final python3 -u tests/test_ids.py

    ## Evaluation Docker Command
    docker run --rm -v $(pwd)/evaluation:/app/evaluation ids_final /bin/bash -c 'python3 evaluation/evaluation.py'
    