import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.cube_state import CubeState
from repository_after.moves import apply_move
from repository_after.heuristic import Heuristic

def test_heuristic_solved_is_zero():
    state = CubeState.solved_state()
    h = Heuristic()
    assert h.get_h(state) == 0

def test_heuristic_scrambled_is_positive():
    # Any single non-U/D move usually changes orientation
    h = Heuristic()
    
    # R move changes CO and EO (with my specific definitions)
    state = CubeState.solved_state()
    apply_move(state, "R")
    assert h.get_h(state) > 0
    
    state = CubeState.solved_state()
    apply_move(state, "F")
    assert h.get_h(state) > 0

def test_heuristic_non_negative():
    h = Heuristic()
    state = CubeState.solved_state()
    dance = ["R", "U", "L", "B", "D", "F", "R'", "U2", "B'"]
    for m in dance:
        apply_move(state, m)
        assert h.get_h(state) >= 0

def test_heuristic_consistency_simple():
    # Heuristic for state S should be <= Heuristic for state S' + 1 if S' is one move from S
    h = Heuristic()
    state = CubeState.solved_state()
    h0 = h.get_h(state)
    
    apply_move(state, "R")
    h1 = h.get_h(state)
    assert h1 <= h0 + 1
    # Note: BFS produces exact distance in the subspace, so this is always true.
