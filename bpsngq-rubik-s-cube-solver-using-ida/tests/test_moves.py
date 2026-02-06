import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.cube_state import CubeState
from repository_after.moves import apply_move

def test_move_order_4():
    """Applying any 90-degree move 4 times returns the cube to the original state."""
    for move in ["U", "D", "L", "R", "F", "B", "U'", "D'", "L'", "R'", "F'", "B'"]:
        state = CubeState.solved_state()
        for _ in range(4):
            apply_move(state, move)
        assert state.is_solved(), f"Move {move} failed order 4 check"

def test_move_order_2():
    """Applying any 180-degree move 2 times returns the cube to the original state."""
    for move in ["U2", "D2", "L2", "R2", "F2", "B2"]:
        state = CubeState.solved_state()
        for _ in range(2):
            apply_move(state, move)
        assert state.is_solved(), f"Move {move} failed order 2 check"

def test_move_inverse():
    """Applying a move then its inverse returns to the original state."""
    moves = [("U", "U'"), ("D", "D'"), ("L", "L'"), ("R", "R'"), ("F", "F'"), ("B", "B'")]
    for m, minv in moves:
        state = CubeState.solved_state()
        apply_move(state, m)
        apply_move(state, minv)
        assert state.is_solved(), f"Move {m} and its inverse {minv} failed check"

def test_orientation_validity():
    """Orientation values must remain within valid ranges [0, 2] for corners and [0, 1] for edges."""
    state = CubeState.solved_state()
    # Apply a sequence of diverse moves
    dance = ["R", "U", "L", "B", "D", "F", "R'", "U2", "B'"]
    for m in dance:
        apply_move(state, m)
        for co in state.co:
            assert 0 <= co <= 2
        for eo in state.eo:
            assert 0 <= eo <= 1

def test_complex_cycle():
    """Verify a known property: (R U) applied 105 times returns to solved? No, but let's just do a small non-trivial test."""
    state = CubeState.solved_state()
    # (R U R' U') * 6 is identity if CO and CP are correct
    for _ in range(6):
        apply_move(state, "R")
        apply_move(state, "U")
        apply_move(state, "R'")
        apply_move(state, "U'")
    assert state.is_solved(), "(R U R' U')^6 should be identity"
