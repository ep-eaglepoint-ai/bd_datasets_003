# Trajectory: Task Scheduler with Lexicographically Smallest Optimal Schedule

## Analysis: How I Deconstructed the Prompt

From the start, I identified that this task required solving a classic task scheduling problem with an additional lexicographic ordering constraint. The requirements implied both algorithmic correctness and careful implementation to handle edge cases.

Key requirements I extracted:

1. **Minimize total slots** - Classic task scheduler optimization problem
2. **Lexicographically smallest** - Among all optimal schedules, return the one with smallest task IDs first
3. **Cooldown constraint** - Same tasks must be separated by at least `n` slots
4. **Prefer tasks over idle** - Real tasks are lexicographically smaller than 'idle'
5. **Handle edge cases** - Empty tasks, n=0, single task type, large inputs
6. **Support multiple data types** - Task IDs can be characters or integers
7. **Comprehensive testing** - All requirements must be verified through tests

I framed the problem in three layers:

**Mathematical layer:** Classic task scheduler formula for minimum slots: `max(len(tasks), (max_freq - 1) * (n + 1) + num_max_tasks)`

**Algorithmic layer:** Greedy approach that ensures optimal length while maintaining lexicographic order

**Implementation layer:** Python implementation with proper edge case handling, testing infrastructure, and Docker-based evaluation

The challenge was balancing two objectives:
- **Optimal length** (minimize total slots) - requires prioritizing high-frequency tasks
- **Lexicographic order** - requires choosing smallest task ID when multiple tasks are available

## Strategy: Why This Design and Patterns Were Chosen

### Greedy Algorithm with Dual Priority

I chose a greedy algorithm that prioritizes tasks in two stages:

1. **First priority:** Tasks with highest remaining count (ensures optimal length)
2. **Second priority:** Smallest task ID among tasks with same count (ensures lexicographic order)

This approach guarantees:
- **Optimal length:** By always scheduling high-count tasks first, we prevent situations where we'd need extra slots
- **Lexicographic order:** By breaking ties with smallest ID, we ensure the lexicographically smallest schedule among all optimal schedules

**Why not other approaches?**

- **Brute force:** Would be exponential and impractical for 10^4 tasks
- **Dynamic programming:** Overkill for this problem; greedy is sufficient and more efficient
- **Priority queue with single criterion:** Wouldn't guarantee both optimal length and lexicographic order

### Modular Function Design

The solution is structured into clear, testable functions:

- `calculate_minimum_slots()` - Pure function for theoretical minimum calculation
- `schedule_tasks()` - Core scheduling algorithm
- `solve()` - Main entry point for clean API

This separation allows:
- **Testability:** Each function can be tested independently
- **Maintainability:** Clear separation of concerns
- **Reusability:** Minimum slots calculation can be reused for validation

### Test-Driven Development Approach

I created comprehensive tests covering:

1. **Basic examples** - Verify correctness on provided examples
2. **Optimal length** - Ensure schedules are truly minimal
3. **Lexicographic ordering** - Verify smallest IDs are chosen
4. **Cooldown constraints** - Ensure no violations occur
5. **Edge cases** - Handle empty tasks, n=0, single task type
6. **Different data types** - Support both characters and integers
7. **Performance** - Test with larger inputs

This ensures the solution is robust and meets all requirements.

### Docker-Based Evaluation Strategy

Docker was used to guarantee:

- **Environment consistency** - Same Python version and dependencies across all runs
- **Isolation** - Tests run in clean environment
- **Reproducibility** - Before/after comparison is reliable
- **CI/CD compatibility** - Matches real-world deployment workflows

The evaluation script generates structured JSON reports with test results, pass rates, and comparison metrics.

## Execution: Step-by-Step Implementation

### Step 1: Implement Minimum Slots Calculation

First, I implemented the `calculate_minimum_slots()` function using the classic task scheduler formula:

```python
min_slots = (max_freq - 1) * (n + 1) + num_max_tasks
```

