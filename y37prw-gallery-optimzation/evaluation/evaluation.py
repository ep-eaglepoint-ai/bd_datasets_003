import json
import time
import sys
import os
from datetime import datetime
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from repository_before.gallery import ImageGallery, generate_test_images
    from repository_after.gallery import ImageGallery as ImageGalleryAfter
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure repository_before/gallery.py and repository_after/gallery.py exist")
    sys.exit(1)


def run_benchmark(gallery_class, label: str, n_images=8000, page_size=20):
    """Run benchmark and collect timings"""
    print(f"\n[{label}] Generating {n_images} images...")
    images = generate_test_images(n_images)

    print(f"[{label}] Adding images...")
    gallery = gallery_class()
    start_add = time.perf_counter()
    gallery.add_images(images)
    add_time = time.perf_counter() - start_add

    timings = {}
    pages_to_test = [1, 10, 50, 100, 300, 500]

    print(f"[{label}] Running pagination benchmark...")
    for page in pages_to_test:
        start = time.perf_counter()
        result = gallery.get_paginated_images(page=page, page_size=page_size)
        elapsed_ms = (time.perf_counter() - start) * 1000
        timings[page] = {
            "time_ms": round(elapsed_ms, 3),
            "images_returned": len(result["images"]),
            "total_count": result["total_count"]
        }
        print(f"  Page {page:4d}: {elapsed_ms:8.3f} ms")

    
    album_id = "album_003"
    start_album = time.perf_counter()
    result_album = gallery.get_paginated_images(page=100, page_size=page_size, album_id=album_id)
    album_time_ms = (time.perf_counter() - start_album) * 1000

    return {
        "label": label,
        "add_time_seconds": round(add_time, 3),
        "pagination_timings": timings,
        "album_filter_page_100_time_ms": round(album_time_ms, 3),
        "album_filter_images_returned": len(result_album["images"]),
        "timestamp": datetime.utcnow().isoformat()
    }


def main():
    output_dir = Path(__file__).parent
    report_path = output_dir / "report.json"

    print("=" * 60)
    print("Starting Gallery Optimization Evaluation")
    print("=" * 60)

    results = []

    
    try:
        before_result = run_benchmark(ImageGallery, "BEFORE (original)")
        results.append(before_result)
    except Exception as e:
        print(f"BEFORE failed: {e}")
        results.append({"label": "BEFORE", "error": str(e)})

    
    try:
        after_result = run_benchmark(ImageGalleryAfter, "AFTER (optimized)")
        results.append(after_result)
    except Exception as e:
        print(f"AFTER failed: {e}")
        results.append({"label": "AFTER", "error": str(e)})

    
    report = {
        "evaluation_date": datetime.utcnow().isoformat(),
        "n_images": 8000,
        "page_size": 20,
        "results": results,
        "comparison_notes": {
            "deep_page_improvement": "Compare time for page 300/500 between BEFORE and AFTER"
        }
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nReport saved to: {report_path}")
    print(f"Size: {report_path.stat().st_size:,} bytes")

   
    print("\nQuick Summary:")
    for r in results:
        if "error" in r:
            print(f"  {r['label']}: FAILED")
        else:
            t1 = r["pagination_timings"][1]["time_ms"]
            t500 = r["pagination_timings"].get(500, {"time_ms": "N/A"})["time_ms"]
            print(f"  {r['label']}: page 1 = {t1:.1f} ms   |   page 500 = {t500} ms")


if __name__ == "__main__":
    main()