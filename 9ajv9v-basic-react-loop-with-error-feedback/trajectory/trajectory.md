# Agent Executor - Think-Act-Observe Loop

A lightweight, bare-metal Agent Executor in Python that orchestrates a simple "Think-Act-Observe" loop to solve tasks using registered Python functions as tools.

## Key Features

- **No External Frameworks**: Built from scratch without LangChain, AutoGen, or OpenAI SDKs
- **Robust Error Handling**: Exceptions are treated as data and fed back to the LLM for self-correction
- **Tool Registry**: Decorator-based function registration system
- **Feedback Propagation**: Errors don't crash the system; they become observations for the next iteration
- **While Loop Implementation**: Uses explicit `while` loop with max_steps control
- **Standardized Observations**: JSON-formatted observations with status, data, and tool_name fields
- **Argument Validation**: Pre-execution validation of function signatures to catch errors early
- **Safety Valve**: Consecutive error limit prevents infinite hallucination loops

## Architecture

### Core Components

1. **ToolRegistry**: Manages tool registration via decorators
2. **run_agent()**: Main execution loop implementing Think-Act-Observe pattern
3. **mock_llm()**: Stub LLM function (replace with actual LLM in production)
4. **validate_tool_arguments()**: Pre-execution argument validation using function signatures
5. **create_observation()**: Standardized observation object creation

### Execution Flow

```
User Query → LLM → Tool Selection → Tool Execution → Observation → LLM → ...
                                         ↓
                                    (on error)
                                         ↓
                                  Error as Observation → LLM (self-correct)
```

### Implementation Details

The agent uses a **while loop** that runs up to `max_steps` iterations with a consecutive error safety valve:

```python
step = 0
consecutive_errors = 0

while step < max_steps:
    # Safety valve: terminate if too many consecutive errors
    if consecutive_errors >= max_consecutive_errors:
        final_answer = "Agent terminated: consecutive errors detected"
        break
    
    # 1. Call LLM with conversation history
    # 2. Parse JSON response for tool_name and arguments
    # 3. Validate arguments against function signature
    # 4. Execute tool with try-except wrapper
    # 5. Create standardized observation (status, data, tool_name)
    # 6. Append observation to history
    # 7. Reset consecutive_errors on success, increment on error
    # 8. Increment step counter
    step += 1
```

**Critical Design Patterns**: 
- Every `continue` statement increments `step` to prevent infinite loops
- Consecutive error counter resets on successful tool execution
- All observations follow standardized JSON schema: `{"status": "success|error", "data": "...", "tool_name": "..."}`

## Usage

### Quick Start

#### Local Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Run the agent
python repository_after/main.py

# Run tests
python tests/test_agent.py
```

#### Docker Setup

```bash
# Build and run tests in Docker
docker build -t agent-executor . && docker run --rm agent-executor

# Or use docker-compose
docker-compose up --build

# Build and run the main script in Docker
docker build -t agent-executor . && docker run --rm agent-executor python repository_after/main.py

# Build and run evaluation (with volume mount to persist reports)
# Windows:
docker build -t agent-executor . && docker run --rm -v "%cd%/evaluation:/app/evaluation" agent-executor python evaluation/evaluation.py
# Linux/Mac:
docker build -t agent-executor . && docker run --rm -v "$(pwd)/evaluation:/app/evaluation" agent-executor python evaluation/evaluation.py

# Interactive shell in Docker
docker build -t agent-executor . && docker run --rm -it agent-executor bash
```

### Registering Tools

```python
from main import registry

@registry.register()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

@registry.register()
def divide(a: float, b: float) -> float:
    """Divide two numbers."""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
```

### Running the Agent

```python
from main import run_agent

result = run_agent(
    "What is 5 + 3?", 
    max_steps=10,
    max_consecutive_errors=3  # Optional: default is 3
)
print(f"Answer: {result['final_answer']}")
print(f"Steps taken: {result['steps']}")
print(f"Full history: {result['history']}")
```

## Error Handling

The system handles multiple types of errors gracefully with standardized observation format:

1. **Non-existent Tool**: Returns "Tool not found" message with available tools list
2. **Invalid Arguments**: Pre-execution validation catches extra/missing arguments
3. **Tool Execution Errors**: Returns the exception message (ValueError, TypeError, etc.)
4. **Invalid JSON from LLM**: Catches JSON parsing errors and feeds back as observation
5. **Missing tool_name**: Detects and reports when LLM doesn't specify a tool
6. **Consecutive Errors**: Safety valve terminates after N consecutive errors to prevent hallucination loops

All errors are converted to standardized observations and fed back to the LLM for correction.

### Standardized Observation Schema

All observations follow this JSON structure:

```json
{
  "status": "success" | "error",
  "data": "result or error message",
  "tool_name": "name_of_tool"  // optional, included when available
}
```

This standardization makes it easier for LLMs to parse and understand feedback.

### Error Handling Implementation

```python
# Safety valve check
if consecutive_errors >= max_consecutive_errors:
    final_answer = f"Agent terminated: {max_consecutive_errors} consecutive errors detected"
    break

