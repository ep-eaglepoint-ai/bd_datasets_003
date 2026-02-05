# Trajectory: Wildcard Path Matcher — From Ambiguous Globs to a Predictable Engine

**Objective:** I wanted to build a high-performance path-matching engine that behaves predictably under load, supports a small custom glob syntax, and enforces “poison patterns” with absolute precedence.

---

### 1. First Pass: I Started by Pinning Down the Real Contract

When I first read the requirements, I noticed the tricky part wasn’t just “match globs” — it was matching globs with _strict_ precedence rules and without leaning on heavyweight regex behavior.

So I wrote down my mental contract in plain language:

- The result must be **true only if** the target matches the include pattern **and** matches **none** of the poison patterns.
- Poisoning has absolute precedence: **Exclude beats include**, always.
- The wildcard syntax isn’t “whatever typical shells do”; it’s a specific, custom semantics set, and correctness matters more than compatibility.
- Performance constraints matter: this matcher must not blow up on long paths or patterns with lots of wildcards.

That contract became my north star: I treated every later decision as “does this preserve Include(target) AND NOT Exclude(target) with the specified wildcard rules?”

---

### 2. I Translated the Syntax Into Invariants (Requirements → Rules I Can Test)

I didn’t want to code based on vague intuition, so I turned each syntax feature into an invariant that should always hold:

- **Literal matching is exact**: any byte that’s not a wildcard must match exactly.
- **`?` matches exactly one character and never `/`**: it must fail at end-of-string and must not cross a segment boundary.
- **`*` matches zero or more characters within a single segment**: it can expand, but it must stop at `/`.
- **`**` matches zero or more path segments\*\*: it’s recursive and must work at the start, middle, and end.
- **Selection groups `(a|b|c)` behave like “choose one literal option here”**: multiple groups per pattern must work.
- **Poisoning is checked first**: if any poison pattern matches, the target is rejected immediately.

The moment I wrote these down, I started seeing “hidden” requirements:

- “Zero or more segments” implies `**` must handle _zero segments_ cleanly (not just “at least one”).
- The mention of backtracking implies I should expect patterns like `**/tests/*.go` and `*/**/x.go` to force multiple match paths.
- The memory/stack constraints imply I should prefer an iterative state machine with bounded stack growth rather than recursion that scales with input length.

---

### 3. My Early Implementation Decision: Segment-Aware Matching, Not Regex-Style

At first, it’s tempting to treat the pattern as a single stream of tokens and let `**` match any characters (including `/`). But the spec calls `**` a “recursive wildcard” that matches _path segments_, and the examples are phrased in terms of directories.

I realized that if I handled `**` purely as “match any characters,” I would end up with subtle bugs around “zero segments between slashes” (the classic `a/**/c.go` matching `a/c.go`).

So I deliberately separated the problem:

- At the _path level_, I match **segments** split by `/`.
- At the _segment level_, I match tokens like literals, `?`, `*`, and groups.
- A segment that is exactly `**` becomes a special control token: it can consume **zero or more** segments.

That decision gave me a stable mental model: segment-level wildcards never see `/`, and only `**` can bridge across segment boundaries.

---

### 4. The Backtracking Problem: I Wanted Predictable Behavior, Not Exponential Surprises

The biggest risk in glob engines is exponential backtracking when wildcards overlap. Patterns like `*/**/x.go` or repeated `**/**/**/a.go` can generate a combinatorial number of ways to match.

I approached this like a state-search problem:

- A “state” is a pair of indices (where I am in the pattern, where I am in the target).
- Wildcards create branches (e.g., `*` can match zero chars or consume another char; `**` can match zero segments or consume another segment).
- To keep it predictable, I track which states I’ve already explored so I don’t revisit them.

This is where my thinking shifted from “string matching” to “graph traversal with memoization.” It also gave me confidence that I could scale to deep paths without recursion.

---

### 5. How I Decided What to Test (and What to _Refuse_ to Let Pass)

My test strategy was to make the tests read like the requirements, then add stress/edge cases that reveal shortcut implementations.

I grouped tests mentally into four buckets:

1. **Core correctness**

- Exact matches vs mismatches
- Empty pattern/empty target
- Empty pattern/non-empty target

2. **Wildcard semantics**

- `?` matches exactly one character and fails at end-of-string
- `*` matches zero-or-more within a segment, but does not cross `/`
- `**` matches zero-or-more segments in the middle, at start, and at end

3. **Selection groups**

- Group chooses one of several literals
- Multiple groups in one pattern
- Empty alternative inside a group (optional prefix style)

4. **Precedence + negative cases**

- Poison overrides include even when include is universal (`**`)
- Poison patterns that are narrower than include still block matches

The key mindset I used was: a good test suite doesn’t just validate a correct implementation — it also reliably fails common “almost correct” ones.

So I added tests that would break:

- A matcher that treats `*` like `.*` (crossing slashes)
- A matcher that mishandles `**` when it needs to match _zero_ segments
- A matcher that checks include first and forgets poison precedence
- A matcher that does byte-based `?` matching and breaks on multi-byte characters

---

### 6. Iterative Refinement: Where My Assumptions Got Challenged

There were a few moments where my initial assumptions didn’t survive contact with the “verification details,” and I treated those as signals to tighten correctness.

**A. `**` semantics (zero segments)\*\*

I had to be very explicit about what “zero or more segments” means. The defining failure mode is `a/**/c.go` failing to match `a/c.go`. That pushed me to ensure `**` can always take the “consume zero segments” branch.

**B. Unicode correctness for `?`**

I initially reasoned “paths are bytes, so one byte is fine,” but that contradicts the plain-language promise of “one character.” In Go, “character” usually means “rune,” and I don’t want a matcher that breaks on perfectly valid UTF-8 filenames.

So I revised my mental rule:

- `?` must consume exactly one rune (not one byte) within a segment.

I used that to justify the specific test `?.go` matching `世.go`. If that fails, the matcher isn’t honoring the stated semantics.

**C. Normalization wasn’t specified, so I refused to guess**

I saw a potential footgun: targets like `./src/main.go` or `src//main.go` can be “equivalent” in some systems. But the prompt explicitly asks for a custom engine, and it doesn’t specify normalization.

I decided that ambiguity is worse than strictness in an infrastructure matcher. So I treated paths literally and wrote tests that lock that in:

- Double slashes are not implicitly collapsed.
- Dot-slash prefixes are not implicitly removed.
- Trailing slashes matter.

Those tests protect the engine from silently accepting “almost matching” inputs that could cause surprising watch behavior.

**D. Backtracking stress**

To validate that I wasn’t accidentally relying on happy-path matching, I added patterns that force lots of branching. My goal wasn’t micro-benchmarking — it was to ensure correctness doesn’t degrade into “hangs or timeouts” for realistic deep directory trees.

---

### 7. Final Reflection: What Made Me Confident This Is Robust

At the end, I evaluated robustness by asking myself: “If someone tried to cheat, would the tests catch it?”

Here’s what gave me confidence:

- The tests don’t just check success cases; they check _wrong-but-plausible_ behaviors (e.g., `*` crossing `/`, poison precedence bugs, byte-based `?`).
- The coverage includes edge cases that are easy to ignore in demos but show up in real repositories (UTF-8 filenames, repeated wildcards, empty group alternatives).
- My mental invariants match the written requirements, and each invariant is backed by at least one concrete test.

The “meta confidence” I got from the full run wasn’t simply “everything passed.” It was that the suite forced the implementation to respect the hard parts: segment-aware `**`, strict poisoning precedence, and correct handling of ambiguous inputs. That’s exactly the combination that tends to break in production if you only test the easy paths.
