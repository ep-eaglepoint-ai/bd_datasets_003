import pytest
import pathlib
import os

# Define expected PDB files and roughly expected sizes (non-zero)
REQUIRED_PDBS = [
    "co.bin",       # ~2187 bytes
    "eo.bin",       # ~2048 bytes
    "cp.bin",       # ~40320 bytes
    "edges_05.bin", # ~665280 bytes
    "edges_611.bin" # ~665280 bytes
]

def test_pdb_files_exist_and_are_valid():
    """
    Explicitly validate that all required Pattern Database (PDB) files
    are present in the data directory and have non-zero content.
    """
    base_path = pathlib.Path(__file__).parent.parent / "repository_after" / "data"
    
    assert base_path.exists(), f"Data directory not found at {base_path}"
    
    for filename in REQUIRED_PDBS:
        file_path = base_path / filename
        
        # Check existence
        assert file_path.exists(), f"Missing required PDB file: {filename}"
        
        # Check content (size > 0)
        size = file_path.stat().st_size
        assert size > 0, f"PDB file {filename} is empty!"
        
        # Optional: Check minimum expected size to ensure it's not just a placeholder
        assert size >= 2048, f"PDB file {filename} seems too small ({size} bytes)"
        
    print("\n[+] All PDB files verified successfully.")
