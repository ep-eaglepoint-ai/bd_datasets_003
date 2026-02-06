def reverse_words(sentence):
    # Forced to use string concatenation and while loop due to banned list and slice operations
    result = ""
    current_word = ""
    spaces_after_word = ""
    i = len(sentence) - 1
    
    while i >= 0:
        if sentence[i] == " ":
            if current_word != "":
                result = result + spaces_after_word + current_word
                current_word = ""
                spaces_after_word = " "
            else:
                spaces_after_word = spaces_after_word + " "
        else:
            current_word = sentence[i] + current_word
        i = i - 1
    
    result = result + spaces_after_word + current_word
    
    return result
