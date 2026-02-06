"""
Truly independent facelet-level simulator for Rubik's Cube.
Derived from mechanical 4-cycles of the 54-character Singmaster string.
Used for Requirement #7: Independent verification of solver solutions.
"""

# Sticker cycles for 90-degree clockwise turns
# Each cycle (a, b, c, d) means sticker at a moves to b, b moves to c, c moves to d, d moves to a.
CYCLES = {
    'U': [(0, 2, 8, 6), (1, 3, 7, 5), (9, 18, 36, 45), (10, 46, 37, 19), (11, 20, 38, 47)],
    'D': [(15, 24, 42, 51), (16, 25, 43, 52), (17, 26, 44, 53), (27, 33, 35, 29), (28, 30, 34, 32)],
    'F': [(6, 44, 29, 9), (7, 39, 28, 12), (8, 38, 27, 15), (18, 24, 26, 20), (19, 21, 25, 23)],
    'L': [(0, 42, 27, 38), (3, 50, 30, 21), (6, 36, 33, 44), (18, 47, 53, 24), (37, 41, 43, 39)],
    'R': [(2, 20, 29, 51), (5, 23, 32, 48), (8, 26, 35, 45), (9, 15, 17, 11), (10, 12, 16, 14)],
    'B': [(0, 45, 35, 53), (1, 14, 34, 41), (2, 51, 33, 47), (11, 17, 42, 36), (46, 48, 52, 50)],
}

def apply_move_to_string(s, move):
    """Apply a move to a 54-char Singmaster string using sticker cycles."""
    chars = list(s)
    face = move[0]
    count = 1
    if len(move) > 1:
        if move[1] == "'": count = 3
        elif move[1] == '2': count = 2
    
    for _ in range(count):
        for cycle in CYCLES[face]:
            # a moves to b, b to c, c to d, d to a
            # logic: chars[b] = old_chars[a]
            last = chars[cycle[-1]]
            for i in range(len(cycle) - 1, 0, -1):
                chars[cycle[i]] = chars[cycle[i-1]]
            chars[cycle[0]] = last
            
    return "".join(chars)

def verify_solution(scramble_str, solution_str):
    """Verifies that solution_str solves scramble_str using the facelet simulator."""
    solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    current = scramble_str
    if solution_str:
        for move in solution_str.split():
            current = apply_move_to_string(current, move)
    return current == solved
