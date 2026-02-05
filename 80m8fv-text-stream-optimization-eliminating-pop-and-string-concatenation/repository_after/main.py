from typing import List


def sanitize_chat_stream(messages: List[str], banned_words: List[str]) -> str:
    """
    Optimized O(N) chat stream sanitizer.

    Optimizations:
    1. Direct iteration over messages for O(N) processing
    2. String builder pattern - list + join instead of concatenation for O(N) assembly
    3. Hash set lookup - O(1) banned word check instead of O(M) linear scan

    Args:
        messages: List of chat messages to process
        banned_words: List of profanity words to censor

    Returns:
        Sanitized chat stream with newline-separated messages
    """
    # Requirement 3 & 4: Convert banned words to hash set for O(1) lookup
    # Pre-lowercase for case-insensitive matching
    banned_set = {word.lower() for word in banned_words}

    # Requirement 2: Use list to collect results (string builder pattern)
    result_lines = []
    last_message = None

    # Requirement 1: Direct iteration for efficient processing
    # Requirement 7: Single pass processing
    for current_msg in messages:
        # Requirement 5: Preserve consecutive duplicate filter
        if current_msg == last_message:
            continue

        # Requirement 6: Profanity filter via splitting (no regex)
        # Requirement 3: O(1) hash set lookup for banned words
        words = current_msg.split()
        clean_words = []

        for word in words:
            # Requirement 4: Case-insensitive set lookup
            if word.lower() in banned_set:
                clean_words.append("*" * len(word))
            else:
                clean_words.append(word)

        processed_line = " ".join(clean_words)
        result_lines.append(processed_line)
        last_message = current_msg

    # Requirement 2: Join at the end instead of concatenating in loop
    return "\n".join(result_lines) + "\n" if result_lines else ""
