# 3JU0GK - Atomic Inventory Management with Row-Level Locking

    ## Before Test Docker Command
    No command for before

    ## After Test Docker Command
    docker compose exec app sh -c "export PYTHONPATH=\$PYTHONPATH:/app:/app/repository_after && python manage.py test tests --noinput --keepdb"

    ## Evaluation Docker Command
    docker compose exec app python /app/evaluation/evaluation.py
    