import sys
import os
import time
import pytest
import random

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.solver import OptimalCubeSolver
from repository_after.parser import parse_singmaster
from repository_after.moves import apply_move
from repository_after.cube_state import CubeState

# Standard Facelet Indices from parser.py
C_F = [
    (8, 9, 20),   # 0: UFR
    (2, 45, 11),  # 1: URB
    (0, 36, 47),  # 2: UBL
    (6, 18, 38),  # 3: ULF
    (29, 26, 15), # 4: DRF
    (27, 44, 24), # 5: DFL
    (33, 53, 42), # 6: DLB
    (35, 17, 51)  # 7: DBR
]
E_F = [
    (5, 10),      # 0: UR
    (7, 19),      # 1: UF
    (3, 37),      # 2: UL
    (1, 46),      # 3: UB
    (32, 16),     # 4: DR
    (28, 25),     # 5: DF
    (30, 43),     # 6: DL
    (34, 52),     # 7: DB
    (23, 12),     # 8: FR
    (21, 39),     # 9: FL
    (48, 14),     # 10: BR
    (50, 41)      # 11: BL
]

CENTER_INDICES = {'U':4, 'R':13, 'F':22, 'D':31, 'L':40, 'B':49}

# Solved Colors for Pieces (Ordered locally to match C_F/E_F definitions)
# 0: UFR -> U, R, F
C_COLORS = [
    ('U','R','F'), ('U','B','R'), ('U','L','B'), ('U','F','L'), # 0-3
    ('D','R','F'), ('D','F','L'), ('D','L','B'), ('D','B','R')  # 4-7
]
# 0: UR -> U, R
E_COLORS = [
    ('U','R'), ('U','F'), ('U','L'), ('U','B'),
    ('D','R'), ('D','F'), ('D','L'), ('D','B'),
    ('F','R'), ('F','L'), ('B','R'), ('B','L')
]

def reconstruct_singmaster(state: CubeState) -> str:
    """Reconstructs a 54-char string from specific CubeState."""
    s = [''] * 54
    
    # Centers
    for face, idx in CENTER_INDICES.items():
        s[idx] = face
        
    # Corners
    for i in range(8):
        p_idx = state.cp[i]
        orient = state.co[i]
        pos_indices = C_F[i]
        colors = C_COLORS[p_idx]
        
        # Orientation 0: Colors match ref (U/D is at pos 0).
        # Orientation 1: CW twist. U/D is at pos 1.
        # Orientation 2: CCW twist. U/D is at pos 2.
        # We need to map ordered colors to positions based on orientation.
        # If orient=0: c[0]->pos[0], c[1]->pos[1], c[2]->pos[2]
        # If orient=1: c[2]->pos[0], c[0]->pos[1], c[1]->pos[2] (CW twist of piece relative to slot)
        # Wait, let's verify standard definition.
        # Typically CO=1 means twisted CW.
        # If we have piece URF at URF slot. co=0 -> U at U, R at R, F at F.
        # co=1 -> U at R, R at F, F at U (CW rotation of colors).
        # So pos[0] (U facelet) gets F color (colors[2]).
        # pos[1] (R facelet) gets U color (colors[0]).
        # pos[2] (F facelet) gets R color (colors[1]).
        
        # Let's generalize:
        # Shift colors RIGHT by orient? 
        # orient=0: 0,1,2
        # orient=1: 2,0,1
        # orient=2: 1,2,0
        
        shift = (3 - orient) % 3
        # No, simpler:
        # co is amount piece is twisted CW. 
        # So we need to rotate colors CCW to map to fixed slot facelets?
        # Let's align with parser logic.
        # Parser: if color[orient] in (U,D) -> orient.
        # So if orient=1, color[1] is U/D.
        # color[1] is placed at pos[1] (R facelet of UFR).
        # So U/D color is at R facelet.
        # Colors: (U, R, F).
        # If we place U color at R facelet (pos[1]), that means s[pos[1]] = 'U'.
        # So colors are shifted s.t. U is at index `orient`.
        
        c0, c1, c2 = colors
        placed_colors = [None]*3
        
        # If orient=0: U at 0. placed: c0, c1, c2.
        # If orient=1: U at 1. placed: c2, c0, c1. (U color c0 is at 1)
        # If orient=2: U at 2. placed: c1, c2, c0. (U color c0 is at 2)
        
        if orient == 0:
            placed_colors = [c0, c1, c2]
        elif orient == 1:
            placed_colors = [c2, c0, c1]
        elif orient == 2:
            placed_colors = [c1, c2, c0]
            
        s[pos_indices[0]] = placed_colors[0]
        s[pos_indices[1]] = placed_colors[1]
        s[pos_indices[2]] = placed_colors[2]

    # Edges
    for i in range(12):
        p_idx = state.ep[i]
        orient = state.eo[i]
        pos_indices = E_F[i]
        colors = E_COLORS[p_idx]
        
        # Orient 0: Unflipped. c0->pos0, c1->pos1.
        # Orient 1: Flipped. c1->pos0, c0->pos1.
        
        if orient == 0:
            s[pos_indices[0]] = colors[0]
            s[pos_indices[1]] = colors[1]
        else:
            s[pos_indices[0]] = colors[1]
            s[pos_indices[1]] = colors[0]

    # Fill remaining centers? No, all 54 chars should be filled.
    # U0..U8. Indices 0..8
    # U4 is center. 0,1,2,3,5,6,7,8 are corners/edges.
    return "".join(s)

