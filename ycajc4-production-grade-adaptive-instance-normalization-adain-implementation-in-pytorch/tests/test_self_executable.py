import subprocess
import sys
import os


def test_adain_file_executable():
    adain_path = os.path.join(os.path.dirname(__file__), '..', 'repository_after', 'adain.py')
    result = subprocess.run([sys.executable, adain_path], 
                          capture_output=True, text=True, timeout=10)
    assert result.returncode == 0
    assert "torch.Size" in result.stdout
