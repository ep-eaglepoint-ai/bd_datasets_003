from .moves import apply_move

class IDAStar:
    def __init__(self, heuristic):
        self.heuristic = heuristic
        self.moves = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"]
        
        # Pre-calculated inverse moves for backtracking
        self.inverse_map = {
            "U": "U'", "U'": "U", "U2": "U2",
            "D": "D'", "D'": "D", "D2": "D2",
            "L": "L'", "L'": "L", "L2": "L2",
            "R": "R'", "R'": "R", "R2": "R2",
            "F": "F'", "F'": "F", "F2": "F2",
            "B": "B'", "B'": "B", "B2": "B2"
        }

    def solve(self, state):
        if state.is_solved():
            return []

        # Use the initial heuristic value as the starting threshold
        threshold = self.heuristic.get_h(state)
        
        while True:
            result, path = self._search(state, 0, threshold, [])
            if result == "FOUND":
                return path
            if result == float('inf'):
                return None
            threshold = result

    def _search(self, state, g, threshold, path):
        # Optimization: Pass state by reference and backtrack
        h = self.heuristic.get_h(state)
        f = g + h
        
        if f > threshold:
            return f, None
        
        if h == 0: # More reliable than state.is_solved() when h is correct
            if state.is_solved():
                return "FOUND", list(path)

        min_new_threshold = float('inf')
        
        last_face = path[-1][0] if path else None
        
        for move in self.moves:
            face = move[0]
            
            # Pruning rule 1: Don't rotate the same face twice
            if last_face == face:
                continue
            
            # Pruning rule 2: Eliminate redundant opposite face move orders
            if last_face:
                if (last_face == 'D' and face == 'U') or \
                   (last_face == 'L' and face == 'R') or \
                   (last_face == 'B' and face == 'F'):
                    continue

            # Apply move IN-PLACE
            # We must be extremely careful to backtrack
            prev_cp = state.cp
            prev_co = state.co
            prev_ep = state.ep
            prev_eo = state.eo
            
            apply_move(state, move)
            path.append(move)
            
            result, found_path = self._search(state, g + 1, threshold, path)
            
            # Backtrack immediately after search call
            path.pop()
            state.cp = prev_cp
            state.co = prev_co
            state.ep = prev_ep
            state.eo = prev_eo

            if result == "FOUND":
                return "FOUND", found_path
            
            if result < min_new_threshold:
                min_new_threshold = result
            
        return min_new_threshold, None