This provides the theoretical minimum, which we use to verify our schedule is optimal.

### Step 2: Core Scheduling Algorithm

Implemented the greedy scheduling algorithm:

1. Track remaining task counts using `Counter`
2. Track last position where each task was used
3. For each slot:
   - Find all available tasks (cooldown expired, count > 0)
   - Group by remaining count
   - Choose task with highest count
   - Among tasks with same count, choose smallest ID
   - If no task available, use 'idle'
4. Continue until all tasks are scheduled

### Step 3: Handle Edge Cases

- **n = 0:** Return sorted tasks (no cooldown needed)
- **Empty tasks:** Return empty list
- **Single task:** Handle correctly
- **Large n:** Ensure cooldown is still satisfied

### Step 4: Lexicographic Ordering

The key insight: When multiple tasks are available with the same remaining count, we must choose the smallest ID. This ensures lexicographic order while maintaining optimal length.

### Step 5: Comprehensive Testing

Created 28 tests covering:
- Basic functionality
- Optimal length verification
- Lexicographic ordering
- Cooldown constraints
- Edge cases
- Different data types
- Performance scenarios

### Step 6: Evaluation Infrastructure

Built evaluation script that:
- Runs pytest tests
- Captures test results
- Generates JSON reports
- Supports comparison mode (before vs after)
- Handles REPO_PATH environment variable for Docker compatibility

### Step 7: Docker Integration

Configured Docker setup:
- Updated docker-compose.yml
- Created Docker commands in README
- Made tests respect REPO_PATH environment variable
- Added graceful handling for empty repository_before

### Step 8: Documentation and Cleanup

- Updated README with Docker commands
- Created commands.json for structured command reference
- Updated .gitignore to exclude generated files
- Ensured all files follow best practices

## Resources: Documentation and References Used

### Algorithm & Theory

**Task Scheduler Problem:**
- Classic greedy algorithm for task scheduling with cooldown
- Formula for minimum slots: `(max_freq - 1) * (n + 1) + num_max_tasks`
- Reference: Standard algorithms textbook problem

**Lexicographic Ordering:**
- Python's natural ordering for strings and integers
- Comparison operators (`<`, `>`) work correctly for both types

### Python Language

**Collections Module:**
- Counter: https://docs.python.org/3/library/collections.html#collections.Counter
- Used for efficient task counting and frequency analysis

**Type Hints:**
- Typing Module: https://docs.python.org/3/library/typing.html
- Used `List[Union[str, int, str]]` for schedule return type

**Environment Variables:**
- os.environ: https://docs.python.org/3/library/os.html#os.environ
- Used for REPO_PATH in Docker compatibility

### Testing

**Pytest Framework:**
- Pytest Documentation: https://docs.pytest.org/en/stable/
- Used for comprehensive test suite

**Test Organization:**
- Class-based test organization for logical grouping
- Helper methods for common verification (cooldown checking)

### Docker & Containerization

**Docker Documentation:**
- Docker Compose: https://docs.docker.com/compose/
- Used for consistent test environments

**Docker Commands:**
- `docker compose run --rm` for one-off test execution
- Environment variable passing with `-e REPO_PATH=...`

### File Structure & Organization

**Python Import System:**
- sys.path manipulation: https://docs.python.org/3/library/sys.html#sys.path
- Used to dynamically import from repository_before or repository_after

**Git Ignore Patterns:**
- .gitignore best practices
- Excluded evaluation reports, test artifacts, and generated files

## Final Note

This trajectory reflects an engineering-driven approach focused on:

1. **Correctness:** Algorithm ensures optimal length and lexicographic order
2. **Robustness:** Comprehensive edge case handling
3. **Testability:** Full test coverage with 28 tests
4. **Maintainability:** Clean code structure with clear separation of concerns
5. **Deployability:** Docker-based evaluation matching real-world CI/CD workflows

The solution balances algorithmic efficiency (O(m × k) time complexity) with code clarity, ensuring it meets all requirements while remaining maintainable and testable.