try:
    # Parse LLM response
    llm_response = llm_func(history, step)
    response_data = json.loads(llm_response)
except json.JSONDecodeError as e:
    obs = create_observation("error", f"Invalid JSON response from LLM - {str(e)}")
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors += 1
    step += 1
    continue

# Check for tool existence
tool_func = registry.get_tool(tool_name)
if tool_func is None:
    obs = create_observation(
        "error",
        f"Tool '{tool_name}' not found. Available tools: {', '.join(registry.list_tools())}",
        tool_name
    )
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors += 1
    step += 1
    continue

# Validate arguments before execution
validation_error = validate_tool_arguments(tool_func, arguments, tool_name)
if validation_error:
    obs = create_observation("error", validation_error, tool_name)
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors += 1
    step += 1
    continue

# Execute tool
try:
    result = tool_func(**arguments)
    obs = create_observation("success", result, tool_name)
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors = 0  # Reset on success
except ValueError as e:
    obs = create_observation("error", f"ValueError - {str(e)}", tool_name)
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors += 1
except Exception as e:
    obs = create_observation("error", f"{type(e).__name__}: {str(e)}", tool_name)
    history.append({"role": "observation", "content": json.dumps(obs)})
    consecutive_errors += 1

step += 1
```

## Requirements Met

✓ No LangChain, AutoGen, or Pydantic  
✓ Manual **while loop** up to max_steps  
✓ Tool exceptions don't crash the system  
✓ Non-existent tools handled as feedback  
✓ Comprehensive test coverage (24 tests)  
✓ Step counter incremented on all code paths (prevents infinite loops)  
✓ Argument validation before execution  
✓ Standardized observation schema  
✓ Consecutive error limit safety valve

## Testing

Run the test suite:

```bash
# Local
python tests/test_agent.py

# Docker
docker build -t agent-executor . && docker run --rm agent-executor pytest -v tests/

# Docker Compose
docker-compose up --build
```

### Test Coverage (24 Tests)

**Core Requirements (8 tests):**
- Tool registration and execution
- ValueError handling without crash
- Non-existent tool handling
- Invalid arguments handling
- Max steps termination
- While loop implementation
- No forbidden frameworks
- add(a,b) tool execution verification

**Additional Coverage (16 tests):**
- Conversation history structure and maintenance
- JSON parsing from LLM responses
- Invalid JSON error handling
- Early loop termination with final_answer
- Observation feedback mechanism
- Sequential tool execution
- Error-driven self-correction and retry logic
- Missing tool_name handling
- Custom tool name registration
- Tool registry list functionality
- Exception type preservation in error messages
- Step counter correctness across all code paths
- Argument signature validation (catches extra/missing arguments)
- Standardized observation schema (status, data, tool_name)
- Consecutive error limit safety valve (prevents hallucination loops)
- Error counter reset on success (allows recovery)

## Project Structure

```
.
├── Dockerfile                    # Docker image configuration
├── docker-compose.yml            # Docker Compose setup
├── requirements.txt              # Python dependencies (pytest)
├── repository_after/
│   └── main.py                   # Main agent implementation
└── tests/
    └── test_agent.py             # Comprehensive test suite (20 tests)
```

## Development

### Adding New Tools

```python
from main import registry

@registry.register()
def your_tool(param1, param2):
    """Your tool description."""
    # Your implementation
    return result
```

### Replacing Mock LLM

Replace the `mock_llm` function with actual LLM API calls:

```python
def real_llm(history: List[Dict[str, str]], step: int) -> str:
    # Call your LLM API (OpenAI, Anthropic, etc.)
    response = your_llm_api.call(history)
    return json.dumps({
        "thought": "...",
        "tool_name": "...",
        "arguments": {...}
    })

result = run_agent("Your query", llm_func=real_llm, max_steps=10)
```

**Important**: The LLM should return JSON with either:
- `{"thought": "...", "tool_name": "...", "arguments": {...}}` for tool calls
- `{"final_answer": "..."}` to terminate the loop