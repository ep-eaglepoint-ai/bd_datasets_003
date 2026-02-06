import sys
import os
import time
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.solver import OptimalCubeSolver
from repository_after.parser import parse_singmaster
from repository_after.moves import apply_move
from repository_after.indices import get_co_index, get_eo_index, get_cp_index, get_subset_rank

@pytest.fixture(scope="module")
def solver_instance():
    # Pre-load solver (and PDBs) once for the module
    from repository_after.heuristic import Heuristic
    from repository_after.ida_star import IDAStar
    h = Heuristic()
    return IDAStar(h)

def test_solver_8_moves_performance(solver_instance):
    """Verify sub-second performance for depth 8."""
    # Scramble: R U F B L D R U (8 moves)
    scramble = ["R", "U", "F", "B", "L", "D", "R", "U"]
    state = parse_singmaster("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    for m in scramble:
        apply_move(state, m)
    
    start_time = time.time()
    solution = solver_instance.solve(state)
    duration = time.time() - start_time
    
    print(f"\n8-move scramble solved in {duration:.4f}s")
    assert len(solution) <= 8
    assert duration < 1.0

def test_solver_12_moves_stress(solver_instance):
    """Stress test for depth 12 to demonstrate scaling."""
    # Scramble: U R F B L D U R F B L D (12 moves)
    scramble = ["U", "R", "F", "B", "L", "D", "U", "R", "F", "B", "L", "D"]
    state = parse_singmaster("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    for m in scramble:
        apply_move(state, m)
    
    start_time = time.time()
    solution = solver_instance.solve(state)
    duration = time.time() - start_time
    
    print(f"\n12-move scramble solved in {duration:.4f}s")
    # In pure Python with 6-edge PDBs, 12 moves should solve in a 'reasonable' window (e.g. < 120s)
    assert len(solution) <= 12
    assert duration < 120.0
