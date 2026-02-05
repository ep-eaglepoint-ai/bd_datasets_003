import sys
import os
import time
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.solver import OptimalCubeSolver
from repository_after.parser import parse_singmaster
from repository_after.moves import apply_move
from repository_after.heuristic import get_co_index, get_eo_index, get_cp_index, get_edge_subset_index

def test_solver_8_moves_performance():
    solver = OptimalCubeSolver()
    
    # Scramble: R U F B L D R U (8 moves)
    scramble = ["R", "U", "F", "B", "L", "D", "R", "U"]
    state = parse_singmaster("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    for m in scramble:
        apply_move(state, m)
    
    from repository_after.ida_star import IDAStar
    from repository_after.heuristic import Heuristic
    h = Heuristic()
    search = IDAStar(h)
    
    start_h = h.get_h(state)
    print(f"\nInitial state h: {start_h}")
    # ... prints ...
    
    start_time = time.time()
    solution = search.solve(state)
    end_time = time.time()
    
    print(f"\n8-move scramble solved in {end_time - start_time:.4f}s")
    assert len(solution) <= 8
    assert (end_time - start_time) < 1.0, "Failed to solve 8-move scramble in < 1s"
