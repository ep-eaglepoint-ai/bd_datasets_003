# Trajectory: Secure Ephemeral Secret Sharing with Burn-on-Read

## The Problem: Permanent Footprints in Communication

Security teams need to share sensitive credentials (API keys, passwords, environment variables) without leaving permanent traces in chat logs or email history. Traditional methods create permanent records that can be:
- Accessed later by unauthorized parties
- Leaked through compromised email/chat systems
- Discovered through log analysis

We need a system where secrets are:
1. **Encrypted** before storage
2. **Accessible only once** (burn-on-read)
3. **Automatically deleted** after expiration (even if never read)
4. **Masked in the UI** until explicitly revealed (preventing shoulder-surfing)

## The Solution: Encrypted Storage with Atomic Deletion

We use a three-layer security approach:

1. **AES-256-GCM Encryption**: All secrets are encrypted before storage using industry-standard encryption. Each secret gets a unique random nonce, ensuring the same secret produces different ciphertext each time.

2. **Redis with Atomic Operations**: We store encrypted secrets in Redis with a TTL (Time To Live). When a secret is retrieved, we use a **Lua script** to atomically GET and DELETE it in a single operation. This prevents the "double-read" problem where two simultaneous requests could both successfully retrieve the same secret.

3. **Frontend Masking**: The React frontend never displays the secret until the user explicitly clicks a "Reveal Secret" button. This prevents shoulder-surfing attacks where someone could glance at a screen and see sensitive data.

## Implementation Steps

1. **Encryption Layer**: 
   - Generate or load a 32-byte AES-256 key (from environment variable or generate at startup)
   - Encrypt each secret with a random 12-byte nonce
   - Store both ciphertext and nonce (base64-encoded) in Redis

2. **Atomic Burn-on-Read**:
   - Use Redis Lua script to perform GET + DEL in a single atomic operation
   - This ensures only the first request succeeds, even with concurrent requests
   - Script pattern: `GET key → if exists: DEL key → return value`

3. **TTL Management**:
   - Store secrets with Redis EXPIRE command
   - User can set expiration (3.6 seconds to 7 days)
   - Secrets automatically deleted by Redis if never accessed

4. **Frontend Security**:
   - Fetch secret from API (which triggers burn-on-read)
   - Store secret in component state but **don't render it**
   - Show "Reveal Secret" button instead
   - Only render secret after explicit user click

5. **Race Condition Prevention**:
   - The Lua script ensures atomicity at the Redis level
   - Multiple concurrent requests for the same UUID will result in only one success
   - All others receive 404 "not found" response

## Why I did it this way

**Atomic Operations with Lua Scripts**: I use a Redis Lua script to perform GET + DEL as a single atomic operation. Without atomicity, two concurrent requests could both GET the secret before either DEL executes, resulting in both succeeding. The Lua script ensures GET and DEL happen atomically, preventing the double-read problem.

**Dynamic TTL Options**: I implemented a flexible system with preset quick-select options (15 min, 1 hour, 6 hours, 24 hours, 7 days) plus a custom time input allowing users to specify exact hours and minutes. This provides flexibility while maintaining ease of use, supporting TTLs from 3.6 seconds to 7 days.

**Explicit Reveal Button**: Even though the secret is fetched and stored in component state, it's never rendered in the DOM until the user explicitly clicks "Reveal Secret". This prevents shoulder-surfing attacks and ensures the secret isn't visible in page source inspection.

**Specific Error Messages**: I distinguish between "already read", "expired", and "never existed" scenarios with specific error messages, helping users understand what happened to their secret.

## Testing

We use a comprehensive testing strategy:

1. **Unit Tests**: 
   - Test encryption/decryption with various inputs (empty strings, unicode, special characters)
   - Verify Redis atomic operations prevent double-reads
   - Test TTL expiration behavior

2. **Integration Tests**:
   - Full API workflow: create → retrieve → verify deletion
   - Concurrent request handling (race condition tests)
   - Error scenarios (expired secrets, invalid UUIDs)

3. **Performance Tests**:
   - Verify read/write latency stays under 50ms
   - Measure Redis memory footprint per secret
   - Test memory cleanup after secret retrieval

4. **Frontend Tests**:
   - Verify secret is not in DOM until reveal button clicked
   - Test that secret appears after explicit user interaction
   - Verify shoulder-surfing prevention (secret not in page source)

Since Redis operations are critical, we use the actual Redis instance in tests (via Docker) rather than mocking, ensuring our atomic operations work correctly in a real environment.

---

### 📚 Recommended Resources

**1. Read: AES-GCM Encryption**

Understanding why AES-256-GCM is chosen for authenticated encryption and how nonces work.

*   [NIST: Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)

**2. Watch: Redis Lua Scripts**

A visual guide on how Lua scripts provide atomicity in Redis operations.

*   [YouTube: Redis Lua Scripts Explained](https://www.youtube.com/watch?v=_n6a7wqgZ8Y)

**3. Read: Burn-on-Read Pattern**

Understanding the security implications and use cases for one-time secret sharing.

*   [OWASP: Secure Data Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

**4. Read: Shoulder-Surfing Prevention**

Best practices for preventing visual information leakage in web applications.

*   [NIST: Guidelines for Managing the Security of Mobile Devices](https://csrc.nist.gov/publications/detail/sp/800-124/rev-2/final)
