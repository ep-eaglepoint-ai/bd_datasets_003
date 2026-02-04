# Trajectory

## Analysis: How you deconstructed the prompt

When I first read the requirements, I immediately recognized this wasn't just about implementing RMSNorm—it was about creating a production-ready module that would work in real-world scenarios. Let me walk through my thought process:

**Initial Breakdown:**
I started by identifying what "advanced" meant in this context. The requirements mentioned:
- Multiple normalization axes (not just the last dimension)
- Mixed-precision support (critical for modern training)
- JIT/ONNX compatibility (needed for deployment)
- File size constraints (300 lines max - this would force modular design)

**Key Insight:** The 300-line limit wasn't just a constraint—it was telling me the code needed to be modular. This shaped my entire approach from the beginning.

**What I Focused On:**
1. **Core Algorithm**: RMSNorm formula is straightforward (normalize by RMS instead of mean/std), but the implementation complexity comes from edge cases
2. **Edge Cases**: Zero vectors, mixed precision, dynamic shapes—these are where bugs hide
3. **Compatibility**: JIT and ONNX have strict limitations—I needed to understand these upfront
4. **Testing Strategy**: Docker setup with before/after comparison—this suggested incremental development

**My Mental Model:**
I visualized the problem as three layers:
- **Mathematical layer**: RMS computation (simple)
- **PyTorch layer**: Tensor operations, broadcasting, dtype handling (moderate complexity)
- **Deployment layer**: JIT compilation, ONNX export (high complexity, many gotchas)

## Strategy: Why you chose this specific algorithm or pattern

### Decision 1: Modular File Structure

**My Thought Process:**
Initially, I thought I could fit everything in one file. But when I saw the 300-line limit and started coding, I realized:
- The core RMSNorm class alone would be ~200+ lines
- Helper methods for RMS computation and broadcasting would add ~100+ lines
- The residual variant would add another ~80 lines
- Total: ~380+ lines—way over the limit

**Why Split Into Three Files:**
I chose `rmsnorm.py`, `rmsnorm_utils.py`, and `rmsnorm_extensions.py` because:
- **Separation of concerns**: Core logic vs utilities vs extensions
- **Testability**: I could test utility functions independently
- **Reusability**: Other modules could use the utilities if needed
- **Maintainability**: Easier to find and fix bugs when code is organized

**The "Aha!" Moment:**
When I realized TorchScript has issues with methods calling other methods, extracting functions became even more valuable. Functions are easier to script than methods.

### Decision 2: Absolute Imports Over Relative

**What Happened:**
I initially used relative imports (`from .rmsnorm_utils import ...`) because that's the "proper" Python package way. But then tests failed with "attempted relative import with no known parent package."

**My Debugging Process:**
1. I checked how the test file imports modules—it adds `repository_after` to `sys.path`
2. This means modules are imported as top-level, not as a package
3. Relative imports only work when Python recognizes a package structure
4. The test environment doesn't create a package—it just adds a directory to the path

**Why Absolute Imports:**
- The test environment treats files as standalone modules
- Absolute imports work regardless of package structure
- Simpler mental model: "import from this file in the same directory"
- No need to worry about `__init__.py` structure for imports

**Reference Type Used:**
I consulted Python's import system documentation to understand when relative imports work vs when they don't. The key insight: relative imports require Python to recognize the directory as a package, which doesn't happen when you just add a directory to `sys.path`.

### Decision 3: TorchScript-Compatible List Operations

**The Problem:**
TorchScript compilation kept failing with cryptic errors about tuples not being iterable. This was frustrating because the code worked perfectly in regular Python.

**My Investigation:**
1. First error: `param_shape.extend(normalized_shape)` failed—TorchScript doesn't like extending lists with tuples
2. I tried `list(normalized_shape)`—still failed
3. I tried converting at call site—still failed
4. Finally realized: TorchScript's type system is stricter than Python's

**The Solution Process:**
I had to think about what TorchScript actually supports:
- It supports iterating over lists
- It supports `append()` operations
- It doesn't support tuple iteration
- It doesn't support `list()` constructor on tuples in all contexts

**Why Explicit Loops:**
```python
param_shape: List[int] = []
for _ in range(num_leading_dims):
    param_shape.append(1)
for dim in normalized_shape:  # normalized_shape is now List[int]
    param_shape.append(dim)
```

This approach:
- Uses only operations TorchScript guarantees
- Makes the type flow explicit
- Is easier for TorchScript to analyze
- Works reliably across PyTorch versions

**Reference Type Used:**
I referenced TorchScript language documentation to understand its limitations. The key was learning that TorchScript is a subset of Python, not full Python. Operations that work in Python might not work in TorchScript.

### Decision 4: Function Signature Changes for TorchScript

**The Evolution:**
1. Started with `normalized_shape: tuple` (natural Python type)
2. TorchScript failed—can't iterate tuples
3. Changed to `normalized_shape: List[int]` (TorchScript-friendly)
4. Updated call sites to convert: `list(self.normalized_shape)`

