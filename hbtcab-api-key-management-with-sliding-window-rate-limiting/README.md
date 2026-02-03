# API Key Management with Sliding Window Rate Limiting

## Project Context
This project extends an existing Express + PostgreSQL developer platform API (which originally supported JWT-only authentication) to support safe programmatic access and abuse protection.
## Commands

### 1. Setup Environment
Builds the Node.js container and installs dependencies.

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'npm test || true'

docker compose run --rm -e REPO_PATH=repository_after app npm test

docker compose run --rm app node evaluation/evaluation.js
```
