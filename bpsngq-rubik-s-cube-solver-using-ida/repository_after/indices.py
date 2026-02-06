
# Index calculation functions for Rubik's Cube heuristics

def get_co_index(co):
    idx = 0
    for i in range(7):
        idx = idx * 3 + co[i]
    return idx

def get_eo_index(eo):
    idx = 0
    for i in range(11):
        idx = idx * 2 + eo[i]
    return idx

FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320]
def get_cp_index(cp):
    idx = 0
    for i in range(7):
        less = 0
        v = cp[i]
        for j in range(i+1, 8):
            if v > cp[j]: less += 1
        idx += less * FACT[7-i]
    return idx

# Permutation ranking for P(n, k)
# Number of ways to pick k items from n and arrange them
def get_subset_rank(positions, n):
    # positions: tuple of k distinct values in [0, n-1]
    # The rank is based on the positions of labeled pieces.
    rank = 0
    k = len(positions)
    
    used = 0
    for i in range(k):
        val = positions[i]
        count = 0
        for v in range(val):
            if not (used & (1 << v)):
                count += 1
        
        # P(n-1-i, k-1-i)
        p = 1
        for j in range(k - 1 - i):
            p *= (n - 1 - i - j)
        
        rank += count * p
        used |= (1 << val)
    return rank

def get_edge_subset_index(ep, subset):
    # ep: edge permutation array (12 elements)
    # subset: list of piece values to track, in order.
    # We need to find the position of each piece in 'subset'
    k = len(subset)
    positions = [0] * k
    for i in range(12):
        val = ep[i]
        for j in range(k):
            if val == subset[j]:
                positions[j] = i
                break
    return get_subset_rank(positions, 12)