**Why This Works:**
- `self.normalized_shape` is a tuple (stored as tuple)
- Converting to list at call site happens at runtime
- TorchScript sees `List[int]` type in function signature
- The conversion happens before TorchScript compilation

**My Learning:**
Type annotations in TorchScript aren't just hints—they're constraints. The type system is strict, and you need to match what TorchScript expects, not what Python allows.

### Decision 5: Docker Testing Strategy

**Initial Approach:**
I thought about just running pytest locally, but the requirements mentioned Docker commands. This suggested:
- Consistency across environments
- Isolation of dependencies
- Reproducibility

**Why Environment Variables:**
The `REPO_PATH` environment variable approach came from understanding that:
- We need to test two different code states (before/after)
- Docker Compose makes it easy to pass environment variables
- The test file can read `REPO_PATH` and adjust imports accordingly
- This avoids duplicating test files or complex path manipulation

**The Evaluation Script:**
I realized we needed automated comparison, so I created `evaluation/evaluate.py` that:
- Runs tests for both states
- Captures results
- Generates JSON report
- Exits with appropriate status code

This pattern is common in CI/CD pipelines, so I modeled it after that approach.

## Execution: Step-by-step implementation details

### Phase 1: Starting with Core Implementation

**My Approach:**
I started by implementing the core `RMSNorm` class first, thinking I'd add features incrementally. But I quickly realized I needed to understand the full scope.

**What I Did:**
1. Implemented `__init__` with all parameters—this forced me to think about defaults
2. Implemented `forward()` method—this is where complexity lives
3. Added helper methods inline first—to understand the flow
4. Then extracted them—once I understood what was needed

**Key Insight:** Writing everything inline first helped me understand dependencies. Then extracting to separate functions was straightforward.

### Phase 2: Encountering the File Size Problem

**The Moment:**
When I finished the first version, I checked line count: 332 lines. Over the limit!

**My Thought Process:**
1. "Can I shorten the code?" - Tried, but lost clarity
2. "What can I extract?" - Helper methods were obvious candidates
3. "Where do they belong?" - Utilities file made sense
4. "What about the residual variant?" - Separate file for extensions

**The Refactoring:**
Moving code to `rmsnorm_utils.py` wasn't just cutting and pasting. I had to:
- Think about function signatures (what parameters are needed?)
- Consider what the class needs access to (instance variables vs parameters)
- Make functions pure where possible (easier to test and script)

**Result:** Clean separation, all files under 300 lines, better organization.

### Phase 3: The Import Nightmare

**What Happened:**
Tests started failing with import errors. This was confusing because the code structure looked correct.

**My Debugging Steps:**
1. Checked if files exist - yes
2. Checked import syntax - looked correct
3. Ran Python import manually - worked!
4. Ran pytest - failed!

**The Realization:**
The test file modifies `sys.path`, which changes how Python resolves imports. Relative imports assume package structure, but `sys.path` manipulation doesn't create packages.

**The Fix:**
Changed all relative imports to absolute. This was a simple change but required understanding Python's import system deeply.

**What I Learned:**
Import systems are subtle. What works in one context (direct execution) might not work in another (test environment with path manipulation).

### Phase 4: TorchScript Compatibility Journey

**Initial Confidence:**
"I'll just use standard PyTorch operations, it'll work!" - Famous last words.

**Reality Check:**
TorchScript failed immediately. The errors were cryptic and hard to debug.

**My Debugging Process:**
1. **First Error**: Tuple iteration issue
   - Error message: "tuple object is not iterable"
   - My thought: "But tuples ARE iterable in Python!"
   - Realization: TorchScript != Python

2. **Second Error**: List extension issue
   - Error message: "Cannot match List[t] to tuple"
   - My thought: "I'm converting it!"
   - Realization: TorchScript analyzes types statically, conversion happens at runtime

3. **Third Error**: Still tuple iteration
   - Error message: Same as first
   - My thought: "I changed it to List[int]!"
   - Realization: Need to change function signature AND call sites

**The Solution:**
I had to think like TorchScript:
- What types does it see at compile time?
- What operations does it support?
- How can I make types explicit?

**The Pattern I Developed:**
1. Use `List[int]` instead of `tuple` in function signatures
2. Convert tuples to lists at call sites
3. Use explicit loops instead of list comprehensions or extend()
4. Add type annotations everywhere

**Why This Matters:**
TorchScript compilation happens before runtime. It needs to understand types statically. Python's dynamic nature doesn't help here—you need to be explicit.

### Phase 5: Docker Setup and Testing

**Why Docker:**
The requirements mentioned Docker commands, which told me:
- This needs to work in containers
- Dependencies must be isolated
- Environment should be reproducible

**My Dockerfile Strategy:**
- Used `python:3.11-slim` - small, official image
- Installed only what's needed - faster builds
- Set working directory - clean organization

