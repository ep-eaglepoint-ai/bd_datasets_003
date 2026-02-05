import sys
import os

# Add the project root to sys.path to allow importing from repository_after
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.cube_state import CubeState

def test_solved_state_reports_solved():
    state = CubeState.solved_state()
    assert state.is_solved() is True

def test_copy_is_deep_and_does_not_affect_original():
    original = CubeState.solved_state()
    duplicate = original.copy()
    
    # Mutate duplicate
    duplicate.cp[0] = 7
    duplicate.co[1] = 2
    duplicate.ep[2] = 11
    duplicate.eo[3] = 1
    
    assert original.cp[0] == 0
    assert original.co[1] == 0
    assert original.ep[2] == 2
    assert original.eo[3] == 0
    assert original.is_solved() is True
    assert duplicate.is_solved() is False

def test_internal_arrays_ranges_and_lengths():
    state = CubeState.solved_state()
    
    # Check lengths
    assert len(state.cp) == 8
    assert len(state.co) == 8
    assert len(state.ep) == 12
    assert len(state.eo) == 12
    
    # Check value ranges for solved state
    for val in state.cp:
        assert 0 <= val <= 7
    for val in state.co:
        assert 0 <= val <= 2
    for val in state.ep:
        assert 0 <= val <= 11
    for val in state.eo:
        assert 0 <= val <= 1
