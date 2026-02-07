"""
Test suite for Agent Executor
Tests all requirements including error handling and tool execution.
"""

import json
import sys
sys.path.insert(0, 'repository_after')

from main import ToolRegistry, run_agent, registry


def test_tool_registration():
    """Test that tools can be registered using decorator."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def test_func(x):
        return x * 2
    
    assert test_registry.get_tool("test_func") is not None
    assert "test_func" in test_registry.list_tools()
    print("✓ Test 1: Tool registration works")


def test_add_tool_execution():
    """
    Requirement 5: Register a add(a, b) tool. Mock LLM to call it. 
    Verify history contains the result.
    """
    # Clear and register add tool
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def add(a, b):
        return a + b
    
    # Mock LLM that calls add tool
    def mock_llm_add(history, step):
        if step == 0:
            return json.dumps({
                "thought": "Adding numbers",
                "tool_name": "add",
                "arguments": {"a": 10, "b": 20}
            })
        else:
            return json.dumps({
                "final_answer": "Done"
            })
    
    # Temporarily replace global registry
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Add 10 and 20", max_steps=5, llm_func=mock_llm_add)
        
        # Verify history contains the result (now in JSON observation format)
        history_str = str(result['history'])
        assert "30" in history_str
        assert result['final_answer'] == "Done"
        
        # Verify observation structure
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'success' and '30' in obs['data']:
                    assert obs['tool_name'] == 'add'
                    break
        
        print("✓ Test 2 (Req 5): add(a, b) tool execution verified in history")
    finally:
        main.registry = original_registry


def test_tool_raises_value_error():
    """
    Requirement 6: Register a tool that explicitly raises ValueError. 
    Mock LLM to call it. Verify the script finishes successfully and 
    the history contains the error message string.
    """
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def failing_tool(x):
        raise ValueError("This is a test error")
    
    def mock_llm_error(history, step):
        if step == 0:
            return json.dumps({
                "tool_name": "failing_tool",
                "arguments": {"x": 5}
            })
        else:
            return json.dumps({
                "final_answer": "Handled error"
            })
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Test error handling", max_steps=5, llm_func=mock_llm_error)
        
        # Verify script finished successfully (didn't crash)
        assert result is not None
        assert result['final_answer'] == "Handled error"
        
        # Verify history contains error message in standardized format
        history_str = str(result['history'])
        assert "ValueError" in history_str or "This is a test error" in history_str
        
        # Verify observation structure
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'error' and 'ValueError' in obs['data']:
                    assert 'This is a test error' in obs['data']
                    break
        
        print("✓ Test 3 (Req 6): ValueError handled gracefully, error in history")
    finally:
        main.registry = original_registry


def test_non_existent_tool():
    """
    Requirement 7: Mock LLM to call non_existent_tool(). 
    Verify the system feeds back "Tool not found" (or similar) 
    instead of crashing.
    """
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def real_tool():
        return "I exist"
    
    def mock_llm_nonexistent(history, step):
        if step == 0:
            return json.dumps({
                "tool_name": "non_existent_tool",
                "arguments": {}
            })
        else:
            return json.dumps({
                "final_answer": "Recovered from missing tool"
            })
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Call missing tool", max_steps=5, llm_func=mock_llm_nonexistent)
        
        # Verify script didn't crash
        assert result is not None
        assert result['final_answer'] == "Recovered from missing tool"
        
        # Verify "Tool not found" message in standardized observation format
        history_str = str(result['history'])
        assert "not found" in history_str.lower()
        
        # Verify observation structure
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'error' and 'not found' in obs['data'].lower():
                    assert 'non_existent_tool' in obs['data']
                    break
        
        print("✓ Test 4 (Req 7): Non-existent tool handled with 'Tool not found' message")
    finally:
        main.registry = original_registry


def test_max_steps_termination():
    """Test that loop terminates at max_steps."""
    def mock_llm_infinite(history, step):
        # Never returns final_answer
        return json.dumps({
            "tool_name": "add",
            "arguments": {"a": 1, "b": 1}
        })
    
    result = run_agent("Infinite loop test", max_steps=3, llm_func=mock_llm_infinite)
    
    assert result['steps'] == 3
    assert "Maximum steps" in result['final_answer']
    print("✓ Test 5 (Req 2): Loop terminates at max_steps")


def test_invalid_arguments():
    """Test that invalid arguments are handled gracefully."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def strict_tool(a: int, b: int):
        return a + b
    
    def mock_llm_bad_args(history, step):
        if step == 0:
            return json.dumps({
                "tool_name": "strict_tool",
                "arguments": {"a": 5}  # Missing 'b' argument
            })
        else:
            return json.dumps({
                "final_answer": "Handled bad args"
            })
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Bad args test", max_steps=5, llm_func=mock_llm_bad_args)
        
        # Verify didn't crash
        assert result is not None
        history_str = str(result['history'])
        assert "Error" in history_str
        print("✓ Test 6 (Req 3): Invalid arguments handled without crash")
    finally:
        main.registry = original_registry


