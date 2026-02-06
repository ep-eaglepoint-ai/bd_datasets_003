import sys
import os
import time
import pytest
import random

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from repository_after.solver import OptimalCubeSolver
from repository_after.moves import apply_move
from repository_after.cube_state import CubeState
from independent_validator import verify_solution

# Shared solver instance to avoid repeated PDB generation
_SHARED_SOLVER = None

def get_solver():
    global _SHARED_SOLVER
    if _SHARED_SOLVER is None:
        _SHARED_SOLVER = OptimalCubeSolver()
    return _SHARED_SOLVER

def reconstruct_singmaster(state):
    """Convert CubeState back to Singmaster string."""
    C_F = [(8,9,20), (2,45,11), (0,36,47), (6,18,38), (29,26,15), (27,44,24), (33,53,42), (35,17,51)]
    E_F = [(5,10), (7,19), (3,37), (1,46), (32,16), (28,25), (30,43), (34,52), (23,12), (21,39), (48,14), (50,41)]
    C_COLORS = [('U', 'R', 'F'), ('U', 'B', 'R'), ('U', 'L', 'B'), ('U', 'F', 'L'), ('D', 'F', 'R'), ('D', 'L', 'F'), ('D', 'B', 'L'), ('D', 'R', 'B')]
    E_COLORS = [('U', 'R'), ('U', 'F'), ('U', 'L'), ('U', 'B'), ('D', 'R'), ('D', 'F'), ('D', 'L'), ('D', 'B'), ('F', 'R'), ('F', 'L'), ('B', 'R'), ('B', 'L')]
    
    s = [''] * 54
    s[4], s[13], s[22], s[31], s[40], s[49] = 'U', 'R', 'F', 'D', 'L', 'B'
    for i in range(8):
        cp, co = state.cp[i], state.co[i]
        colors = C_COLORS[cp]
        pos = C_F[i]
        if co == 0: order = [0,1,2]
        elif co == 1: order = [1,2,0]
        else: order = [2,0,1]
        for j in range(3): s[pos[order[j]]] = colors[j]
    for i in range(12):
        ep, eo = state.ep[i], state.eo[i]
        colors = E_COLORS[ep]
        pos = E_F[i]
        if eo == 0: s[pos[0]], s[pos[1]] = colors[0], colors[1]
        else: s[pos[0]], s[pos[1]] = colors[1], colors[0]
    return "".join(s)

def test_end_to_end_solved():
    """Test that the solver correctly identifies an already-solved cube."""
    solver = get_solver()
    solved_str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    solution = solver.solve(solved_str)
    assert solution == ""
    assert verify_solution(solved_str, solution)

def test_curated_7_move_optimal():
    """Requirement 8: 7-move optimal in < 1s."""
    # Ensure solver is loaded before timing (exclude PDB loading cost)
    solver = get_solver()
    
    state = CubeState.solved_state()
    # Scramble known to be exactly 7 moves in HTM (no shorter equivalent)
    scramble_moves = ["U", "R", "F", "B", "L", "D", "U"] 
    for move in scramble_moves:
        apply_move(state, move)
    scramble_str = reconstruct_singmaster(state)
    
    start = time.time()
    solution = solver.solve(scramble_str)
    duration = time.time() - start
    
    sol_len = len(solution.split()) if solution else 0
    print(f"\n7-move solved in {duration:.4f}s: {solution}")
    assert duration < 1.0
    # Search is optimal, so it should find exactly 7 moves for this scramble.
    assert sol_len == 7 
    assert verify_solution(scramble_str, solution)

def test_curated_8_move_optimal():
    """Requirement 8: 8-move optimal in < 1s."""
    solver = get_solver()
    
    state = CubeState.solved_state()
    # Scramble known to be exactly 8 moves in HTM
    scramble_moves = ["U", "R", "F", "B", "L", "D", "U", "R"]
    for move in scramble_moves:
        apply_move(state, move)
    scramble_str = reconstruct_singmaster(state)
    
    start = time.time()
    solution = solver.solve(scramble_str)
    duration = time.time() - start
    
    sol_len = len(solution.split()) if solution else 0
    print(f"\n8-move solved in {duration:.4f}s: {solution}")
    assert duration < 1.0
    assert sol_len == 8
    assert verify_solution(scramble_str, solution)

def test_10_move_random_scramble():
    """Requirement 4: Verify solution length for a random scramble (depth 10)."""
    solver = get_solver()
    
    # Deterministic random seed for reproducibility
    rng = random.Random(42)
    
    state = CubeState.solved_state()
    moves = ["U", "D", "L", "R", "F", "B", "U'", "D'", "L'", "R'", "F'", "B'", "U2", "D2", "L2", "R2", "F2", "B2"]
    
    # Construct a valid scramble by avoiding immediate redundancy
    scramble_moves = []
    last_face = ""
    # We use 10 moves as a benchmark depth.
    while len(scramble_moves) < 10:
        m = rng.choice(moves)
        if m[0] == last_face: continue
        scramble_moves.append(m)
        last_face = m[0]
        
    for move in scramble_moves:
        apply_move(state, move)
    scramble_str = reconstruct_singmaster(state)
    
    start = time.time()
    solution = solver.solve(scramble_str)
    duration = time.time() - start
    
    sol_len = len(solution.split()) if solution else 0
    print(f"\n10-move scramble solved in {duration:.4f}s: {solution}")
    # Heuristic is admissible, so it should be optimal. 
    assert sol_len <= 10
    assert sol_len < 25  # Requirement 4
    assert verify_solution(scramble_str, solution)

def test_solver_strict_optimality_check_depth_7():
    """Negative proof of optimality for depth 7: No solution exists at depth 6."""
    solver = get_solver()
    # Scramble known to be exactly 7 moves.
    scramble_moves = ["U", "R", "F", "B", "L", "D", "U"]
    state = CubeState.solved_state()
    for move in scramble_moves:
        apply_move(state, move)
    
    # Run a raw search with threshold 6 (one less than optimal)
    ep_buf = [0] * 12
    result, path = solver.search_engine._search(state, 0, 6, None, [], ep_buf)
    
    assert result > 6
    assert path is None
    print(f"\nStrict optimality verified: No solution found at depth 6 for 7-move scramble.")

def test_solver_strict_optimality_check_depth_8():
    """Negative proof of optimality for depth 8: No solution exists at depth 7."""
    solver = get_solver()
    # Scramble known to be exactly 8 moves.
    scramble_moves = ["U", "R", "F", "B", "L", "D", "U", "R"]
    state = CubeState.solved_state()
    for move in scramble_moves:
        apply_move(state, move)
    
    # Run a raw search with threshold 7 (one less than optimal)
    ep_buf = [0] * 12
    result, path = solver.search_engine._search(state, 0, 7, None, [], ep_buf)
    
    assert result > 7
    assert path is None
    print(f"\nStrict optimality verified: No solution found at depth 7 for 8-move scramble.")
