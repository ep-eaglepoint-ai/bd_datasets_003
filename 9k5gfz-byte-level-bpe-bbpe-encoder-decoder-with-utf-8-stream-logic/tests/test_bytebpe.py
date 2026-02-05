import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "repository_after"))

from bytebpe import ByteBPE


class TestInitialization:
    
    def test_empty_merge_list(self):
        tokenizer = ByteBPE([])
        assert tokenizer.vocab_size == 256
        assert len(tokenizer.merges) == 0
    
    def test_single_merge_rule(self):
        tokenizer = ByteBPE([(1, 2)])
        assert tokenizer.vocab_size == 257
        assert tokenizer.pair_to_token[(1, 2)] == 256
    
    def test_multiple_merge_rules(self):
        tokenizer = ByteBPE([(1, 2), (3, 4), (5, 6)])
        assert tokenizer.vocab_size == 259
        assert tokenizer.pair_to_token[(1, 2)] == 256
        assert tokenizer.pair_to_token[(3, 4)] == 257
        assert tokenizer.pair_to_token[(5, 6)] == 258
    
    def test_merge_order_preservation(self):
        merges = [(10, 20), (30, 40), (50, 60)]
        tokenizer = ByteBPE(merges)
        assert tokenizer.merges == merges
    
    def test_invalid_merge_not_tuple(self):
        with pytest.raises(TypeError, match="Merge rules must be tuples"):
            ByteBPE([[1, 2]])
    
    def test_invalid_merge_wrong_size(self):
        with pytest.raises(ValueError, match="exactly 2 elements"):
            ByteBPE([(1, 2, 3)])
    
    def test_invalid_merge_non_integer(self):
        with pytest.raises(TypeError, match="must be integers"):
            ByteBPE([("a", "b")])


class TestEncoding:
    
    def test_empty_string(self):
        tokenizer = ByteBPE([])
        assert tokenizer.encode("") == []
    
    def test_single_ascii_character(self):
        tokenizer = ByteBPE([])
        assert tokenizer.encode("A") == [65]
    
    def test_ascii_string_no_merges(self):
        tokenizer = ByteBPE([])
        result = tokenizer.encode("Hello")
        expected = [72, 101, 108, 108, 111]
        assert result == expected
    
    def test_emoji_utf8_decomposition(self):
        tokenizer = ByteBPE([])
        result = tokenizer.encode("👋")
        expected = [240, 159, 145, 139]
        assert result == expected
    
    def test_emoji_with_merge(self):
        tokenizer = ByteBPE([(240, 159)])
        result = tokenizer.encode("👋")
        expected = [256, 145, 139]
        assert result == expected
    
    def test_merge_priority_overlap(self):
        tokenizer = ByteBPE([(1, 2), (2, 3)])
        result = tokenizer._apply_merge_exhaustive([1, 2, 3], (1, 2), 256)
        result = tokenizer._apply_merge_exhaustive(result, (2, 3), 257)
        expected = [256, 3]
        assert result == expected
    
    def test_consecutive_identical_bytes(self):
        tokenizer = ByteBPE([(65, 65)])
        result = tokenizer.encode("AAAA")
        expected = [256, 256]
        assert result == expected
    
    def test_no_matching_merge(self):
        tokenizer = ByteBPE([(1, 2)])
        result = tokenizer.encode("ABC")
        expected = [65, 66, 67]
        assert result == expected
    
    def test_mixed_ascii_unicode(self):
        tokenizer = ByteBPE([])
        result = tokenizer.encode("Hello 世界")
        expected = [72, 101, 108, 108, 111, 32, 228, 184, 150, 231, 149, 140]
        assert result == expected
    
    def test_merge_exhaustiveness(self):
        tokenizer = ByteBPE([(65, 66)])
        result = tokenizer.encode("ABABAB")
        expected = [256, 256, 256]
        assert result == expected


