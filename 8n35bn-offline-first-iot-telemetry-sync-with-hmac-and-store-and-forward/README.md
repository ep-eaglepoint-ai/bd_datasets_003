# 8N35BN - Offline-First IoT Telemetry Sync with HMAC and Store-and-Forward

## Running Tests

```bash
docker compose run app npm test
```

## Test Coverage

This implementation includes comprehensive Jest tests covering all 9 requirements:

1. ✅ **WAL Persistence** - Events are written to SQLite before attempting to send
2. ✅ **Batching** - Multiple events aggregated into single HTTP requests
3. ✅ **HMAC Authentication** - Client signs with SHA256, Server verifies with timingSafeEqual
4. ✅ **Idempotency** - Server deduplicates by Event ID, returns 200 for duplicates
5. ✅ **Non-blocking Sensor** - Fire-and-forget writes to WAL
6. ✅ **Volume Integrity** - Total volume matches after network recovery
7. ✅ **Replay Protection** - Timestamp validation within configurable window
8. ✅ **Graceful Error Handling** - ECONNRESET handled without crashing
9. ✅ **Concurrent Access Safety** - SQLite transactions prevent race conditions
