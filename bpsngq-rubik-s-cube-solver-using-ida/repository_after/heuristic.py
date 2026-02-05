from .moves import MOVE_DATA
import math

# Updated PDBs:
# 1. Corner Orientation (2187)
# 2. Edge Orientation (2048)
# 3. Corner Permutation (40320)
# 4. UD-slice Edges (FR, FL, BR, BL) Position & Permutation (11880)
# 5. Top Edges (UR, UF, UL, UB) Position & Permutation (11880)

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

def get_edge_subset_index(ep, subset):
    # k-permutation of n: P(12, k)
    # subset is the set of edge pieces we track (e.g., [8,9,10,11])
    # We find where these pieces are and in what order.
    # This is slightly more complex.
    # Actually, simpler: track where each piece is.
    # piece 8 is at pos p0, piece 9 at p1, etc.
    res = 0
    # Positions of subset pieces
    pos = [0] * len(subset)
    for p_idx, piece in enumerate(subset):
        for i in range(12):
            if ep[i] == piece:
                pos[p_idx] = i
                break
    
    # Lehmer code style for positions
    # (Simplified: just treat as 12*11*10*9)
    # Wait, the number of states is 12*11*10*9 = 11880.
    # We can use a simpler index.
    used_mask = 0
    idx = 0
    for i in range(len(subset)):
        p = pos[i]
        # count how many positions < p are NOT used
        actual_p = p
        temp_mask = used_mask
        for _ in range(p):
            if temp_mask & 1:
                actual_p -= 1
            temp_mask >>= 1
        
        # multiplier is P(12-1-i, len(subset)-1-i)
        mult = 1
        for k in range(len(subset)-1-i):
            mult *= (12 - 1 - i - k)
        
        idx += actual_p * mult
        used_mask |= (1 << p)
    return idx

class Heuristic:
    def __init__(self):
        # We'll use 5 tables: CO, EO, CP, UD-slice, and Top-edges
        self.co_table = self._gen_co_table()
        self.eo_table = self._gen_eo_table()
        self.cp_table = self._gen_cp_table()
        self.ud_table = self._gen_edge_table([8, 9, 10, 11])
        self.top_table = self._gen_edge_table([0, 1, 2, 3])

    def _gen_co_table(self):
        table = bytearray([255]) * 2187
        start = (0,)*8
        table[get_co_index(start)] = 0
        queue = [start]
        d = 0
        while queue:
            next_q = []
            for s in queue:
                # Iterate over ALL 18 moves (FTM)
                for move_name, m in MOVE_DATA.items():
                    p, inc = m['cp_p'], m['co_i']
                    ns = tuple((s[p[i]] + inc[i]) % 3 for i in range(8))
                    idx = get_co_index(ns)
                    if table[idx] == 255:
                        table[idx] = d + 1
                        next_q.append(ns)
            queue = next_q
            d += 1
        return table

    def _gen_eo_table(self):
        table = bytearray([255]) * 2048
        start = (0,)*12
        table[get_eo_index(start)] = 0
        queue = [start]
        d = 0
        while queue:
            next_q = []
            for s in queue:
                for move_name, m in MOVE_DATA.items():
                    p, inc = m['ep_p'], m['eo_i']
                    ns = tuple((s[p[i]] + inc[i]) % 2 for i in range(12))
                    idx = get_eo_index(ns)
                    if table[idx] == 255:
                        table[idx] = d + 1
                        next_q.append(ns)
            queue = next_q
            d += 1
        return table

    def _gen_cp_table(self):
        table = bytearray([255]) * 40320
        start = tuple(range(8))
        table[get_cp_index(start)] = 0
        queue = [start]
        d = 0
        while queue:
            next_q = []
            for s in queue:
                for move_name, m in MOVE_DATA.items():
                    p = m['cp_p']
                    ns = tuple(s[p[i]] for i in range(8))
                    idx = get_cp_index(ns)
                    if table[idx] == 255:
                        table[idx] = d + 1
                        next_q.append(ns)
            queue = next_q
            d += 1
        return table

    def _gen_edge_table(self, subset):
        table = bytearray([255]) * 11880
        start = tuple(range(12))
        table[get_edge_subset_index(start, subset)] = 0
        queue = [start]
        d = 0
        while queue:
            next_q = []
            for s in queue:
                for move_name, m in MOVE_DATA.items():
                    p = m['ep_p']
                    ns = tuple(s[p[i]] for i in range(12))
                    idx = get_edge_subset_index(ns, subset)
                    if table[idx] == 255:
                        table[idx] = d + 1
                        next_q.append(ns)
            queue = next_q
            d += 1
        return table

    def get_h(self, state) -> int:
        return max(
            self.co_table[get_co_index(state.co)],
            self.eo_table[get_eo_index(state.eo)],
            self.cp_table[get_cp_index(state.cp)],
            self.ud_table[get_edge_subset_index(state.ep, [8, 9, 10, 11])],
            self.top_table[get_edge_subset_index(state.ep, [0, 1, 2, 3])]
        )
