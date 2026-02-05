from .cube_state import CubeState

# Corners: 0:UFR, 1:URB, 2:UBL, 3:ULF, 4:DRF, 5:DFL, 6:DLB, 7:DBR
# Edges: 0:UR, 1:UF, 2:UL, 3:UB, 4:DR, 5:DF, 6:DL, 7:DB, 8:FR, 9:FL, 10:BR, 11:BL

# Base 90-degree moves
_BASE_MOVE_DATA = {
    'U': {
        'cp_p': [3, 0, 1, 2, 4, 5, 6, 7],
        'co_i': [0, 0, 0, 0, 0, 0, 0, 0],
        'ep_p': [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'D': {
        'cp_p': [0, 1, 2, 3, 5, 6, 7, 4],
        'co_i': [0, 0, 0, 0, 0, 0, 0, 0],
        'ep_p': [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'L': {
        'cp_p': [0, 1, 6, 2, 4, 3, 5, 7],
        'co_i': [0, 0, 1, 2, 0, 1, 2, 0],
        'ep_p': [0, 1, 11, 3, 4, 5, 9, 7, 8, 2, 10, 6],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'R': {
        'cp_p': [4, 0, 2, 3, 7, 5, 6, 1],
        'co_i': [2, 1, 0, 0, 1, 0, 0, 2],
        'ep_p': [8, 1, 2, 3, 10, 5, 6, 7, 4, 9, 0, 11],
        'eo_i': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    'F': {
        'cp_p': [3, 1, 2, 5, 0, 4, 6, 7],
        'co_i': [1, 0, 0, 2, 2, 1, 0, 0],
        'ep_p': [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11],
        'eo_i': [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]
    },
    'B': {
        'cp_p': [0, 7, 1, 3, 4, 5, 2, 6],
        'co_i': [0, 1, 2, 0, 0, 0, 1, 2],
        'ep_p': [0, 1, 2, 10, 4, 5, 6, 11, 8, 9, 7, 3],
        'eo_i': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]
    }
}

# Pre-calculate all 18 moves
MOVE_DATA = {}
for face, data in _BASE_MOVE_DATA.items():
    cp, co = data['cp_p'], data['co_i']
    ep, eo = data['ep_p'], data['eo_i']
    
    # CW 90
    MOVE_DATA[face] = data
    
    # 180
    MOVE_DATA[face + '2'] = {
        'cp_p': [cp[cp[i]] for i in range(8)],
        'co_i': [(co[cp[i]] + co[i]) % 3 for i in range(8)],
        'ep_p': [ep[ep[i]] for i in range(12)],
        'eo_i': [(eo[ep[i]] + eo[i]) % 2 for i in range(12)]
    }
    
    # CCW 90
    cp2, co2 = MOVE_DATA[face + '2']['cp_p'], MOVE_DATA[face + '2']['co_i']
    ep2, eo2 = MOVE_DATA[face + '2']['ep_p'], MOVE_DATA[face + '2']['eo_i']
    MOVE_DATA[face + "'"] = {
        'cp_p': [cp[cp2[i]] for i in range(8)],
        'co_i': [(co[cp2[i]] + co2[i]) % 3 for i in range(8)],
        'ep_p': [ep[ep2[i]] for i in range(12)],
        'eo_i': [(eo[ep2[i]] + eo2[i]) % 2 for i in range(12)]
    }

def apply_move(state, move_name):
    """
    Applies move in-place with minimal operations.
    """
    m = MOVE_DATA.get(move_name)
    if not m:
        raise ValueError(f"Invalid move: {move_name}")
    
    cp_p, co_i = m['cp_p'], m['co_i']
    ep_p, eo_i = m['ep_p'], m['eo_i']
    
    cp, co = state.cp, state.co
    ep, eo = state.ep, state.eo

    # Update corners
    # (Using local variables to avoid repeated attribute access)
    n_cp = [cp[cp_p[i]] for i in range(8)]
    n_co = [(co[cp_p[i]] + co_i[i]) % 3 for i in range(8)]
    state.cp = n_cp
    state.co = n_co

    # Update edges
    n_ep = [ep[ep_p[i]] for i in range(12)]
    n_eo = [(eo[ep_p[i]] + eo_i[i]) % 2 for i in range(12)]
    state.ep = n_ep
    state.eo = n_eo
