from diff_match_patch import diff_match_patch
import re
import difflib

class DiffService:
    @staticmethod
    def get_structured_diff(old_content: str, new_content: str):
        """
        Computes a word-based diff between two markdown contents.
        Encodes words as characters to use the DMP algorithm at a word level.
        """
        dmp = diff_match_patch()
        
        # 1. Tokenize into words (keeping whitespace/punctuation as separate tokens)
        def tokenize(text):
            return re.findall(r"[\w']+|[^\w\s]|\s+", text)

        old_words = tokenize(old_content)
        new_words = tokenize(new_content)

        # 2. Map words to characters for the DMP algorithm
        word_to_char = {}
        char_to_word = []
        
        def words_to_chars(words):
            chars = []
            for word in words:
                if word not in word_to_char:
                    word_to_char[word] = chr(len(char_to_word))
                    char_to_word.append(word)
                chars.append(word_to_char[word])
            return "".join(chars)

        old_chars = words_to_chars(old_words)
        new_chars = words_to_chars(new_words)

        # 3. Perform the diff on characters
        diffs = dmp.diff_main(old_chars, new_chars)
        dmp.diff_cleanupSemantic(diffs)

        # 4. Map characters back to words
        result = []
        for op, text in diffs:
            # Convert the sequence of characters back to the sequence of words
            word_text = "".join(char_to_word[ord(c)] for c in text)
            
            if op == -1:
                result.append({"type": "delete", "text": word_text})
            elif op == 1:
                result.append({"type": "insert", "text": word_text})
            else:
                result.append({"type": "equal", "text": word_text})
        
        return result

    @staticmethod
    def get_unified_diff(old_content: str, new_content: str, from_file: str = "old_version", to_file: str = "new_version") -> str:
        """
        Generates a standard Unified Diff patch.
        """
        old_lines = old_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        
        diff = difflib.unified_diff(
            old_lines, 
            new_lines, 
            fromfile=from_file, 
            tofile=to_file
        )
        return "".join(diff)
