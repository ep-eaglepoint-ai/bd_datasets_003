# OU64FL - cpp-collection-implementation

```bash

   ## Before Test Docker Command
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'cd /app && mkdir -p build && cd build && cmake .. && make && ./bin/record_processor || true'

   ## After Test Docker Command
docker compose run --rm -e REPO_PATH=repository_after app bash -c 'cd /app && mkdir -p build && cd build && cmake .. && make && ./bin/record_processor'

   ## Evaluation Docker Command
docker compose run --rm app bash -c 'cd /app && mkdir -p build && cd build && cmake .. && make && ./bin/evaluate'
```
