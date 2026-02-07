"""
Lightweight Agent Executor with Think-Act-Observe Loop
Implements robust error handling for tool execution failures.
"""

import inspect
import json
from typing import Callable, Dict, Any, List, Optional


class ToolRegistry:
    """Registry for managing tool functions with decorator support."""
    
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
    
    def register(self, name: Optional[str] = None):
        """Decorator to register a function as a tool."""
        def decorator(func: Callable) -> Callable:
            tool_name = name if name else func.__name__
            self._tools[tool_name] = func
            return func
        return decorator
    
    def get_tool(self, name: str) -> Optional[Callable]:
        """Retrieve a tool by name."""
        return self._tools.get(name)
    
    def list_tools(self) -> List[str]:
        """List all registered tool names."""
        return list(self._tools.keys())


# Global tool registry
registry = ToolRegistry()


def mock_llm(history: List[Dict[str, str]], step: int) -> str:
    """
    Mock LLM function that returns JSON-formatted responses.
    In production, this would call an actual LLM API.
    """
    # Simple mock behavior for demonstration
    if step == 0:
        return json.dumps({
            "thought": "I need to add two numbers",
            "tool_name": "add",
            "arguments": {"a": 5, "b": 3}
        })
    elif step == 1:
        return json.dumps({
            "thought": "Task completed",
            "final_answer": "The sum is 8"
        })
    else:
        return json.dumps({
            "final_answer": "Maximum steps reached"
        })


def validate_tool_arguments(tool_func: Callable, arguments: Dict[str, Any], tool_name: str) -> Optional[str]:
    """
    Validate that provided arguments match the tool's function signature.
    
    Args:
        tool_func: The tool function to validate against
        arguments: Dictionary of arguments provided by the LLM
        tool_name: Name of the tool (for error messages)
    
    Returns:
        Error message string if validation fails, None if valid
    """
    try:
        sig = inspect.signature(tool_func)
        params = sig.parameters
        
        # Check for extra arguments
        for arg_name in arguments.keys():
            if arg_name not in params:
                return f"Error: Tool '{tool_name}' does not accept argument '{arg_name}'. Valid parameters: {list(params.keys())}"
        
        # Check for missing required arguments
        for param_name, param in params.items():
            if param.default == inspect.Parameter.empty and param_name not in arguments:
                return f"Error: Tool '{tool_name}' missing required argument '{param_name}'"
        
        return None
    except Exception as e:
        return f"Error: Failed to validate arguments for tool '{tool_name}' - {str(e)}"


def create_observation(status: str, data: Any, tool_name: str = None) -> Dict[str, Any]:
    """
    Create a standardized observation object.
    
    Args:
        status: "success" or "error"
        data: The observation data (result or error message)
        tool_name: Optional tool name for context
    
    Returns:
        Standardized observation dictionary
    """
    obs = {
        "status": status,
        "data": str(data)
    }
    if tool_name:
        obs["tool_name"] = tool_name
    return obs


def run_agent(query: str, max_steps: int = 10, llm_func: Callable = mock_llm, max_consecutive_errors: int = 3) -> Dict[str, Any]:
    """
    Main agent execution loop with robust error handling.
    
    Args:
        query: The task/question for the agent to solve
        max_steps: Maximum number of iterations
        llm_func: LLM function to use (defaults to mock_llm)
        max_consecutive_errors: Maximum consecutive errors before force-termination
    
    Returns:
        Dictionary containing final_answer and execution history
    """
    history = [{"role": "user", "content": query}]
    final_answer = None
    step = 0
    consecutive_errors = 0
    
    while step < max_steps:
        # Check consecutive error limit (safety valve)
        if consecutive_errors >= max_consecutive_errors:
            final_answer = f"Agent terminated: {max_consecutive_errors} consecutive errors detected. Possible hallucination loop."
            break
        
        # Call LLM with current history
        try:
            llm_response = llm_func(history, step)
            response_data = json.loads(llm_response)
        except json.JSONDecodeError as e:
            # LLM returned invalid JSON
            obs = create_observation("error", f"Invalid JSON response from LLM - {str(e)}")
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
            step += 1
            continue
        except Exception as e:
            # Unexpected LLM error
            obs = create_observation("error", f"LLM call failed - {str(e)}")
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
            step += 1
            continue
        
        # Add LLM response to history
        history.append({"role": "assistant", "content": llm_response})
        
        # Check for final answer
        if "final_answer" in response_data:
            final_answer = response_data["final_answer"]
            break
        
        # Extract tool call information
        tool_name = response_data.get("tool_name")
        arguments = response_data.get("arguments", {})
        
        if not tool_name:
            obs = create_observation("error", "No tool_name specified in response")
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
            step += 1
            continue
        
        # Execute tool with robust error handling
        try:
            tool_func = registry.get_tool(tool_name)
            
            if tool_func is None:
                # Tool doesn't exist - feed back as observation
                obs = create_observation(
                    "error",
                    f"Tool '{tool_name}' not found. Available tools: {', '.join(registry.list_tools())}",
                    tool_name
                )
                history.append({"role": "observation", "content": json.dumps(obs)})
                consecutive_errors += 1
                step += 1
                continue
            
            # Validate arguments before execution (Refinement #1)
            if isinstance(arguments, dict):
                validation_error = validate_tool_arguments(tool_func, arguments, tool_name)
                if validation_error:
                    obs = create_observation("error", validation_error, tool_name)
                    history.append({"role": "observation", "content": json.dumps(obs)})
                    consecutive_errors += 1
                    step += 1
                    continue
            
            # Execute the tool
            if isinstance(arguments, dict):
                result = tool_func(**arguments)
            elif isinstance(arguments, list):
                result = tool_func(*arguments)
            else:
                result = tool_func(arguments)
            
            # Success - add result as observation (Refinement #2)
            obs = create_observation("success", result, tool_name)
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors = 0  # Reset error counter on success
            
        except TypeError as e:
            # Invalid arguments for the tool
            obs = create_observation("error", f"Invalid arguments - {str(e)}", tool_name)
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
        except ValueError as e:
            # Tool raised ValueError
            obs = create_observation("error", f"ValueError - {str(e)}", tool_name)
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
        except Exception as e:
            # Any other exception from tool execution
            obs = create_observation("error", f"{type(e).__name__}: {str(e)}", tool_name)
            history.append({"role": "observation", "content": json.dumps(obs)})
            consecutive_errors += 1
        
        step += 1
    
    # If loop completed without final answer
    if final_answer is None:
        final_answer = "Maximum steps reached without final answer"
    
    return {
        "final_answer": final_answer,
        "history": history,
        "steps": step
    }


# Example tool registrations
@registry.register()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


@registry.register()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b


@registry.register()
def divide(a: float, b: float) -> float:
    """Divide two numbers."""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


if __name__ == "__main__":
    # Example usage
    result = run_agent("What is 5 + 3?", max_steps=5)
    print(f"Final Answer: {result['final_answer']}")
    print(f"\nExecution History ({result['steps']} steps):")
    for i, entry in enumerate(result['history']):
        print(f"{i}. [{entry['role']}] {entry['content'][:100]}...")
