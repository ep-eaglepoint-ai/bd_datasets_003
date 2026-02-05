def count_prefixes(words: list[str], prefixes: list[str]) -> list[int]:
    out = []
    for p in prefixes:
        c = 0
        for w in words:
            if w.startswith(p):
                c += 1
        out.append(c)
    return out
