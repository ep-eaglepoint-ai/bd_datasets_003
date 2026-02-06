# 63SUBP - Real-Time Auction Engine with Soft Close and Atomic Locking

docker compose run --rm -e REPO_PATH=repository_before app bash -c "npm --prefix /app/backend test || true && npm --prefix /app/frontend test || true"
 

docker compose run --rm -e REPO_PATH=repository_after app bash -c "rm -f /app/backend/data/auction.db && node /app/backend/server.js & sleep 7 && /app/backend/node_modules/.bin/jest /app/test/backend.test.js --runInBand --config /app/backend/package.json --rootDir /app --modulePaths /app/backend/node_modules && cp /app/test/frontend.test.js /app/frontend/src/integration.test.jsx && sed -i 's|../repository_after/frontend/src/components/AuctionComponent|./components/AuctionComponent|g' /app/frontend/src/integration.test.jsx && cd /app/frontend && npx vitest run src/integration.test.jsx"


docker compose run --rm app node //app/evaluation/evaluation.js