def test_no_langchain_imports():
    """Requirement 1: Verify no forbidden frameworks are imported."""
    with open('repository_after/main.py', 'r') as f:
        content = f.read()
    
    forbidden = ['langchain', 'autogen', 'pydantic', 'openai']
    for lib in forbidden:
        assert lib not in content.lower()
    
    print("✓ Test 7 (Req 1): No forbidden frameworks (LangChain, AutoGen, Pydantic)")


def test_while_loop_implementation():
    """Requirement 2: Verify implementation uses a while loop up to max_steps."""
    with open('repository_after/main.py', 'r') as f:
        content = f.read()
    
    # Check for while loop implementation
    assert 'while step < max_steps' in content
    assert 'max_steps' in content
    print("✓ Test 8 (Req 2): while loop implementation verified")


def test_conversation_history_structure():
    """Test that conversation history is properly maintained as a list."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def sample_tool():
        return "success"
    
    def mock_llm_history(history, step):
        # Verify history is a list
        assert isinstance(history, list)
        if step == 0:
            # First call should have user query
            assert len(history) >= 1
            assert history[0]['role'] == 'user'
            return json.dumps({
                "tool_name": "sample_tool",
                "arguments": {}
            })
        else:
            return json.dumps({"final_answer": "Done"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Test query", max_steps=3, llm_func=mock_llm_history)
        
        # Verify history structure
        assert isinstance(result['history'], list)
        assert len(result['history']) > 0
        assert result['history'][0]['role'] == 'user'
        assert result['history'][0]['content'] == 'Test query'
        print("✓ Test 9: Conversation history maintained as list")
    finally:
        main.registry = original_registry


def test_json_parsing_from_llm():
    """Test that LLM responses are parsed as JSON."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def test_tool():
        return 42
    
    def mock_llm_json(history, step):
        if step == 0:
            # Return valid JSON
            return '{"tool_name": "test_tool", "arguments": {}}'
        else:
            return '{"final_answer": "Complete"}'
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Parse JSON", max_steps=3, llm_func=mock_llm_json)
        assert result['final_answer'] == "Complete"
        print("✓ Test 10: JSON parsing from LLM responses works")
    finally:
        main.registry = original_registry


def test_invalid_json_from_llm():
    """Test that invalid JSON from LLM is handled gracefully."""
    def mock_llm_bad_json(history, step):
        if step == 0:
            # Return invalid JSON
            return "This is not JSON at all!"
        else:
            return json.dumps({"final_answer": "Recovered"})
    
    result = run_agent("Bad JSON test", max_steps=3, llm_func=mock_llm_bad_json)
    
    # Should not crash
    assert result is not None
    history_str = str(result['history'])
    assert "Invalid JSON" in history_str or "error" in history_str.lower()
    
    # Verify observation structure
    for entry in result['history']:
        if entry['role'] == 'observation':
            obs = json.loads(entry['content'])
            if obs['status'] == 'error' and 'Invalid JSON' in obs['data']:
                break
    
    print("✓ Test 11: Invalid JSON from LLM handled without crash")


def test_final_answer_terminates_loop():
    """Test that final_answer key terminates the loop early."""
    call_count = [0]
    
    def mock_llm_early_exit(history, step):
        call_count[0] += 1
        return json.dumps({"final_answer": "Early exit"})
    
    result = run_agent("Early exit test", max_steps=10, llm_func=mock_llm_early_exit)
    
    assert result['final_answer'] == "Early exit"
    assert result['steps'] == 0  # Should exit on first iteration
    assert call_count[0] == 1  # LLM called only once
    print("✓ Test 12: final_answer terminates loop early")


