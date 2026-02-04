# PFQG33 - typed-event-emitter

```bash
## After Test Docker Command
docker compose run --rm -w /app/repository_after app npx -y ts-node --project tsconfig.json ../tests/event-emitter.test.ts

## Evaluation Docker Command
docker compose run --rm -w /app/repository_after app npm install; docker compose run --rm -e NODE_PATH=/app/repository_after/node_modules app node evaluation/evaluate.js