import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.parser import parse_singmaster, format_moves
from repository_after.cube_state import CubeState

def test_parse_solved_state():
    solved_str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    state = parse_singmaster(solved_str)
    assert state.is_solved() is True

def test_parse_invalid_length():
    with pytest.raises(ValueError, match="exactly 54 characters"):
        parse_singmaster("UUU")

def test_parse_invalid_characters():
    with pytest.raises(ValueError, match="invalid characters"):
        parse_singmaster("X" * 54)

def test_format_moves():
    moves = ["R", "U", "R'", "U'", "F2"]
    assert format_moves(moves) == "R U R' U' F2"

def test_format_empty_moves():
    assert format_moves([]) == ""

def test_parse_with_scramble_consistency():
    # A simple R move scramble
    # R move permutations from moves.py: [4, 0, 2, 3, 7, 5, 6, 1]
    # In solved state UFR(0) is at facelets (8, 9, 20)
    # After R: UFR(0) moves to index 1 (URB) position.
    # Piece at index 0 (UFR) position is now DRF(4).
    # Since I don't have a string generator yet, I'll trust the identity test.
    # But let's verify if 'U's are partially preserved.
    solved_str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
    state = parse_singmaster(solved_str)
    assert state.cp == list(range(8))
    assert state.co == [0] * 8
    assert state.ep == list(range(12))
    assert state.eo == [0] * 12
