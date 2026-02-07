# Trajectory: Multi‑Tenant SaaS Dashboard — My Thought Process

### How I framed the work

I treated this as a **multi‑tenant security problem first**, and a dashboard product second. The UI and CRUD are straightforward to demo; the tricky part is making sure tenant boundaries, permissions, and lifecycle flows stay correct even when a user (or attacker) tries the “obvious shortcuts.”

The mental model I kept repeating was:

- Scope everything to an organization.
- Make membership the source of truth.
- Prefer structural guarantees over scattered conditionals.

### The design choices I intentionally made

I biased toward patterns that reduce the number of places a bug can hide:

- **Tenant scoping as a structure, not a convention**: I wanted org‑owned reads/writes to be naturally constrained by the org context, instead of relying on individual endpoints remembering to filter.
- **Reusable authorization primitives**: instead of “if role == …” sprinkled around, I aimed for a small set of permission checks that encode the hierarchy once.
- **Invariants enforced where state changes**: limits/uniqueness should hold regardless of which endpoint or workflow triggers the write.
- **Transactional lifecycle flows**: anything that can be double‑submitted (join/accept style flows) should behave deterministically.
- **Caching that’s scoped and measurable**: caching is only worth it if it cannot leak across tenants and if I can detect when performance regresses.

### How I used tests (what I was trying to prove)

My testing approach was: don’t just prove the happy path works — prove the common “almost correct” implementations fail.

So I wrote tests that try to:

- Access data across tenants by guessing identifiers.
- Perform actions with insufficient roles.
- Re‑submit lifecycle actions (e.g., accept twice).
- Exercise “failure mode quality” (clear errors, predictable status codes, and retry hints where relevant).

On the client side, I focused on the user‑visible contract: loading states aren’t cosmetic; they prevent misleading UI. And error strings matter because they’re what users see.

### Iteration: what changed as I learned

As I added coverage, I found the same theme repeating: correctness isn’t a one‑off check; it’s a pattern that can regress when new endpoints are added.

That pushed me toward:

- Making scoping and permissions more systematic.
- Treating concurrency‑sensitive workflows as transactions.
- Keeping test output clean, so real regressions aren’t buried.

### What “robust” meant to me at the end

I didn’t define “robust” as “tests pass.” I defined it as: if someone tries the shortcuts (cross‑tenant access, role escalation, double submission), the system consistently denies or behaves safely — and the test suite would catch a regression.
