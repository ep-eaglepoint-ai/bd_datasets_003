#!/usr/bin/env python3
"""
Benchmark script to validate pipeline performance requirements.
- Execution time must be under 5 minutes (300 seconds)
- Peak memory usage must be under 4GB (4096 MB)
"""

import time
import tracemalloc
import sys

def run_benchmark():
    tracemalloc.start()
    
    start_time = time.time()
    
    from main import main
    main()
    
    end_time = time.time()
    
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    duration = end_time - start_time
    peak_mb = peak / 1024 / 1024
    
    print("\n" + "=" * 50)
    print("BENCHMARK RESULTS")
    print("=" * 50)
    print(f"Duration: {duration:.2f} seconds ({duration / 60:.2f} minutes)")
    print(f"Peak Memory: {peak_mb:.2f} MB ({peak_mb / 1024:.2f} GB)")
    print("=" * 50)
    
    MAX_TIME = 5 * 60
    MAX_MEMORY = 4 * 1024
    
    time_ok = duration <= MAX_TIME
    memory_ok = peak_mb <= MAX_MEMORY
    
    print(f"Time Check: {'PASS' if time_ok else 'FAIL'} (limit: {MAX_TIME}s)")
    print(f"Memory Check: {'PASS' if memory_ok else 'FAIL'} (limit: {MAX_MEMORY}MB)")
    
    if time_ok and memory_ok:
        print("\nBENCHMARK PASSED")
        return 0
    else:
        print("\nBENCHMARK FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(run_benchmark())
