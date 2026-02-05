from .cube_state import CubeState
from collections import Counter

# Indices in 54-char string (U, R, F, D, L, B)
# Face: U(0-8), R(9-17), F(18-26), D(27-35), L(36-44), B(45-53)
# Corners (Pos: Facelets)
C_F = [
    (8, 9, 20),   # 0: UFR (U9, R1, F3)
    (2, 45, 11),  # 1: URB (U3, B1, R3)
    (0, 36, 47),  # 2: UBL (U1, L1, B3)
    (6, 18, 38),  # 3: ULF (U7, F1, L3)
    (29, 26, 15), # 4: DRF (D3, F9, R7)
    (27, 44, 24), # 5: DFL (D1, L9, F7)
    (33, 53, 42), # 6: DLB (D7, B9, L7)
    (35, 17, 51)  # 7: DBR (D9, R9, B7)
]

# Edges (Pos: Facelets)
E_F = [
    (5, 10),      # 0: UR (U6, R2)
    (7, 19),      # 1: UF (U8, F2)
    (3, 37),      # 2: UL (U4, L2)
    (1, 46),      # 3: UB (U2, B2)
    (32, 16),     # 4: DR (D6, R8)
    (28, 25),     # 5: DF (D2, F8)
    (30, 43),     # 6: DL (D4, L8)
    (34, 52),     # 7: DB (D8, B8)
    (23, 12),     # 8: FR (F6, R4)
    (21, 39),     # 9: FL (F4, L6)
    (48, 14),     # 10: BR (B4, R6)
    (50, 41)      # 11: BL (B6, L4)
]

# Piece definitions (U, D facelets first for orientation logic)
# Standard Color Scheme: U=White, D=Yellow, L=Green, R=Blue, F=Red, B=Orange
# But parsing must support dynamic centers.
# We define pieces by their sets of centers.

