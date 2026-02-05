# Trajectory: Robust JSON Path Evaluator

## The Problem: Navigating Deeply Nested Structures
Imagine a configuration management system storing complex settings in JSON. You need to extract "database.connections[0].host" or "users[*].id".

The naive solution is `string.split(".")`. But this falls apart quickly:
1. **Arrays vs Objects:** `users[0]` vs `config['key']` requires distinct handling.
2. **Special Characters:** Keys like `data['server.host']` break dot-splitting.
3. **Robustness:** Missing keys should gracefully return `null`, not crash the app.
4. **Complexity:** Wildcards `[*]` require iterating and collecting results.

We need a **dedicated tokenizing parser** that understands the grammar of path expressions.

## The Solution: Tokenizer + Recursive Evaluator

Instead of regex or string splitting, we build a proper parser:

### 1. **Tokenization Strategy**
We process the path string character-by-character to classify segments into three types:
- **PROPERTY:** `name`, `['key']`, `["key"]`
- **INDEX:** `[0]`, `[-1]`
- **WILDCARD:** `[*]`

The tokenizer handles state machines for:
- **Quoted Strings:** Supports escaped quotes `['it\'s']`
- **Brackets:** Distinguishes between `[0]` (Index) and `['0']` (Property)

### 2. **Recursive Evaluation**
The `evaluate` method works like a pointer traversing a graph:
1. **Start** at the root object.
2. **Consume** the next token.
3. **Move** pointer:
   - If PROPERTY: Cast to `Map`, call `get()`.
   - If INDEX: Cast to `List`, check bounds, call `get()`.
   - If WILDCARD: Iterate all list elements, recursively evaluate remaining tokens for each, and collect results.
4. **Return** `null` immediately if any step hits a missing key or broken link.

### 3. **Fluent API Design**
To make usage cleaner, I implemented a builder pattern:
```java
// Static convenience
Object val = JsonPathEvaluator.evaluate(data, "users[0].name");

// Fluent style
Object val = JsonPathEvaluator.at("users[0].name").on(data);
```

## Implementation Steps

### Step 1: Defined the Token Structure
I created an inner `Token` class with a `Type` enum (`PROPERTY`, `INDEX`, `WILDCARD`) and a `value` field. This decouples parsing from execution.

### Step 2: Built the Tokenizer
The `tokenize(String path)` method is the brain. It loops through characters:
- Sees `.`: Skips (structural separator).
- Sees `[`: Checks next char. Discovers if it's digit (Index), quote (Property), or `*` (Wildcard).
- Else: Reads until next separator as a property name.

**Crucial Logic:** Handling escaped quotes. When inside `['...']`, the parser must ignore `\'` and only close on an unescaped `'`.

### Step 3: Implemented Evaluation Logic
The `evaluateTokens` method iterates through the generated tokens.
- **Strict Typing:** It throws `JsonPathException` if you try to index a Map or property-access a List.
- **Forgiving Traversal:** It returns `null` (doesn't throw) if a key is missing, matching the prompt's requirement for extensive null-safety.

### Step 4: Wildcard Support
When `[*]` is encountered, the evaluator creates a result list. It loops through the current current array, and for each item, recursively calls `evaluateTokens` with the *rest* of the path tokens.

## Why I Did It This Way

### Initial Thought: Regex Splitting
I considered splitting by `.`, but correctly parsing `['special.key']` (which contains a dot) makes regex incredibly painful and fragile.

**Correction:** A char-by-char state machine (Lexer) is much more robust and easier to unit test for edge cases like escaped quotes.

### Refinement: Handling `['0']` vs `[0]`
A common pitfall is treating everything in brackets as an index.
- `items[0]` -> Access List index 0
- `items['0']` -> Access Map key "0"

**Decision:** The tokenizer explicitly checks for quotes vs digits inside brackets to set the correct `Token.Type`.

### Design Choice: Checked vs Runtime Exceptions
The requirements asked for specific error handling.
- **Syntax Error** (e.g., `[unclosed`): Throws `JsonPathException`.
- **Logic Error** (e.g., missing key): Returns `null`.

## Testing Strategy

### Unit Tests (Verified 6 Scenarios)
1. **Dot Notation:** `user.name` -> "Alice"
2. **Array Access:** `items[0]` -> "Item0", `items[2]` -> null
3. **Complex Keys:** `data['special.key']` and `data['it\'s']`
4. **Wildcards:** `users[*].name` -> `["Bob", "Charlie"]`
5. **Fluent API:** Verified `at().on()` works identically.
6. **Error Handling:** Verified syntax errors throw exceptions and missing keys return null.

### Docker Evaluation System
I setup a standardized test runner:
- `tester-before`: Fails as expected (empty repo).
- `tester-after`: Passes all JUnit tests.
- `evaluator`: Compiles results into a JSON report.

## Key Learnings

1. **Tokenization Simplifies Execution**
   - separating parsing from evaluation made the `evaluate` loop clean and simple.

2. **Parsing is Tricky**
   - Handling escaped characters (`\'`) inside strings requires careful look-ahead/look-behind or state tracking in the loop.

3. **Wildcards are Recursive**
   - The easiest way to handle `[*]` is to map the remaining evaluation logic over the list.

4. **Strict vs Loose Typing**
   - It's important to strictly throw on type mismatches (Map vs List) but loosely return null on missing data. This aids debugging while keeping runtime behavior safe.

---

## 📚 Recommended Resources

**1. Read: Writing a Simple Parser**
Concepts on how to build a basic lexer/parser similar to what was done here.
*   [Crafting Interpreters: Scanning](https://craftinginterpreters.com/scanning.html)

