# Trajectory

## Goal

Build a fast, deterministic **secret-scanning CLI** suitable for pre-commit / CI gating. It should catch both:

- **Known credential formats** (via regex signatures)
- **Unknown/random-looking tokens** (via Shannon entropy)

and it must report **file + line number** with safe **redaction**.

## Thought process & steps

### 1) Start with the output contract

I started by defining what “done” looks like from the outside:

- The CLI prints a single JSON object.
- Every finding includes: `file`, `line`, `method` (`regex|entropy`), `type`, and `secretRedacted`.
- Entropy findings also include a numeric `entropy` score.

This made the rest of the implementation easier to test and reason about.

### 2) Implement signature (regex) detection first

Regex-based detection is deterministic and low-noise when patterns are specific.

I added patterns for:

- AWS Access Key IDs (AKIA/ASIA family)
- GitHub Personal Access Tokens (`ghp_...` etc.)
- Stripe secret keys (`sk_live_...` / `sk_test_...`)
- Private key headers (PEM/OpenSSH headers)

Then I verified that line-number reporting was correct by scanning line-by-line.

### 3) Add entropy detection for “unknown secret” cases

Many real-world secrets don’t match known formats, so I implemented Shannon entropy:

$$
H = -\sum_x p(x)\log_2 p(x)
$$

To reduce false positives, I limited candidates to:

- **contiguous alphanumeric** substrings
- length **≥ 21**
- entropy **≥ 4.5** (configurable)

This avoids scanning normal prose and random punctuation-heavy content.

### 4) Noise reduction and false-positive suppression

Entropy detectors can be chatty, so I added a couple of pragmatic filters:

- ignore UUIDs and long numeric IDs
- skip minified bundles (very long lines / `.min.*`)
- skip obvious binary and lockfiles

I then wrote a “false positive suppression” test using a UUID and a URL to make sure the entropy logic stays quiet on common non-secrets.

### 5) Performance: concurrency without blowing memory

To keep scanning fast on large trees, I used a small concurrency-limited promise pool. The key idea was: schedule file reads/scans concurrently, but cap the number of in-flight operations.

### 6) Test-driven verification

I added three unit tests as a minimum safety net:

- AWS regex hit + correct line number
- entropy hit on a random-looking alphanumeric token
- no entropy hits on UUID/URL

### 7) Tooling + packaging fixes (Docker + evaluation)

During verification, I found a mismatch between the evaluation runner and how tests are actually executed.

- The evaluation script initially invoked `node test` (which fails because tests are run by Jest via npm scripts).
- I updated the evaluation flow to run `npm test`.

Finally, I aligned Docker/Compose usage so tests and evaluation can run reliably in a container.

## Resources consulted

- Shannon entropy background (overview + intuition): https://en.wikipedia.org/wiki/Entropy_(information_theory)
- Node.js CLI patterns (shebang + argv parsing best practices): https://nodejs.org/api/process.html#processargv