def parse_singmaster(s: str) -> CubeState:
    """Parses a 54-char Singmaster notation string into a CubeState."""
    if len(s) != 54:
        raise ValueError(f"String must be exactly 54 characters, got {len(s)}")
    
    valid_chars = set("URFDLB")
    if not all(c.upper() in valid_chars for c in s):
        raise ValueError("String contains invalid characters. Only U, R, F, D, L, B allowed.")

    # Determine center mapping (what color is on what face)
    # Singmaster standard: U:s[4], R:s[13], F:s[22], D:s[31], L:s[40], B:s[49]
    centers = {
        'U': s[4], 'R': s[13], 'F': s[22], 
        'D': s[31], 'L': s[40], 'B': s[49]
    }
    
    # Reverse map: Color -> Face Name
    # Check for duplicate centers
    raw_centers = list(centers.values())
    if len(set(raw_centers)) != 6:
        raise ValueError("Center facelets must be unique colors.")
        
    color_map = {v: k for k, v in centers.items()}

    # Pieces definitions by standard Face Names
    C_SET = [
        {'U','R','F'}, {'U','R','B'}, {'U','L','B'}, {'U','L','F'},
        {'D','R','F'}, {'D','L','F'}, {'D','L','B'}, {'D','R','B'}
    ]
    E_SET = [
        {'U','R'}, {'U','F'}, {'U','L'}, {'U','B'},
        {'D','R'}, {'D','F'}, {'D','L'}, {'D','B'},
        {'F','R'}, {'F','L'}, {'B','R'}, {'B','L'}
    ]

    cp = [-1] * 8
    co = [0] * 8
    
    # Track found pieces to ensure 1-to-1 mapping
    found_corners = [False] * 8
    
    for i in range(8):
        # Get colors at this corner position
        try:
            colors = [color_map[s[idx]] for idx in C_F[i]]
        except KeyError as e:
            raise ValueError(f"Invalid color char found at corner {i}: {e}")
            
        c_set = set(colors)
        
        # Identify which physical piece this is
        match_idx = -1
        for p_idx, p_set in enumerate(C_SET):
            if c_set == p_set:
                match_idx = p_idx
                break
        
        if match_idx == -1:
            raise ValueError(f"Invalid corner piece at position {i}: {c_set}")
            
        if found_corners[match_idx]:
             raise ValueError(f"Duplicate corner piece found: {c_set}")
        found_corners[match_idx] = True
        cp[i] = match_idx
        
        # Orientation:
        # 0: U/D color is on U/D face
        # 1: U/D color is on R/L/F/B face (needs CW twist to be correct?) -> standard def
        # Simple rule: index of U/D color in the tuple (U/D, F/B/L/R, R/L/F/B)
        # Wait, our C_F tuples are specific.
        # i=0 (UFR): U, R, F.
        # If color[0] is U or D -> orient 0.
        # If color[1] is U or D -> orient 1.
        # If color[2] is U or D -> orient 2.
        
        # Check standard definitions for reference faces
        # Corner 0 (UFR): U(0), R(1), F(2). 
        # Ref faces for orientation are U and D.
        found_ud = False
        for orient, color in enumerate(colors):
            if color in ('U', 'D'):
                co[i] = orient
                found_ud = True
                break
        if not found_ud:
             raise ValueError(f"Corner piece {i} ({c_set}) lacks a U or D color.")

    ep = [-1] * 12
    eo = [0] * 12
    found_edges = [False] * 12
    
    for i in range(12):
        colors = [color_map[s[idx]] for idx in E_F[i]]
        e_set = set(colors)
        
        match_idx = -1
        for p_idx, p_set in enumerate(E_SET):
            if e_set == p_set:
                match_idx = p_idx
                break
        
        if match_idx == -1:
            raise ValueError(f"Invalid edge piece at position {i}: {e_set}")
            
        if found_edges[match_idx]:
            raise ValueError(f"Duplicate edge piece found: {e_set}")
        found_edges[match_idx] = True
        ep[i] = match_idx
        
        # Edge Orientation
        # 0 = Correct, 1 = Flipped
        # Rule: Is U/D color on U/D face? Yes -> 0.
        # If no U/D color, is F/B color on F/B face? Yes -> 0.
        # Else 1.
        # Ref faces for position i (from E_F definitions):
        # 0 (UR): U, R. 
        c1, c2 = colors
        
        # Determine strict EO
        # This requires checking against the specific facelet mapping
        # E_F[0] is (5, 10) which are U facelet and R facelet.
        # If c1 in U/D: 0. 
        # If c2 in U/D: 1.
        # If piece is FR (F, R faces). No U/D.
        # If c1 in F/B: 0.
        # If c2 in F/B: 1.
        
        is_ud_piece = ('U' in e_set or 'D' in e_set)
        
        val = 1
        if is_ud_piece:
            if c1 in ('U', 'D'): val = 0
        else:
            # Side edge
            if c1 in ('F', 'B'): val = 0
            
        eo[i] = val

    # Verify Counts
    if not all(found_corners): raise ValueError("Missing corner pieces.")
    if not all(found_edges): raise ValueError("Missing edge pieces.")

    # Verify Orientation Parity
    if sum(co) % 3 != 0:
        raise ValueError(f"Invalid Corner Orientation Sum: {sum(co)} (must be div by 3)")
    if sum(eo) % 2 != 0:
        raise ValueError(f"Invalid Edge Orientation Sum: {sum(eo)} (must be div by 2)")
        
    # Verify Permutation Parity
    # Calculate number of swaps for CP and EP
    def count_swaps(perm):
        visited = [False] * len(perm)
        swaps = 0
        for i in range(len(perm)):
            if not visited[i]:
                cycle_len = 0
                x = i
                while not visited[x]:
                    visited[x] = True
                    x = perm[x]
                    cycle_len += 1
                if cycle_len > 1:
                    swaps += (cycle_len - 1)
        return swaps

    cp_swaps = count_swaps(cp)
    ep_swaps = count_swaps(ep)
    
    if (cp_swaps % 2) != (ep_swaps % 2):
        raise ValueError("Invalid Permutation Parity (Corner and Edge swap parity mismatch).")

    return CubeState(cp, co, ep, eo)

def format_moves(move_list: list[str]) -> str:
    """Converts a list of move names to a notation string."""
    return " ".join(move_list)