class TestDecoding:
    
    def test_empty_token_list(self):
        tokenizer = ByteBPE([])
        assert tokenizer.decode([]) == ""
    
    def test_single_byte_token(self):
        tokenizer = ByteBPE([])
        assert tokenizer.decode([65]) == "A"
    
    def test_ascii_bytes(self):
        tokenizer = ByteBPE([])
        result = tokenizer.decode([72, 101, 108, 108, 111])
        assert result == "Hello"
    
    def test_emoji_bytes(self):
        tokenizer = ByteBPE([])
        result = tokenizer.decode([240, 159, 145, 139])
        assert result == "👋"
    
    def test_merged_token_decomposition(self):
        tokenizer = ByteBPE([(65, 66)])
        result = tokenizer.decode([256])
        assert result == "AB"
    
    def test_multi_level_decomposition(self):
        tokenizer = ByteBPE([(65, 66), (256, 67)])
        result = tokenizer.decode([257])
        assert result == "ABC"
    
    def test_invalid_utf8_handling(self):
        tokenizer = ByteBPE([])
        result = tokenizer.decode([255])
        assert result == "\ufffd"
    
    def test_negative_token_raises_error(self):
        tokenizer = ByteBPE([])
        with pytest.raises(ValueError, match="non-negative"):
            tokenizer.decode([-1])
    
    def test_token_exceeds_vocab_raises_error(self):
        tokenizer = ByteBPE([(1, 2)])
        with pytest.raises(ValueError, match="exceeds vocabulary size"):
            tokenizer.decode([300])


class TestRoundTrip:
    
    def test_empty_string_round_trip(self):
        tokenizer = ByteBPE([])
        text = ""
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_ascii_round_trip(self):
        tokenizer = ByteBPE([])
        text = "Hello, World!"
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_unicode_round_trip(self):
        tokenizer = ByteBPE([])
        text = "Hello 世界 🌍"
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_emoji_round_trip(self):
        tokenizer = ByteBPE([])
        text = "👋🌟💻"
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_round_trip_with_merges(self):
        tokenizer = ByteBPE([(72, 101), (108, 108)])
        text = "Hello"
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_round_trip_complex_merges(self):
        tokenizer = ByteBPE([(65, 66), (256, 67), (257, 68)])
        text = "ABCD"
        assert tokenizer.decode(tokenizer.encode(text)) == text
    
    def test_round_trip_mixed_content(self):
        tokenizer = ByteBPE([(32, 32)])
        text = "Hello  世界  🌍  Test"
        assert tokenizer.decode(tokenizer.encode(text)) == text


class TestDeterminism:
    
    def test_encoding_determinism(self):
        tokenizer = ByteBPE([(65, 66), (66, 67)])
        text = "ABCABC"
        result1 = tokenizer.encode(text)
        result2 = tokenizer.encode(text)
        result3 = tokenizer.encode(text)
        assert result1 == result2 == result3


class TestPerformance:
    
    def test_large_input(self):
        tokenizer = ByteBPE([(97, 98)])
        large_text = "ab" * 10000
        
        import time
        start = time.time()
        tokens = tokenizer.encode(large_text)
        decoded = tokenizer.decode(tokens)
        elapsed = time.time() - start
        
        assert decoded == large_text
        assert elapsed < 5.0


class TestAdversarial:
    
    def test_character_vs_byte_processing(self):
        tokenizer = ByteBPE([(228, 184)])
        result = tokenizer.encode("中")
        expected = [256, 173]
        assert result == expected
    
    def test_greedy_vs_priority(self):
        tokenizer = ByteBPE([(1, 2), (2, 3)])
        tokens = [1, 2, 3]
        tokens = tokenizer._apply_merge_exhaustive(tokens, (1, 2), 256)
        tokens = tokenizer._apply_merge_exhaustive(tokens, (2, 3), 257)
        assert tokens == [256, 3]
    
    def test_incomplete_merging(self):
        tokenizer = ByteBPE([(65, 65)])
        result = tokenizer.encode("AAAAAA")
        expected = [256, 256, 256]
        assert result == expected
    
    def test_off_by_one_boundary(self):
        tokenizer = ByteBPE([(65, 66)])
        assert tokenizer.encode("A") == [65]
        assert tokenizer.encode("AB") == [256]
        assert tokenizer.encode("ABC") == [256, 67]
    
    def test_null_byte_handling(self):
        tokenizer = ByteBPE([(0, 65)])
        text = "\x00A"
        result = tokenizer.encode(text)
        expected = [256]
        assert result == expected
    
    def test_high_byte_values(self):
        tokenizer = ByteBPE([])
        result = tokenizer.decode([255])
        assert result == "\ufffd"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
