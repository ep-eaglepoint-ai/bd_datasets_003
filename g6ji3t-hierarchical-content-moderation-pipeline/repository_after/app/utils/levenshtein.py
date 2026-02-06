from __future__ import annotations


def levenshtein_distance(a: str, b: str) -> int:
    """
    Classic DP Levenshtein distance (insert/delete/replace).
    Memory optimized to O(min(len(a), len(b))).
    """
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    if len(a) < len(b):
        a, b = b, a

    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            cur.append(min(ins, delete, sub))
        prev = cur

    return prev[-1]
