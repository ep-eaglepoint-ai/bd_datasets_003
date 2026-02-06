from .cube_state import CubeState

# Pre-calculated move tables for piece permutations and orientations.
MOVE_DATA = {
    'U': {
        'cp_p': [1, 2, 3, 0, 4, 5, 6, 7],
        'co_i': [0, 0, 0, 0, 0, 0, 0, 0],
        'ep_p': [1, 2, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'D': {
        'cp_p': [0, 1, 2, 3, 7, 4, 5, 6],
        'co_i': [0, 0, 0, 0, 0, 0, 0, 0],
        'ep_p': [0, 1, 2, 3, 7, 4, 5, 6, 8, 9, 10, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'L': {
        'cp_p': [0, 1, 3, 5, 4, 6, 2, 7],
        'co_i': [0, 0, 1, 2, 0, 1, 2, 0],
        'ep_p': [0, 1, 9, 3, 4, 5, 11, 7, 8, 6, 10, 2],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'R': {
        'cp_p': [1, 7, 2, 3, 0, 5, 6, 4],
        'co_i': [2, 1, 0, 0, 1, 0, 0, 2],
        'ep_p': [10, 1, 2, 3, 8, 5, 6, 7, 0, 9, 4, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'F': {
        'cp_p': [4, 1, 2, 0, 5, 3, 6, 7],
        'co_i': [1, 0, 0, 2, 2, 1, 0, 0],
        'ep_p': [0, 8, 2, 3, 4, 9, 6, 7, 5, 1, 10, 11],
        'eo_i': [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]
    },
    'B': {
        'cp_p': [0, 2, 6, 3, 4, 5, 7, 1],
        'co_i': [0, 1, 2, 0, 0, 0, 1, 2],
        'ep_p': [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7],
        'eo_i': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]
    }
}

# Derived moves (', 2)
for face in 'UDFLRB':
    m1 = MOVE_DATA[face]
    # Double move (2)
    m2 = {
        'cp_p': [m1['cp_p'][m1['cp_p'][i]] for i in range(8)],
        'co_i': [(m1['co_i'][i] + m1['co_i'][m1['cp_p'][i]]) % 3 for i in range(8)],
        'ep_p': [m1['ep_p'][m1['ep_p'][i]] for i in range(12)],
        'eo_i': [(m1['eo_i'][i] + m1['eo_i'][m1['ep_p'][i]]) % 2 for i in range(12)]
    }
    MOVE_DATA[face + '2'] = m2
    # Inverse move (') = 3x CW
    m3 = {
        'cp_p': [m2['cp_p'][m1['cp_p'][i]] for i in range(8)],
        'co_i': [(m2['co_i'][i] + m1['co_i'][m2['cp_p'][i]]) % 3 for i in range(8)],
        'ep_p': [m2['ep_p'][m1['ep_p'][i]] for i in range(12)],
        'eo_i': [(m2['eo_i'][i] + m1['eo_i'][m2['ep_p'][i]]) % 2 for i in range(12)]
    }
    MOVE_DATA[face + "'"] = m3

# Inverse mapping for undoing moves
INVERSE_MOVES = {}
for face in 'UDFLRB':
    INVERSE_MOVES[face] = face + "'"
    INVERSE_MOVES[face + "'"] = face
    INVERSE_MOVES[face + '2'] = face + '2'

# Static buffers for interim piece states to ensure ZERO allocations in apply_move
_BUFC_P = [0] * 8
_BUFC_O = [0] * 8
_BUFE_P = [0] * 12
_BUFE_O = [0] * 12

def apply_move(state, move):
    """
    Applies a Rubik's Cube move to the CubeState in-place with ZERO allocations.
    """
    m = MOVE_DATA[move]
    p_cp, i_co = m['cp_p'], m['co_i']
    p_ep, i_eo = m['ep_p'], m['eo_i']
    
    cp, co = state.cp, state.co
    ep, eo = state.ep, state.eo

    # Update corners in-place using buffers
    for i in range(8):
        _BUFC_P[i] = cp[p_cp[i]]
        _BUFC_O[i] = (co[p_cp[i]] + i_co[i]) % 3
    for i in range(8):
        cp[i], co[i] = _BUFC_P[i], _BUFC_O[i]

    # Update edges in-place using buffers
    for i in range(12):
        _BUFE_P[i] = ep[p_ep[i]]
        _BUFE_O[i] = (eo[p_ep[i]] + i_eo[i]) % 2
    for i in range(12):
        ep[i], eo[i] = _BUFE_P[i], _BUFE_O[i]

def undo_move(state, move):
    """Undoes a move by applying its inverse in-place with ZERO allocations."""
    apply_move(state, INVERSE_MOVES[move])
