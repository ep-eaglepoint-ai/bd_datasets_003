# O5ES9D - plant shop api test

```bash

   ## Before Test Docker Command
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'npm test || true'

   ## After Test Docker Command
docker compose run --rm -e REPO_PATH=repository_after app npm test

   ## Evaluation Docker Command
docker compose run --rm app node evaluation/evaluation.js
```
