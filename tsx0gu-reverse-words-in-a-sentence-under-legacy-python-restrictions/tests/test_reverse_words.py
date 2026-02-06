import pytest
import sys
import os


@pytest.fixture(scope="module")
def reverse_words(request):
    """Fixture to import reverse_words from the appropriate repository."""
    repo = request.config.getoption("--repo")
    
    if repo == "before":
        repo_path = os.path.join(os.path.dirname(__file__), '../repository_before')
    else:
        repo_path = os.path.join(os.path.dirname(__file__), '../repository_after')
    
    sys.path.insert(0, repo_path)
    
    from reverse_words import reverse_words as func
    return func


class TestReverseWords:
    """Test suite for reverse_words function."""
    
    def test_single_word(self, reverse_words):
        """Test with a single word."""
        assert reverse_words("hello") == "hello"
        assert reverse_words("Python") == "Python"
        assert reverse_words("a") == "a"
    
    def test_two_words(self, reverse_words):
        """Test with two words."""
        assert reverse_words("hello world") == "world hello"
        assert reverse_words("Python programming") == "programming Python"
    
    def test_multiple_words(self, reverse_words):
        """Test with multiple words."""
        assert reverse_words("the quick brown fox") == "fox brown quick the"
        assert reverse_words("one two three four five") == "five four three two one"
    
    def test_three_words(self, reverse_words):
        """Test with three words."""
        assert reverse_words("I love Python") == "Python love I"
    
    def test_empty_string(self, reverse_words):
        """Test with empty string."""
        assert reverse_words("") == ""
    
    def test_preserves_word_content(self, reverse_words):
        """Test that characters within words are preserved."""
        assert reverse_words("abc def ghi") == "ghi def abc"
        assert reverse_words("Hello World") == "World Hello"
    
    def test_longer_sentence(self, reverse_words):
        """Test with longer sentences."""
        assert reverse_words("This is a test sentence") == "sentence test a is This"
        assert reverse_words("reverse the order of words") == "words of order the reverse"
    
    def test_words_with_numbers(self, reverse_words):
        """Test with words containing numbers."""
        assert reverse_words("test123 word456") == "word456 test123"
        assert reverse_words("abc123 def456 ghi789") == "ghi789 def456 abc123"
    
    def test_words_with_special_characters(self, reverse_words):
        """Test with words containing special characters."""
        assert reverse_words("hello! world?") == "world? hello!"
        assert reverse_words("test-word another_word") == "another_word test-word"
    
    def test_mixed_case(self, reverse_words):
        """Test that case is preserved."""
        assert reverse_words("Hello World") == "World Hello"
        assert reverse_words("PyThOn ProGrAmMinG") == "ProGrAmMinG PyThOn"
    
    def test_single_character_words(self, reverse_words):
        """Test with single character words."""
        assert reverse_words("a b c d") == "d c b a"
        assert reverse_words("I am a developer") == "developer a am I"
    
    def test_longer_words(self, reverse_words):
        """Test with longer words."""
        assert reverse_words("beautiful magnificent extraordinary") == "extraordinary magnificent beautiful"
    
    def test_sentence_with_varying_word_lengths(self, reverse_words):
        """Test with words of varying lengths."""
        assert reverse_words("I am testing this function now") == "now function this testing am I"
    
    def test_palindrome_sentence(self, reverse_words):
        """Test with palindrome-like structure."""
        assert reverse_words("noon level radar") == "radar level noon"
    
    def test_numeric_strings(self, reverse_words):
        """Test with numeric strings as words."""
        assert reverse_words("123 456 789") == "789 456 123"
        assert reverse_words("100 200") == "200 100"
    
    def test_realistic_sentences(self, reverse_words):
        """Test with realistic sentences."""
        assert reverse_words("Python is a great language") == "language great a is Python"
        assert reverse_words("The quick brown fox jumps") == "jumps fox brown quick The"
    
    def test_single_space_separation(self, reverse_words):
        """Test that single spaces are maintained."""
        assert reverse_words("one two") == "two one"
        assert reverse_words("a b") == "b a"
    
    def test_words_are_reversed_not_characters(self, reverse_words):
        """Verify that only word order is reversed, not characters."""
        input_str = "abcd efgh ijkl"
        result = reverse_words(input_str)
        assert result == "ijkl efgh abcd"
        assert "dcba" not in result  # Characters should not be reversed
    
    def test_no_extra_spaces_added(self, reverse_words):
        """Test that no extra spaces are added."""
        result = reverse_words("one two three")
        assert result == "three two one"
        assert result.count(" ") == 2  # Should have exactly 2 spaces
    
    def test_complex_sentence(self, reverse_words):
        """Test with a complex sentence."""
        assert reverse_words("Python programming requires practice and dedication") == "dedication and practice requires programming Python"
    
    def test_leading_single_space(self, reverse_words):
        """Test with leading single space - Gap 1."""
        assert reverse_words(" hello world") == "world hello "
    
    def test_trailing_single_space(self, reverse_words):
        """Test with trailing single space - Gap 2."""
        assert reverse_words("hello world ") == " world hello"
    
    def test_multiple_consecutive_spaces_between_words(self, reverse_words):
        """Test with multiple consecutive spaces between words - Gap 3."""
        assert reverse_words("hello  world") == "world  hello"
        assert reverse_words("hello   world") == "world   hello"
    
    def test_whitespace_only_string(self, reverse_words):
        """Test with only spaces - Gap 4."""
        assert reverse_words("   ") == "   "
        assert reverse_words(" ") == " "
        assert reverse_words("  ") == "  "
    
    def test_mixed_leading_trailing_spaces(self, reverse_words):
        """Test with both leading and trailing spaces - Gap 5."""
        assert reverse_words("  hello world  ") == "  world hello  "
        assert reverse_words(" hello world ") == " world hello "
    
    def test_leading_multiple_spaces(self, reverse_words):
        """Test with multiple leading spaces - Gap 6."""
        assert reverse_words("  hello") == "hello  "
        assert reverse_words("   hello world") == "world hello   "
    
    def test_trailing_multiple_spaces(self, reverse_words):
        """Test with multiple trailing spaces - Gap 7."""
        assert reverse_words("hello  ") == "  hello"
        assert reverse_words("hello world   ") == "   world hello"
    
    def test_multiple_spaces_between_multiple_words(self, reverse_words):
        """Test with varying spaces between words - Gap 8."""
        assert reverse_words("a  b  c") == "c  b  a"
        assert reverse_words("one  two   three") == "three   two  one"
    
    def test_complex_space_patterns(self, reverse_words):
        """Test with complex combinations - Gap 10."""
        assert reverse_words("  a  b  ") == "  b  a  "
        assert reverse_words("   a    b   c  ") == "  c   b    a   "
    
    def test_varying_space_patterns(self, reverse_words):
        """Test with different space patterns - Gap 13."""
        assert reverse_words("a  b   c") == "c   b  a"
        assert reverse_words("a b  c   d") == "d   c  b a"
    
    def test_single_word_with_leading_spaces(self, reverse_words):
        """Test single word with leading spaces."""
        assert reverse_words("  hello") == "hello  "
    
    def test_single_word_with_trailing_spaces(self, reverse_words):
        """Test single word with trailing spaces."""
        assert reverse_words("hello  ") == "  hello"
    
    def test_single_word_with_both_spaces(self, reverse_words):
        """Test single word with both leading and trailing spaces."""
        assert reverse_words("  hello  ") == "  hello  "
    
    def test_two_words_complex_spacing(self, reverse_words):
        """Test two words with complex spacing."""
        assert reverse_words("  hello   world  ") == "  world   hello  "
    
    def test_preserves_exact_space_count(self, reverse_words):
        """Test that exact space count is preserved."""
        input_str = "  a    b   "
        result = reverse_words(input_str)
        assert input_str.count(" ") == result.count(" ")
        assert result == "   b    a  "
    
    def test_very_long_sentence(self, reverse_words):
        """Test with very long sentence - Missing coverage."""
        sentence = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10"
        expected = "word10 word9 word8 word7 word6 word5 word4 word3 word2 word1"
        assert reverse_words(sentence) == expected
    
    def test_words_with_apostrophes(self, reverse_words):
        """Test words with apostrophes - Missing coverage."""
        assert reverse_words("don't can't won't") == "won't can't don't"
        assert reverse_words("it's doesn't") == "doesn't it's"
    
    def test_hyphenated_words(self, reverse_words):
        """Test hyphenated words - Missing coverage."""
        assert reverse_words("well-known state-of-the-art") == "state-of-the-art well-known"
    
    def test_alphanumeric_mixed_words(self, reverse_words):
        """Test words with mixed letters and numbers - Missing coverage."""
        assert reverse_words("Python3 Java8") == "Java8 Python3"
    
    def test_all_uppercase_words(self, reverse_words):
        """Test all uppercase words - Missing coverage."""
        assert reverse_words("HELLO WORLD") == "WORLD HELLO"
    
    def test_words_with_underscores(self, reverse_words):
        """Test words with underscores - Missing coverage."""
        assert reverse_words("hello_world foo_bar") == "foo_bar hello_world"
    
    def test_repeated_words(self, reverse_words):
        """Test with repeated words - Missing coverage."""
        assert reverse_words("hello hello world") == "world hello hello"
        assert reverse_words("a a a") == "a a a"
    
    def test_multiple_single_char_words(self, reverse_words):
        """Test multiple single character words in longer sequence - Missing coverage."""
        assert reverse_words("a b c d e f g h") == "h g f e d c b a"

