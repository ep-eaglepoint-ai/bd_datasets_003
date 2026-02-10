# 3JU0GK - Atomic Inventory Management with Row-Level Locking

    ## Before Test Docker Command
    No command for before

    ## After Test Docker Command
    
    docker compose run --rm app python manage.py test tests --noinput --keepdb ; \
    docker compose run --rm frontend sh -c 'cd /app/repository_after/frontend && npm install @testing-library/jest-dom && npm run test'



    ## Evaluation Docker Command
    docker compose run --rm app python /app/evaluation/evaluation.py

    