# Trajectory: Full-Stack Secure Web Application with Replay Protection

## 1. Problem Analysis & Cryptographic Strategy
The primary threat vector is a **Man-in-the-Middle (MITM)** or a compromised client where a valid request (like a payment or profile change) is intercepted and re-sent. Standard JWTs don't prevent this if the token is still valid. 

* **Entropy & Nonces:** I researched the best way to generate nonces and decided on `crypto.randomUUID()` in the browser. It’s more performant than external libraries and provides enough entropy to prevent collisions.
* **Signature Strategy:** I evaluated HMAC-SHA256 vs. RSA signatures. I decided on **HMAC-SHA256** using a shared secret (stored in `.env`) because it's significantly faster for high-frequency API requests than asymmetric signing.
* **The "Clock Skew" Problem:** I identified that client and server clocks are rarely perfectly synced. I will implement a **5-minute drift window** to prevent false rejections while keeping the replay window narrow.

---

## 2. API & Logic Research: Replay Protection
I googled best practices for storing ephemeral security data to ensure the backend doesn't become a bottleneck or a memory hog.

* **Persistence:** I looked into the **TTL (Time To Live) Indexes** in MongoDB. By setting a TTL index on the `createdAt` field of a `Nonces` collection, I can ensure the database cleans itself up automatically without running a cron job.
* **Middleware Design:** I tested a custom Express middleware approach. The logic flow I settled on:
    1.  Extract `X-Nonce`, `X-Timestamp`, and `X-Signature`.
    2.  Check if `X-Timestamp` is within ±5 mins of `Date.now()`.
    3.  Check if `X-Nonce` exists in MongoDB.
    4.  Re-calculate the HMAC of the payload and compare it to the received signature.
* **Concurrency:** To handle race conditions where two identical requests hit the server at the same millisecond, I decided to use a **Unique Index** on the nonce field in MongoDB to force an atomic rejection.

---

## 3. Optimization & Authentication Patterns
A Staff-level architecture moves beyond basic auth. I researched how to combine Replay Protection with modern JWT patterns.

| Strategy | Implementation |
| :--- | :--- |
| **Silent Refresh** | I will use `HttpOnly` cookies for Refresh Tokens to prevent XSS-based token theft. |
| **Token Rotation** | Every time a refresh token is used, I will issue a *new* one and invalidate the old one to detect "Refresh Token Reuse." |
| **Rate Limiting** | I'll implement `express-rate-limit` but configure it to be more aggressive on routes that use the Replay Protection service (e.g., `/api/payments`). |
| **Payload Integrity** | I researched signing the entire stringified body vs. specific keys. I opted for the whole body to ensure no field is tampered with. |

---

## 4. Testing Strategy: Scenarios & Assertions
I have mapped the requirements to specific integration tests using Jest and Supertest:

1.  **Valid Request:** Ensure a request with a fresh nonce and correct HMAC returns `200 OK`.
2.  **The Replay Attack:** Send the *exact same* headers and body twice. Assert the second request returns `403 Forbidden` with a "Nonce already used" message.
3.  **The Timestamp Attack:** Modify the payload but keep an old timestamp. Verify the server rejects it as "Expired Request."
4.  **Signature Mismatch:** Modify the `amount` in a payment request body without updating the HMAC signature. Assert the backend detects the tampering.

---

## 5. Key Learning Resources
I validated the architecture using these high-authority resources:

* **[MongoDB Documentation: Expire Data by Setting TTL](https://www.mongodb.com/docs/manual/tutorial/expire-data/)** — Essential for managing the auto-deletion of used nonces.
* **[MDN Web Docs: Crypto.randomUUID()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)** — My research choice for generating secure, collision-resistant nonces on the frontend.
* **[OWASP: Replay Attack Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)** — Guided my decision to combine timestamps with nonces for a "best-of-both-worlds" defense.
* **[Node.js Crypto Module](https://nodejs.org/api/crypto.html)** — I googled the native hmac implementation to avoid adding heavy third-party dependencies.
* **[Auth0: Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)** — Best practices for secure session management in modern SPAs.