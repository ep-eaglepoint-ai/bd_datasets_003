#!/usr/bin/env python3
"""Benchmark script to validate pipeline Definition-of-Done performance requirements.

Strict checks:
- Wall clock time <= 300s
- Peak *process RSS* <= 4GB

Notes:
- RSS is measured via psutil to reflect actual process memory usage.
- The input CSV path can be provided via SALES_DATA_CSV env var.
"""

import os
import sys
import time

import psutil

def run_benchmark():
    proc = psutil.Process(os.getpid())

    peak_rss = 0
    start_time = time.time()

    from main import main

    # Run the pipeline, sampling RSS periodically.
    # This keeps overhead low while still catching peaks during chunk processing.
    # If you want tighter sampling, reduce interval.
    sample_interval_s = float(os.environ.get("RSS_SAMPLE_INTERVAL", "0.05"))

    # crude cooperative sampling: run main in-process and sample in between GC points
    # Since main() is synchronous, we sample in a loop using a small watchdog.
    # We can't easily interleave without threading; use a background thread.
    import threading
    stop = threading.Event()

    def sampler():
        nonlocal peak_rss
        while not stop.is_set():
            try:
                rss = proc.memory_info().rss
                if rss > peak_rss:
                    peak_rss = rss
            except Exception:
                pass
            time.sleep(sample_interval_s)

    t = threading.Thread(target=sampler, daemon=True)
    t.start()
    try:
        main()
    finally:
        stop.set()
        t.join(timeout=1)

    duration = time.time() - start_time
    peak_mb = peak_rss / 1024 / 1024
    
    print("\n" + "=" * 50)
    print("BENCHMARK RESULTS")
    print("=" * 50)
    print(f"Duration: {duration:.2f} seconds ({duration / 60:.2f} minutes)")
    print(f"Peak RSS: {peak_mb:.2f} MB ({peak_mb / 1024:.2f} GB)")
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
