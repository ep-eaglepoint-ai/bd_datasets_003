import os
import pathlib
from .moves import MOVE_DATA
from .indices import get_co_index, get_eo_index, get_cp_index, get_subset_rank

# Table sizes
CO_SIZE = 2187
EO_SIZE = 2048
CP_SIZE = 40320
# P(12, 6) = 665280
EDGE_POS_6_SIZE = 665280

DATA_DIR = pathlib.Path(__file__).parent / "data"

def gen_co_table():
    print("Generating CO table...")
    table = bytearray([255]) * CO_SIZE
    start = (0,)*8
    table[get_co_index(start)] = 0
    queue = [start]
    d = 0
    while queue:
        next_q = []
        for s in queue:
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

def gen_eo_table():
    print("Generating EO table...")
    table = bytearray([255]) * EO_SIZE
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

def gen_cp_table():
    print("Generating CP table...")
    table = bytearray([255]) * CP_SIZE
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

def gen_edge_table(subset):
    """
    BFS on the position tuples of the subset edges.
    There are P(12, k) such states.
    """
    print(f"Generating Edge table for subset {subset}...")
    table = bytearray([255]) * EDGE_POS_6_SIZE
    
    # Initial positions of pieces in 'subset'
    # Start: piece subset[0] is at index subset[0], etc.
    start = tuple(subset)
    table[get_subset_rank(start, 12)] = 0
    queue = [start]
    
    # Pre-calculate inverse EP transitions for each base move
    # ep_p maps new_idx -> old_idx.
    # To find the new_idx of a piece that was at old_idx, 
    # we need the inverse map: old_idx -> new_idx.
    ep_moves_inv = {}
    for name, m in MOVE_DATA.items():
        ep_p = m['ep_p']
        inv = [0] * 12
        for new_pos, old_pos in enumerate(ep_p):
            inv[old_pos] = new_pos
        ep_moves_inv[name] = tuple(inv)
    
    d = 0
    while queue:
        next_q = []
        for pos_tuple in queue:
            # pos_tuple[i] is the current position of piece subset[i]
            for move_name, inv in ep_moves_inv.items():
                # Direct O(1) lookup of new position using inverse permutation
                new_pos = tuple(inv[p] for p in pos_tuple)
                idx = get_subset_rank(new_pos, 12)
                if table[idx] == 255:
                    table[idx] = d + 1
                    next_q.append(new_pos)
        queue = next_q
        d += 1
    return table

def generate_all_tables():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    co = gen_co_table()
    with open(DATA_DIR / "co.bin", "wb") as f: f.write(co)
    
    eo = gen_eo_table()
    with open(DATA_DIR / "eo.bin", "wb") as f: f.write(eo)
    
    cp = gen_cp_table()
    with open(DATA_DIR / "cp.bin", "wb") as f: f.write(cp)
    
    e1 = gen_edge_table([0, 1, 2, 3, 4, 5])
    with open(DATA_DIR / "edges_05.bin", "wb") as f: f.write(e1)
    
    e2 = gen_edge_table([6, 7, 8, 9, 10, 11])
    with open(DATA_DIR / "edges_611.bin", "wb") as f: f.write(e2)
    
    print(f"All tables generated and saved to {DATA_DIR}")

if __name__ == "__main__":
    generate_all_tables()
