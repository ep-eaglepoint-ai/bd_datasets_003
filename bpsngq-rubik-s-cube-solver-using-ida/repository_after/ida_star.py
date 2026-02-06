from .moves import apply_move, undo_move

class IDAStar:
    def __init__(self, heuristic):
        self.heuristic = heuristic
        self.moves = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"]
        
        # Pre-calculate allowed moves for each previous move to avoid branch logic in hot loop
        self.move_transitions = {}
        # None case (start)
        self.move_transitions[None] = self.moves
        
        for m1 in self.moves:
            allowed = []
            f1 = m1[0]
            for m2 in self.moves:
                f2 = m2[0]
                # Pruning rule 1: Don't rotate same face twice (redundant)
                if f1 == f2: continue
                # Pruning rule 2: Fixed order for opposite faces (U-D is equivalent to D-U)
                # This significantly reduces the branching factor without loss of optimality
                # as opposite face moves commute.
                if (f1 == 'D' and f2 == 'U') or \
                   (f1 == 'R' and f2 == 'L') or \
                   (f1 == 'B' and f2 == 'F'):
                    continue
                allowed.append(m2)
            self.move_transitions[m1] = allowed

    def solve(self, state):
        if state.is_solved():
            return []

        # Allocate once per solve (thread-safe local)
        ep_buf = [0] * 12
        threshold = self.heuristic.get_h(state, ep_buf)
        
        while True:
            result, path = self._search(state, 0, threshold, None, [], ep_buf)
            if result == "FOUND":
                return path
            if result == float('inf'):
                return None
            threshold = result

    def _search(self, state, g, threshold, last_move, path, ep_buf):
        h = self.heuristic.get_h(state, ep_buf)
        f = g + h
        
        if f > threshold:
            return f, None
        
        if h == 0:
            return "FOUND", list(path)

        min_new_threshold = float('inf')
        
        for move in self.move_transitions[last_move]:
            apply_move(state, move)
            path.append(move)
            
            result, found_path = self._search(state, g + 1, threshold, move, path, ep_buf)
            
            if result == "FOUND":
                return "FOUND", found_path
            
            path.pop()
            undo_move(state, move)
            
            if result < min_new_threshold:
                min_new_threshold = result
            
        return min_new_threshold, None
