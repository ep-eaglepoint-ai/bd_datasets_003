"""Byte-Level Byte Pair Encoding (BBPE) Tokenizer."""


class ByteBPE:
    """Byte-Level BPE tokenizer operating on UTF-8 byte streams."""
    
    def __init__(self, merges: list[tuple[int, int]]) -> None:
        seen_pairs = set()
        
        for i, merge in enumerate(merges):
            if not isinstance(merge, tuple):
                raise TypeError(f"Merge rules must be tuples, got {type(merge)} at index {i}")
            if len(merge) != 2:
                raise ValueError(f"Merge rules must be tuples of exactly 2 elements, got {len(merge)} at index {i}")
            if not isinstance(merge[0], int) or not isinstance(merge[1], int):
                raise TypeError(f"Merge rule elements must be integers at index {i}")
            
            if merge in seen_pairs:
                raise ValueError(f"Duplicate merge rule {merge} at index {i}")
            seen_pairs.add(merge)
            
            left, right = merge
            if left < 0 or left >= 256 + i:
                raise ValueError(f"Invalid merge rule element {left} at index {i}: must be in range [0, {256 + i - 1}]")
            if right < 0 or right >= 256 + i:
                raise ValueError(f"Invalid merge rule element {right} at index {i}: must be in range [0, {256 + i - 1}]")
        
        self.merges: list[tuple[int, int]] = list(merges)
        self.vocab_size: int = 256 + len(merges)
        self.merge_map: dict[int, tuple[int, int]] = {256 + i: pair for i, pair in enumerate(merges)}
        self.pair_to_token: dict[tuple[int, int], int] = {pair: 256 + i for i, pair in enumerate(merges)}
    
    def encode(self, text: str) -> list[int]:
        if not text:
            return []
        
        tokens = list(text.encode('utf-8'))
        
        for pair in self.merges:
            token_id = self.pair_to_token[pair]
            tokens = self._apply_merge_exhaustive(tokens, pair, token_id)
        
        return tokens
    
    def _apply_merge_exhaustive(self, tokens: list[int], pair: tuple[int, int], new_token: int) -> list[int]:
        while True:
            new_tokens, changed = self._apply_merge(tokens, pair, new_token)
            if not changed:
                break
            tokens = new_tokens
        return tokens
    
    def _apply_merge(self, tokens: list[int], pair: tuple[int, int], new_token: int) -> tuple[list[int], bool]:
        if len(tokens) < 2:
            return tokens, False
        
        result = []
        i = 0
        changed = False
        
        while i < len(tokens):
            if i < len(tokens) - 1 and tokens[i] == pair[0] and tokens[i + 1] == pair[1]:
                result.append(new_token)
                i += 2
                changed = True
            else:
                result.append(tokens[i])
                i += 1
        
        return result, changed
    
    def decode(self, tokens: list[int]) -> str:
        if not tokens:
            return ""
        
        for token in tokens:
            if token < 0:
                raise ValueError(f"Token IDs must be non-negative, got {token}")
            if token >= self.vocab_size:
                raise ValueError(f"Token {token} exceeds vocabulary size {self.vocab_size}")
        
        bytes_list = []
        for token in tokens:
            bytes_list.extend(self._decompose_token(token))
        
        byte_array = bytes(bytes_list)
        return byte_array.decode('utf-8', errors='replace')
    
    def _decompose_token(self, token: int, _seen: set[int] | None = None) -> list[int]:
        if _seen is None:
            _seen = set()
        
        if token in _seen:
            raise ValueError(f"Cycle detected in merge rules involving token {token}")
        
        if token < 256:
            return [token]
        
        _seen.add(token)
        left, right = self.merge_map[token]
        result = self._decompose_token(left, _seen) + self._decompose_token(right, _seen)
        _seen.remove(token)
        return result


def main():
    tokenizer = ByteBPE([(240, 159)])
    
    text = "👋"
    tokens = tokenizer.encode(text)
    decoded = tokenizer.decode(tokens)
    
    print(f"Original: {text}")
    print(f"Encoded: {tokens}")
    print(f"Decoded: {decoded}")
    print(f"Round-trip: {decoded == text}")


if __name__ == "__main__":
    main()
