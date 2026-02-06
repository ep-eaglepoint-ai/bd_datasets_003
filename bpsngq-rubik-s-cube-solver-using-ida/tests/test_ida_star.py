import sys
import os
import time
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.cube_state import CubeState
from repository_after.moves import apply_move
from repository_after.heuristic import Heuristic
from repository_after.ida_star import IDAStar

def test_ida_star_solved():
    h = Heuristic()
    solver = IDAStar(h)
    state = CubeState.solved_state()
    assert solver.solve(state) == []

def test_ida_star_optimal_3_moves():
    h = Heuristic()
    solver = IDAStar(h)
    
    # Scramble: R U F
    state = CubeState.solved_state()
    apply_move(state, "R")
    apply_move(state, "U")
    apply_move(state, "F")
    
    # solve() mutates state in-place, copy it for verification if needed
    scramble_state = state.copy()
    solution = solver.solve(scramble_state)
    assert len(solution) == 3
    
    # Verify solution on the original scrambled state
    verify_state = state.copy()
    for move in solution:
        apply_move(verify_state, move)
    assert verify_state.is_solved()

def test_ida_star_performance_7_moves():
    h = Heuristic()
    solver = IDAStar(h)
    
    # Scramble known to be 7 moves: R U R' U' R U R'
    # Actually I'll use a sequence that is semi-complex
    scramble = ["R", "U", "F", "L", "D", "B", "R"]
    state = CubeState.solved_state()
    for m in scramble:
        apply_move(state, m)
        
    start_time = time.time()
    # solve() mutates state in-place, copy it for verification
    scramble_state = state.copy()
    solution = solver.solve(scramble_state)
    end_time = time.time()
    
    print(f"\nSolution: {solution}")
    assert len(solution) <= 7
    assert (end_time - start_time) < 1.0, f"Solved in {end_time - start_time:.4f}s, expected < 1s"
    
    # Verify
    verify_state = state.copy()
    for move in solution:
        apply_move(verify_state, move)
    
    if not verify_state.is_solved():
        print(f"Final state not solved!")
        print(f"CP: {verify_state.cp}")
        print(f"CO: {verify_state.co}")
        print(f"EP: {verify_state.ep}")
        print(f"EO: {verify_state.eo}")
        
    assert verify_state.is_solved()

def test_ida_star_optimality():
    h = Heuristic()
    solver = IDAStar(h)
    
    # R U R' is 3 moves. Solver should return exactly 3.
    state = CubeState.solved_state()
    apply_move(state, "R")
    apply_move(state, "U")
    apply_move(state, "R'")
    
    solution = solver.solve(state)
    assert len(solution) == 3
