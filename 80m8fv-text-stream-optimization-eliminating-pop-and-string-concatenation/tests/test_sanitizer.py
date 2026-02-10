"""
Comprehensive test suite for chat stream sanitizer optimization.
Tests validate all 8 requirements with assertions.
"""

import sys
import os
import time
import inspect
from typing import List

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Determine which repository to test based on environment variable
TEST_REPO = os.environ.get('TEST_REPO', 'after')  # 'before' or 'after'

if TEST_REPO == 'before':
    from repository_before.main import sanitize_chat_stream
else:
    from repository_after.main import sanitize_chat_stream


def test_requirement_1_no_pop_zero():
    """Requirement 1: Must not use pop(0) - should iterate directly or use deque"""
    source_code = inspect.getsource(sanitize_chat_stream)

    # Requirement: Must NOT use pop(0)
    assert 'pop(0)' not in source_code, "Must not use pop(0) - use direct iteration instead"
    # Should use direct iteration
    assert 'for ' in source_code, "Should use direct iteration"


def test_requirement_2_string_builder_pattern():
    """Requirement 2: Must use list + join instead of string concatenation in loop"""
    source_code = inspect.getsource(sanitize_chat_stream)

    # Requirement: Must use list + join pattern
    assert 'join(' in source_code, "Must use join() for string building"
    assert '.append(' in source_code, "Must use list.append() to collect lines"


def test_requirement_3_hash_set_for_banned_words():
    """Requirement 3: Must convert banned_words to set for O(1) lookup"""
    source_code = inspect.getsource(sanitize_chat_stream)

    # Requirement: Must create a set from banned_words
    assert 'set' in source_code.lower() or 'banned_set' in source_code, "Must convert banned_words to set for O(1) lookup"


def test_requirement_4_case_insensitive_lookup():
    """Requirement 4: Must handle case-insensitive banned word matching"""
    messages = [
        "Hello world",
        "HELLO there",
        "hello WORLD"
    ]
    banned_words = ["hello", "world"]

    result = sanitize_chat_stream(messages, banned_words)
    lines = result.strip().split('\n')

    # All variations should be censored
    assert lines[0] == "***** *****", f"Expected '***** *****', got '{lines[0]}'"
    assert lines[1] == "***** there", f"Expected '***** there', got '{lines[1]}'"
    assert lines[2] == "***** *****", f"Expected '***** *****', got '{lines[2]}'"


def test_requirement_5_consecutive_duplicate_filter():
    """Requirement 5: Must preserve consecutive duplicate filtering logic"""
    messages = [
        "hello world",
        "hello world",  # duplicate - should be filtered
        "goodbye",
        "goodbye",  # duplicate - should be filtered
        "hello world",  # not consecutive duplicate - should appear
    ]
    banned_words = []

    result = sanitize_chat_stream(messages, banned_words)
    lines = result.strip().split('\n')

    # Only 3 lines should remain (duplicates removed)
    assert len(lines) == 3, f"Expected 3 lines, got {len(lines)}"
    assert lines[0] == "hello world"
    assert lines[1] == "goodbye"
    assert lines[2] == "hello world"


def test_requirement_6_no_regex_splitting_only():
    """Requirement 6: Must not use regex - only splitting/tokenizing allowed"""
    source_code = inspect.getsource(sanitize_chat_stream)

    # Should not import or use re module
    assert 'import re' not in source_code, "Must not use regex module"
    assert 're.' not in source_code, "Must not use regex functions"

    # Should use split() for tokenization
    assert '.split(' in source_code, "Must use split() for tokenization"


def test_requirement_7_single_pass_processing():
    """Requirement 7: Should process text in single pass"""
    messages = [
        "clean message",
        "this is bad word",
        "another clean"
    ]
    banned_words = ["bad"]

    result = sanitize_chat_stream(messages, banned_words)
    lines = result.strip().split('\n')

    # Verify correct processing
    assert len(lines) == 3
    assert lines[0] == "clean message"
    assert lines[1] == "this is *** word"
    assert lines[2] == "another clean"


def test_requirement_8_proper_type_hints():
    """Requirement 8: Function must use proper type hints (List[str])"""
    import inspect
    sig = inspect.signature(sanitize_chat_stream)

    # Check parameters have annotations
    assert 'messages' in sig.parameters
    assert 'banned_words' in sig.parameters

    # Check return type annotation exists
    assert sig.return_annotation != inspect.Parameter.empty


def test_correctness_basic_functionality():
    """Test basic correctness with simple input"""
    messages = ["hello world", "test message"]
    banned_words = ["hello"]

    result = sanitize_chat_stream(messages, banned_words)

    assert result == "***** world\ntest message\n"


def test_correctness_all_banned():
    """Test when all words are banned"""
    messages = ["bad ugly mean"]
    banned_words = ["bad", "ugly", "mean"]

    result = sanitize_chat_stream(messages, banned_words)

    assert result == "*** **** ****\n"


def test_correctness_empty_input():
    """Test empty message list"""
    messages = []
    banned_words = ["bad"]

    result = sanitize_chat_stream(messages, banned_words)

    assert result == ""


def test_correctness_no_banned_words():
    """Test with no banned words"""
    messages = ["hello world", "test"]
    banned_words = []

    result = sanitize_chat_stream(messages, banned_words)

    assert result == "hello world\ntest\n"


def test_correctness_all_duplicates():
    """Test when all messages are duplicates"""
    messages = ["same", "same", "same", "same"]
    banned_words = []

    result = sanitize_chat_stream(messages, banned_words)

    # Only first occurrence should remain
    assert result == "same\n"


def test_performance_benchmark_50k_messages():
    """Performance test: 50,000 messages must complete in <1 second"""
    # Generate 50k messages
    messages = []
    for i in range(50000):
        if i % 3 == 0:
            messages.append(f"message {i} with banned content")
        elif i % 5 == 0:
            messages.append(f"clean message number {i}")
        else:
            messages.append(f"test message {i}")

    banned_words = ["banned", "profanity", "inappropriate"]

    start = time.time()
    result = sanitize_chat_stream(messages, banned_words)
    duration = time.time() - start

    # Verify result is non-empty
    assert len(result) > 0, "Result should not be empty"

    # Requirement: Must complete in <1 second for 50k messages
    print(f"  {TEST_REPO.upper()} performance: {duration:.3f}s for 50k messages")
    assert duration < 1.0, f"Must complete 50k messages in <1s (requirement), took {duration:.3f}s"


def test_performance_comparison():
    """Compare performance between implementations"""
    # Generate test data
    messages = [f"message {i} test banned word clean" for i in range(10000)]
    banned_words = ["banned", "profanity"]

    start = time.time()
    result = sanitize_chat_stream(messages, banned_words)
    duration = time.time() - start

    # Verify correctness ("banned" = 6 letters = 6 stars)
    assert "****** word" in result, "Should censor 'banned'"

    print(f"  {TEST_REPO.upper()} - 10k messages: {duration:.3f}s")

    # Requirement: Should be reasonably fast
    assert duration < 0.5, f"Should be <0.5s for 10k messages, got {duration:.3f}s"
