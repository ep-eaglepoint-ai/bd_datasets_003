import pathlib
from .moves import MOVE_DATA
from .indices import get_cp_index, get_subset_rank
from . import tables

class Heuristic:
    def __init__(self):
        # We'll use 5 tables: CO, EO, CP, and two 6-edge subsets
        self.data_dir = pathlib.Path(__file__).parent / "data"
        
        self.co_table = self._load_or_gen("co.bin", tables.gen_co_table)
        self.eo_table = self._load_or_gen("eo.bin", tables.gen_eo_table)
        self.cp_table = self._load_or_gen("cp.bin", tables.gen_cp_table)
        
        # Two 6-edge subsets track all 12 edges
        self.e05_table = self._load_or_gen("edges_05.bin", lambda: tables.gen_edge_table([0,1,2,3,4,5]))
        self.e611_table = self._load_or_gen("edges_611.bin", lambda: tables.gen_edge_table([6,7,8,9,10,11]))
        

    def _load_or_gen(self, filename, gen_func):
        path = self.data_dir / filename
        if path.exists():
            print(f"Loading PDB {filename} from disk...")
            with open(path, "rb") as f:
                return bytearray(f.read())
        else:
            print(f"PDB {filename} NOT found, generating (this may take several minutes)...")
            table = gen_func()
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "wb") as f:
                f.write(table)
            return table

    def get_h(self, state, p) -> int:
        co = state.co
        eo = state.eo
        cp = state.cp
        ep = state.ep
        
        # Inlined index calcs
        idx_co = 0
        for i in range(7): idx_co = idx_co * 3 + co[i]
        h_co = self.co_table[idx_co]
        
        idx_eo = 0
        for i in range(11): idx_eo = idx_eo * 2 + eo[i]
        h_eo = self.eo_table[idx_eo]
        
        h_cp = self.cp_table[get_cp_index(cp)]
        
        # p is a pre-allocated buffer passed from the search to avoid allocation
        for i in range(12):
            p[ep[i]] = i
            
        # Subset [0,1,2,3,4,5]
        idx_05 = get_subset_rank((p[0], p[1], p[2], p[3], p[4], p[5]), 12)
        h_05 = self.e05_table[idx_05]
        
        # Subset [6,7,8,9,10,11]
        idx_611 = get_subset_rank((p[6], p[7], p[8], p[9], p[10], p[11]), 12)
        h_611 = self.e611_table[idx_611]
        
        res = h_co
        if h_eo > res: res = h_eo
        if h_cp > res: res = h_cp
        if h_05 > res: res = h_05
        if h_611 > res: res = h_611
        return res