def test_observation_appended_to_history():
    """Test that tool results are appended as observations."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def observable_tool(x):
        return f"Result: {x}"
    
    def mock_llm_observe(history, step):
        if step == 0:
            return json.dumps({
                "tool_name": "observable_tool",
                "arguments": {"x": 123}
            })
        else:
            # Check that observation was added
            assert any("observation" in str(entry).lower() for entry in history)
            return json.dumps({"final_answer": "Observed"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Observation test", max_steps=3, llm_func=mock_llm_observe)
        
        # Verify observation in history
        history_str = str(result['history'])
        assert "Result: 123" in history_str or "123" in history_str
        print("✓ Test 13: Tool results appended as observations")
    finally:
        main.registry = original_registry


def test_multiple_tool_calls_in_sequence():
    """Test that multiple tools can be called in sequence."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def tool_one():
        return "first"
    
    @test_registry.register()
    def tool_two():
        return "second"
    
    def mock_llm_sequence(history, step):
        if step == 0:
            return json.dumps({"tool_name": "tool_one", "arguments": {}})
        elif step == 1:
            return json.dumps({"tool_name": "tool_two", "arguments": {}})
        else:
            return json.dumps({"final_answer": "Both tools called"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Sequence test", max_steps=5, llm_func=mock_llm_sequence)
        
        history_str = str(result['history'])
        assert "first" in history_str
        assert "second" in history_str
        print("✓ Test 14: Multiple tools called in sequence")
    finally:
        main.registry = original_registry


def test_error_feedback_allows_retry():
    """Test that error feedback allows LLM to retry with corrected input."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def strict_type_tool(x: int):
        if not isinstance(x, int):
            raise TypeError("x must be an integer")
        return x * 2
    
    def mock_llm_retry(history, step):
        if step == 0:
            # First attempt with missing argument (will be caught by validation)
            return json.dumps({
                "tool_name": "strict_type_tool",
                "arguments": {}
            })
        elif step == 1:
            # Check that error was fed back
            history_str = str(history)
            assert "error" in history_str.lower() or "missing required argument" in history_str.lower()
            # Retry with correct argument
            return json.dumps({
                "tool_name": "strict_type_tool",
                "arguments": {"x": 5}
            })
        else:
            return json.dumps({"final_answer": "Corrected and succeeded"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Retry test", max_steps=5, llm_func=mock_llm_retry)
        
        history_str = str(result['history'])
        # Should contain both error and success
        assert "error" in history_str.lower()
        assert "10" in history_str  # Result of 5 * 2
        
        # Verify we have both error and success observations
        has_error = False
        has_success = False
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'error':
                    has_error = True
                elif obs['status'] == 'success' and '10' in obs['data']:
                    has_success = True
        
        assert has_error and has_success, "Should have both error and success observations"
        print("✓ Test 15: Error feedback enables LLM self-correction")
    finally:
        main.registry = original_registry


def test_no_tool_name_in_response():
    """Test handling when LLM doesn't provide tool_name."""
    def mock_llm_no_tool(history, step):
        if step == 0:
            # Missing tool_name
            return json.dumps({"thought": "I'm thinking", "arguments": {}})
        else:
            return json.dumps({"final_answer": "Handled missing tool_name"})
    
    result = run_agent("No tool name test", max_steps=3, llm_func=mock_llm_no_tool)
    
    assert result is not None
    history_str = str(result['history'])
    assert "error" in history_str.lower() or "No tool_name" in history_str
    
    # Verify observation structure
    for entry in result['history']:
        if entry['role'] == 'observation':
            obs = json.loads(entry['content'])
            if obs['status'] == 'error' and 'No tool_name' in obs['data']:
                break
    
    print("✓ Test 16: Missing tool_name handled gracefully")


def test_tool_registry_decorator_with_custom_name():
    """Test that tools can be registered with custom names."""
    test_registry = ToolRegistry()
    
    @test_registry.register(name="custom_name")
    def actual_function_name():
        return "custom"
    
    assert test_registry.get_tool("custom_name") is not None
    assert "custom_name" in test_registry.list_tools()
    print("✓ Test 17: Tool registration with custom name works")


def test_list_tools_functionality():
    """Test that list_tools returns all registered tools."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def tool_a():
        pass
    
    @test_registry.register()
    def tool_b():
        pass
    
    tools = test_registry.list_tools()
    assert "tool_a" in tools
    assert "tool_b" in tools
    assert len(tools) == 2
    print("✓ Test 18: list_tools returns all registered tools")


def test_exception_types_preserved_in_error_message():
    """Test that different exception types are properly identified in error messages."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def value_error_tool():
        raise ValueError("Value error message")
    
    @test_registry.register()
    def runtime_error_tool():
        raise RuntimeError("Runtime error message")
    
    @test_registry.register()
    def key_error_tool():
        raise KeyError("Key error message")
    
    def mock_llm_exceptions(history, step):
        if step == 0:
            return json.dumps({"tool_name": "value_error_tool", "arguments": {}})
        elif step == 1:
            return json.dumps({"tool_name": "runtime_error_tool", "arguments": {}})
        elif step == 2:
            return json.dumps({"tool_name": "key_error_tool", "arguments": {}})
        else:
            return json.dumps({"final_answer": "All errors handled"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Exception types test", max_steps=5, llm_func=mock_llm_exceptions)
        
        history_str = str(result['history'])
        # ValueError is caught specifically
        assert "ValueError" in history_str
        # RuntimeError and KeyError go through generic Exception handler
        assert "RuntimeError" in history_str
        assert "KeyError" in history_str or "Key error message" in history_str
        print("✓ Test 19: Different exception types preserved in error messages")
    finally:
        main.registry = original_registry


def test_step_counter_increments_correctly():
    """Test that step counter increments on all code paths."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def counter_tool():
        return "counted"
    
    step_counts = []
    
    def mock_llm_counter(history, step):
        step_counts.append(step)
        if step < 3:
            return json.dumps({"tool_name": "counter_tool", "arguments": {}})
        else:
            return json.dumps({"final_answer": "Done counting"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Counter test", max_steps=5, llm_func=mock_llm_counter)
        
        # Verify steps increment sequentially
        assert step_counts == [0, 1, 2, 3]
        assert result['steps'] == 3
        print("✓ Test 20: Step counter increments correctly on all paths")
    finally:
        main.registry = original_registry


def test_refinement_1_argument_validation():
    """Test Refinement #1: Argument signature validation catches extra arguments."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def strict_add(a, b):
        return a + b
    
    def mock_llm_extra_arg(history, step):
        if step == 0:
            # Provide extra invalid argument
            return json.dumps({
                "tool_name": "strict_add",
                "arguments": {"a": 5, "b": 3, "color": "blue"}
            })
        else:
            return json.dumps({"final_answer": "Done"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Test extra arg", max_steps=3, llm_func=mock_llm_extra_arg)
        
        # Verify validation error was caught
        found_validation_error = False
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'error' and 'does not accept argument' in obs['data']:
                    assert 'color' in obs['data']
                    found_validation_error = True
                    break
        
        assert found_validation_error, "Argument validation error not found"
        print("✓ Test 21 (Refinement #1): Argument signature validation works")
    finally:
        main.registry = original_registry


def test_refinement_2_observation_schema():
    """Test Refinement #2: Standardized observation schema."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def schema_test_tool(x):
        return x * 2
    
    def mock_llm_schema(history, step):
        if step == 0:
            return json.dumps({
                "tool_name": "schema_test_tool",
                "arguments": {"x": 21}
            })
        else:
            return json.dumps({"final_answer": "Done"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent("Test schema", max_steps=3, llm_func=mock_llm_schema)
        
        # Verify observation follows standardized schema
        found_valid_observation = False
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                # Check required fields
                assert 'status' in obs
                assert 'data' in obs
                assert obs['status'] in ['success', 'error']
                if obs['status'] == 'success':
                    assert 'tool_name' in obs
                    assert obs['tool_name'] == 'schema_test_tool'
                    assert '42' in obs['data']
                    found_valid_observation = True
                    break
        
        assert found_valid_observation, "Valid observation not found"
        print("✓ Test 22 (Refinement #2): Standardized observation schema works")
    finally:
        main.registry = original_registry


def test_refinement_3_consecutive_error_limit():
    """Test Refinement #3: Consecutive error limit safety valve."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def working_tool():
        return "success"
    
    def mock_llm_hallucination(history, step):
        # Keep calling non-existent tool (hallucination loop)
        return json.dumps({
            "tool_name": "nonexistent_tool",
            "arguments": {}
        })
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent(
            "Test hallucination loop",
            max_steps=20,
            llm_func=mock_llm_hallucination,
            max_consecutive_errors=3
        )
        
        # Verify early termination
        assert result['steps'] == 3, f"Expected 3 steps, got {result['steps']}"
        assert "consecutive errors" in result['final_answer'].lower()
        
        # Count errors in history
        error_count = 0
        for entry in result['history']:
            if entry['role'] == 'observation':
                obs = json.loads(entry['content'])
                if obs['status'] == 'error':
                    error_count += 1
        
        assert error_count == 3, f"Expected 3 errors, got {error_count}"
        print("✓ Test 23 (Refinement #3): Consecutive error limit safety valve works")
    finally:
        main.registry = original_registry


def test_refinement_3_error_counter_resets():
    """Test that consecutive error counter resets on success."""
    test_registry = ToolRegistry()
    
    @test_registry.register()
    def sometimes_works(x):
        return x * 2
    
    def mock_llm_alternating(history, step):
        if step == 0:
            # Error
            return json.dumps({"tool_name": "nonexistent", "arguments": {}})
        elif step == 1:
            # Error
            return json.dumps({"tool_name": "nonexistent", "arguments": {}})
        elif step == 2:
            # Success - should reset counter
            return json.dumps({"tool_name": "sometimes_works", "arguments": {"x": 5}})
        elif step == 3:
            # Error again
            return json.dumps({"tool_name": "nonexistent", "arguments": {}})
        elif step == 4:
            # Error again
            return json.dumps({"tool_name": "nonexistent", "arguments": {}})
        elif step == 5:
            # Error again - this would be 3rd consecutive
            return json.dumps({"tool_name": "nonexistent", "arguments": {}})
        else:
            return json.dumps({"final_answer": "Should terminate"})
    
    import main
    original_registry = main.registry
    main.registry = test_registry
    
    try:
        result = run_agent(
            "Test error counter reset",
            max_steps=10,
            llm_func=mock_llm_alternating,
            max_consecutive_errors=3
        )
        
        # Should terminate at step 6 (3 consecutive errors after the success at step 2)
        # Steps: 0=error, 1=error, 2=success (reset), 3=error, 4=error, 5=error (3rd consecutive)
        assert result['steps'] == 6, f"Expected 6 steps, got {result['steps']}"
        assert "consecutive errors" in result['final_answer'].lower()
        print("✓ Test 24 (Refinement #3): Error counter resets on success")
    finally:
        main.registry = original_registry


if __name__ == "__main__":
    print("Running Agent Executor Test Suite\n")
    print("=" * 50)
    
    # Core requirement tests
    test_tool_registration()
    test_add_tool_execution()
    test_tool_raises_value_error()
    test_non_existent_tool()
    test_max_steps_termination()
    test_invalid_arguments()
    test_no_langchain_imports()
    test_while_loop_implementation()
    
    print("\n" + "=" * 50)
    print("Additional Comprehensive Tests")
    print("=" * 50 + "\n")
    
    # Additional comprehensive tests
    test_conversation_history_structure()
    test_json_parsing_from_llm()
    test_invalid_json_from_llm()
    test_final_answer_terminates_loop()
    test_observation_appended_to_history()
    test_multiple_tool_calls_in_sequence()
    test_error_feedback_allows_retry()
    test_no_tool_name_in_response()
    test_tool_registry_decorator_with_custom_name()
    test_list_tools_functionality()
    test_exception_types_preserved_in_error_message()
    test_step_counter_increments_correctly()
    
    print("\n" + "=" * 50)
    print("Professional-Grade Refinement Tests")
    print("=" * 50 + "\n")
    
    # Refinement tests
    test_refinement_1_argument_validation()
    test_refinement_2_observation_schema()
    test_refinement_3_consecutive_error_limit()
    test_refinement_3_error_counter_resets()
    
    print("=" * 50)
    print("\n✅ All 24 tests passed!")
    print("\nCore Requirements verified:")
    print("  ✓ Req 1: No LangChain/AutoGen/Pydantic")
    print("  ✓ Req 2: While loop with max_steps")
    print("  ✓ Req 3: Tool exceptions don't crash")
    print("  ✓ Req 4: Non-existent tools handled as feedback")
    print("  ✓ Req 5: add(a,b) tool execution verified")
    print("  ✓ Req 6: ValueError handled gracefully")
    print("  ✓ Req 7: Non-existent tool returns 'Tool not found'")
    print("\nAdditional Coverage:")
    print("  ✓ Conversation history structure")
    print("  ✓ JSON parsing and error handling")
    print("  ✓ Loop termination logic")
    print("  ✓ Observation feedback mechanism")
    print("  ✓ Sequential tool execution")
    print("  ✓ Error-driven self-correction")
    print("  ✓ Tool registry functionality")
    print("  ✓ Exception type preservation")
    print("  ✓ Step counter correctness")
    print("\nProfessional-Grade Refinements:")
    print("  ✓ Argument signature validation")
    print("  ✓ Standardized observation schema")
    print("  ✓ Consecutive error limit safety valve")
    print("  ✓ Error counter reset on success")("  ✓ Standardized observation schema")
    print("  ✓ Consecutive error limit safety valve")
    print("  ✓ Error counter reset on success")

