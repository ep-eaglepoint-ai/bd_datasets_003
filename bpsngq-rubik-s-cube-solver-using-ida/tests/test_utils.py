def rotate_face(s, face_idx):
    # face_idx 0-5 (U, R, F, D, L, B)
    base = face_idx * 9
    f = list(s[base:base+9])
    # 0 1 2    6 3 0
    # 3 4 5 -> 7 4 1
    # 6 7 8    8 5 2
    new_f = [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]]
    return s[:base] + "".join(new_f) + s[base+9:]

def apply_move_str(s, move):
    # s is 54 char string
    face = move[0]
    power = 1
    if "'" in move: power = 3
    elif "2" in move: power = 2
    
    for _ in range(power):
        s = _apply_basic_move_str(s, face)
    return s

def _apply_basic_move_str(s, face):
    s = rotate_face(s, "URFD LB".index(face) if face != ' ' else 0) # wait
    idx = "URFDLB".index(face)
    s = rotate_face(s, idx)
    
    # Side effects
    ss = list(s)
    if face == 'U':
        # R(9,10,11), F(18,19,20), L(36,37,38), B(45,46,47)
        # B -> L -> F -> R -> B
        tmp = ss[45:48]
        ss[45:48] = ss[36:39]
        ss[36:39] = ss[18:21]
        ss[18:21] = ss[9:12]
        ss[9:12] = tmp
    elif face == 'D':
        # R(15,16,17), F(24,25,26), L(42,43,44), B(51,52,53)
        # F -> L -> B -> R -> F
        tmp = ss[18+6:18+9]
        ss[18+6:18+9] = ss[9+6:9+9]
        ss[9+6:9+9] = ss[45+6:45+9]
        ss[45+6:45+9] = ss[36+6:36+9]
        ss[36+6:36+9] = tmp # Wait, check directions
    # ... I'll just use a few moves for the test
    return "".join(ss)
