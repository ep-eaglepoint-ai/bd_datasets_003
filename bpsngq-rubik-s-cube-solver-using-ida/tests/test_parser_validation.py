
import pytest
from repository_after.parser import parse_singmaster

def test_parser_valid_solved():
    s = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    state = parse_singmaster(s)
    assert state.is_solved()

def test_parser_invalid_length():
    with pytest.raises(ValueError, match="exactly 54 characters"):
        parse_singmaster("UUU")

def test_parser_invalid_chars():
    with pytest.raises(ValueError, match="invalid characters"):
        parse_singmaster("X" * 54)

def test_parser_duplicate_centers():
    # Two U centers (indices 4 and 13)
    s = list("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    s[13] = 'U' # Replace R center with U
    with pytest.raises(ValueError, match="Center facelets must be unique"):
        parse_singmaster("".join(s))

def test_parser_missing_piece():
    # Replace one corner facelet with another color, creating an impossible piece
    # UFR is U, R, F. Let's make it U, R, U (impossible corner with two U stickers)
    s = list("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    s[20] = 'U' # Change F facelet of UFR to U
    with pytest.raises(ValueError, match="Invalid corner piece"):
        parse_singmaster("".join(s))

def test_parser_duplicate_piece():
    # Replace UBL with UFR (physically impossible dup)
    # UBL is U1, L1, B3 (indices 0, 36, 47)
    # UFR is U9, R1, F3 (indices 8, 9, 20)
    s = list("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    s[0] = s[8]
    s[36] = s[9]
    s[47] = s[20]
    # This also removes UBL, so might hit 'missing piece' or 'duplicate corner'
    with pytest.raises(ValueError, match="Duplicate corner piece"):
        parse_singmaster("".join(s))

def test_parser_orientation_parity_corner():
    # Twist one corner CW (UFR)
    # U -> F, R -> U, F -> R
    s = list("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    # UFR indices: 8 (U), 9 (R), 20 (F)
    # Twist: U pos gets B (Wait, actual twist logic)
    # Just swap facelets cyclically: U->R, R->F, F->U is a twist?
    # Actually U->R is impossible.
    # UFR facelets are U, R, F colors.
    # To twist CW: U facelet becomes F color? No.
    # A physical twist means the piece is rotated in place.
    # U facelet shows F color? No. 
    # Let's just create a state with a single flipped edge.
    # UF edge (7, 19). Flip colors.
    # U7 is U, F2 is F.
    # Set U7 to F, F2 to U.
    s[7] = 'F'
    s[19] = 'U'
    with pytest.raises(ValueError, match="Invalid Edge Orientation Sum"):
        parse_singmaster("".join(s))

def test_parser_permutation_parity():
    # Swap two corners (UFR and URB) without swapping edges
    # This is a single swap, odd parity.
    # UFR: 8, 9, 20
    # URB: 2, 45, 11
    s = list("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB")
    
    # Store UFR colors
    ufr = (s[8], s[9], s[20])
    # Store URB colors
    urb = (s[2], s[45], s[11])
    
    # Swap
    s[8], s[9], s[20] = urb
    s[2], s[45], s[11] = ufr
    
    with pytest.raises(ValueError, match="Invalid Permutation Parity"):
        parse_singmaster("".join(s))