**Docker Compose Decision:**
I used Compose instead of just Docker because:
- Easier to manage services
- Built-in volume mounting
- Environment variable passing
- Standard pattern for development

**The Three Commands:**
1. Test before state (with `|| true` to allow failure)
2. Test after state (must pass)
3. Run evaluation (generates report)

This pattern allows the CI system to:
- See if baseline fails (expected)
- Verify new code works
- Get automated report

**Evaluation Script Design:**
I modeled it after CI/CD evaluation patterns:
- Run both test suites
- Capture results
- Generate structured output (JSON)
- Exit with status code

This makes it easy to integrate into automated systems.

## Resources: Links to documentation or concepts used

### Type 1: Algorithm and Theory References

**RMSNorm Paper (arXiv:1910.07467)**
- **Why I Used It**: Needed to understand the mathematical foundation
- **What I Learned**: RMSNorm normalizes by root mean square instead of mean/std deviation
- **How It Helped**: Confirmed my implementation approach was correct
- **When I Referenced**: At the start, to ensure I understood the algorithm correctly

**PyTorch nn.Module Documentation**
- **Why I Used It**: Understanding the base class I was inheriting from
- **What I Learned**: How to properly register parameters, handle state, and implement forward()
- **How It Helped**: Ensured I followed PyTorch conventions correctly
- **When I Referenced**: Throughout implementation, especially for parameter registration

### Type 2: Compatibility and Deployment References

**TorchScript Language Reference**
- **Why I Used It**: Needed to understand what Python features TorchScript supports
- **What I Learned**: TorchScript is a subset of Python with strict limitations
- **How It Helped**: Explained why tuple iteration failed and how to fix it
- **When I Referenced**: When debugging TorchScript compilation errors
- **Key Insight**: Not all Python code can be scripted—need to use supported operations

**PyTorch ONNX Export Documentation**
- **Why I Used It**: Ensuring the module could be exported to ONNX
- **What I Learned**: ONNX has similar constraints to TorchScript
- **How It Helped**: Confirmed that using standard PyTorch operations would work
- **When I Referenced**: During design phase, to ensure compatibility

### Type 3: Python Language References

**Python Typing Module Documentation**
- **Why I Used It**: Needed proper type hints for TorchScript and code clarity
- **What I Learned**: How to use `List`, `Optional`, `Union`, `Tuple` correctly
- **How It Helped**: Made code more maintainable and helped catch errors early
- **When I Referenced**: When writing function signatures and class definitions

**Python Import System Documentation**
- **Why I Used It**: Understanding why relative imports failed
- **What I Learned**: How Python resolves imports differently in packages vs modules
- **How It Helped**: Explained the import errors and how to fix them
- **When I Referenced**: When debugging import issues
- **Key Insight**: `sys.path` manipulation doesn't create packages—it just adds search paths

### Type 4: Tooling and Infrastructure References

**Docker Compose Documentation**
- **Why I Used It**: Setting up the testing environment
- **What I Learned**: How to structure services, volumes, and environment variables
- **How It Helped**: Created a clean, reproducible testing setup
- **When I Referenced**: When creating `docker-compose.yml`

**Pytest Documentation**
- **Why I Used It**: Understanding how to structure tests
- **What I Learned**: How pytest discovers tests and handles imports
- **How It Helped**: Explained why test file needed specific import setup
- **When I Referenced**: When debugging test discovery and import issues

### Type 5: Design Pattern References

**Single Responsibility Principle**
- **Why I Used It**: Guiding file organization
- **What I Learned**: Each module should have one clear purpose
- **How It Helped**: Decided to split into core, utilities, and extensions
- **When I Referenced**: When deciding how to organize code

**DRY (Don't Repeat Yourself)**
- **Why I Used It**: Avoiding code duplication
- **What I Learned**: Extract common functionality into reusable functions
- **How It Helped**: Created utility functions for RMS computation and broadcasting
- **When I Referenced**: When refactoring to meet file size limits

### How I Used References Strategically

**During Design Phase:**
- Read RMSNorm paper to understand algorithm
- Checked PyTorch patterns to follow conventions
- Reviewed TorchScript limitations to design compatible code

**During Implementation:**
- Referenced PyTorch docs for specific API calls
- Used typing docs for proper type annotations
- Checked examples for similar implementations

**During Debugging:**
- Deep-dived into TorchScript docs when compilation failed
- Consulted Python import docs when imports broke
- Referenced error messages and stack traces

**Key Learning:**
Different types of references serve different purposes:
- **Theory references** (papers): Understand the "why"
- **API references** (docs): Understand the "how"
- **Language references**: Understand the "what's allowed"
- **Pattern references**: Understand the "best practices"

The most valuable references were the ones that explained *why* something works or doesn't work, not just *how* to do it. Understanding the underlying principles helped me solve problems I hadn't encountered before.
