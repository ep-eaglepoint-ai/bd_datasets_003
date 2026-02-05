from .parser import parse_singmaster, format_moves
from .heuristic import Heuristic
from .ida_star import IDAStar

class OptimalCubeSolver:
    """
    Principal Robotics Engineer implementation of a sub-second Rubik's Cube solver.
    Uses IDA* search with pre-computed Pattern Database Heuristics.
    """
    def __init__(self):
        # Initialize the modular search and heuristic engines
        self.heuristic = Heuristic()
        self.search_engine = IDAStar(self.heuristic)

    def solve(self, scramble_string: str) -> str:
        """
        Accepts a 54-char Singmaster notation string and returns a move sequence solution.
        """
        # Parse the input string into internal permutation/orientation arrays
        initial_state = parse_singmaster(scramble_string)
        
        # Execute the IDA* search (Iterative Deepening A*)
        move_sequence = self.search_engine.solve(initial_state)
        
        # Format the internal move list back to standard notation
        return format_moves(move_sequence)