def test_end_to_end_solved():
    solver = OptimalCubeSolver()
    solved_str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    solution = solver.solve(solved_str)
    assert solution == ""

def test_end_to_end_known_scrambles():
    solver = OptimalCubeSolver()
    
    # 1. Verification of 3-move scramble: R U F
    # We construct the state properly
    state = CubeState.solved_state()
    moves = ["R", "U", "F"]
    for m in moves:
        apply_move(state, m)
    
    scramble_str = reconstruct_singmaster(state)
    solution = solver.solve(scramble_str)
    sol_moves = solution.split()
    
    # Verify correctness
    check_state = parse_singmaster(scramble_str)
    for m in sol_moves:
        apply_move(check_state, m)
    assert check_state.is_solved()
    
    # Optimality check
    assert len(sol_moves) <= 3

def test_end_to_end_7_move_optimality():
    solver = OptimalCubeSolver()
    
    # 7-move scramble: R U F L D B R
    scramble_moves = ["R", "U", "F", "L", "D", "B", "R"]
    state = CubeState.solved_state()
    for m in scramble_moves:
        apply_move(state, m)
        
    scramble_str = reconstruct_singmaster(state)
    
    start_time = time.time()
    solution = solver.solve(scramble_str)
    duration = time.time() - start_time
    
    sol_moves = solution.split()
    
    print(f"\n7-move solve: {solution} in {duration:.4f}s")
    assert len(sol_moves) <= 7
    assert duration < 1.0, "Must solve 7-move scramble in < 1s"
    
    # Correctness
    check_state = parse_singmaster(scramble_str)
    for m in sol_moves:
        apply_move(check_state, m)
    assert check_state.is_solved()

def test_solution_length_requirement_random_scramble():
    solver = OptimalCubeSolver()
    
    # Generate a random 20-move scramble
    import random
    valid_moves = ["U", "D", "L", "R", "F", "B"]
    scramble_moves = []
    for _ in range(20):
        m = random.choice(valid_moves)
        scramble_moves.append(m)
        
    state = CubeState.solved_state()
    for m in scramble_moves:
        apply_move(state, m)
        
    scramble_str = reconstruct_singmaster(state)
    
    start_time = time.time()
    solution = solver.solve(scramble_str)
    duration = time.time() - start_time
    
    sol_moves = solution.split()
    print(f"\n20-move random solve length: {len(sol_moves)} moves in {duration:.4f}s")
    
    # Requirement 4: < 25 moves (near optimal)
    # Random scrambles are ~18-20 moves from solved optimally.
    # Our solver is optimal, so it should be <= 20 (or slightly more if my random walk was inefficient, 
    # but optimal distance is always <= 20 for any state).
    assert len(sol_moves) <= 22 # Optimal is <= 20. 22 is a safe margin for "near optimal"
    assert len(sol_moves) < 25 # Requirement
    
    # Verify
    check_state = parse_singmaster(scramble_str)
    for m in sol_moves:
        apply_move(check_state, m)
    assert check_state.is_solved()
