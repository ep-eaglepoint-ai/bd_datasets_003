def sanitize_chat_stream(messages: list[str], banned_words: list[str]) -> str:
    output_buffer = ""
    last_message = None
    
    # We work on a copy to avoid modifying the input
    queue = list(messages)
    
    # Performance Bottleneck 1: 
    # processing the queue until empty
    while len(queue) > 0:
        # 'pop(0)' shifts all remaining elements: O(N) cost per iteration
        # Total loop cost becomes O(N^2)
        current_msg = queue.pop(0)
        
        # Spam Filter: Skip consecutive duplicates
        if current_msg == last_message:
            continue
            
        # Profanity Filter
        words = current_msg.split()
        clean_words = []
        for word in words:
            # Performance Bottleneck 2: Linear scan O(M) for every word
            is_banned = False
            for bad in banned_words:
                if word.lower() == bad.lower():
                    is_banned = True
                    break
            
            if is_banned:
                clean_words.append("*" * len(word))
            else:
                clean_words.append(word)
        
        processed_line = " ".join(clean_words)
        
        # Performance Bottleneck 3: String Concatenation in loop
        # Python strings are immutable; this copies the string every time.
        output_buffer += processed_line + "\n"
        last_message = current_msg
        
    return output_buffer