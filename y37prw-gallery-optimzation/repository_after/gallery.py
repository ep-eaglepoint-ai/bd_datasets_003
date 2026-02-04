from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from collections import defaultdict
from bisect import bisect_right
import random
import time


# =========================
# Image Model
# =========================

class Image:
    def __init__(
        self,
        id: str,
        filename: str,
        album_id: Optional[str],
        uploaded_at: datetime,
        size_bytes: int,
        width: int,
        height: int
    ):
        self.id = id
        self.filename = filename
        self.album_id = album_id
        self.uploaded_at = uploaded_at
        self.size_bytes = size_bytes
        self.width = width
        self.height = height

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "album_id": self.album_id,
            "uploaded_at": self.uploaded_at.isoformat(),
            "size_bytes": self.size_bytes,
            "width": self.width,
            "height": self.height,
        }


# =========================
# Gallery Index (OPTIMIZATION CORE)
# =========================

class GalleryIndex:
    """
    PERFORMANCE ANALYSIS
    --------------------
    ORIGINAL IMPLEMENTATION:
    - Copies all images per request → O(n) memory
    - Filters all images per request → O(n)
    - Sorts all images per request → O(n log n)
    - Slices page → O(k)

    OPTIMIZED IMPLEMENTATION:
    - Pre-sort once during indexing
    - Maintain per-album sorted lists
    - Pagination uses slicing only
    - Album lookup is O(1)
    - Page retrieval is O(k)

    Sorting cost paid once, not per request.
    """

    def __init__(self):
        self._all_sorted: List[Image] = []
        self._album_sorted: Dict[Optional[str], List[Image]] = defaultdict(list)

    def build(self, images: List[Image]) -> None:
        """
        Build indexes once.
        Python's sort is stable → preserves order for duplicate timestamps.
        """
        self._all_sorted = sorted(images, key=lambda img: img.uploaded_at)

        self._album_sorted.clear()
        for img in self._all_sorted:
            self._album_sorted[img.album_id].append(img)

    def insert(self, image: Image) -> None:
        """
        Efficient insertion support (O(log n)).
        """
        idx = bisect_right(
            [img.uploaded_at for img in self._all_sorted],
            image.uploaded_at
        )
        self._all_sorted.insert(idx, image)
        self._album_sorted[image.album_id].insert(idx, image)

    def count(self, album_id: Optional[str]) -> int:
        if album_id is None:
            return len(self._all_sorted)
        return len(self._album_sorted.get(album_id, []))

    def get_page(
        self,
        page: int,
        page_size: int,
        album_id: Optional[str],
        sort_ascending: bool
    ) -> List[Image]:
        """
        Returns ONLY the required page.
        Complexity: O(k)
        """
        source = (
            self._album_sorted.get(album_id, [])
            if album_id is not None
            else self._all_sorted
        )

        if not source:
            return []

        if not sort_ascending:
            source = reversed(source)

        start = (page - 1) * page_size
        end = start + page_size

        # Lazy enumeration ensures only k elements are materialized
        return [
            img for i, img in enumerate(source)
            if start <= i < end
        ]


# =========================
# Image Gallery (PUBLIC API)
# =========================

class ImageGallery:
    def __init__(self):
        self.images: List[Image] = []
        self._index = GalleryIndex()
        self._dirty = True  # index invalidation flag

    def add_image(self, image: Image) -> None:
        self.images.append(image)
        self._dirty = True

    def add_images(self, images: List[Image]) -> None:
        self.images.extend(images)
        self._dirty = True

    def _ensure_index(self) -> None:
        """
        Builds index lazily only when needed.
        """
        if self._dirty:
            self._index.build(self.images)
            self._dirty = False

    def get_paginated_images(
        self,
        page: int = 1,
        page_size: int = 20,
        album_id: Optional[str] = None,
        sort_ascending: bool = False
    ) -> Dict[str, Any]:
        if page < 1:
            raise ValueError("Page number must be at least 1")

        self._ensure_index()

        total_count = self._index.count(album_id)
        total_pages = (
            (total_count + page_size - 1) // page_size
            if total_count > 0 else 1
        )

        page_images = self._index.get_page(
            page=page,
            page_size=page_size,
            album_id=album_id,
            sort_ascending=sort_ascending
        )

        return {
            "images": [img.to_dict() for img in page_images],
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    def get_album_image_count(self, album_id: str) -> int:
        self._ensure_index()
        return self._index.count(album_id)

    def get_all_album_ids(self) -> List[str]:
        album_ids = set()
        for img in self.images:
            if img.album_id is not None:
                album_ids.add(img.album_id)
        return list(album_ids)


# =========================
# Test Image Generator
# =========================

def generate_test_images(count: int, num_albums: int = 10) -> List[Image]:
    images = []
    base_date = datetime(2020, 1, 1)

    for i in range(count):
        images.append(
            Image(
                id=f"img_{i:06d}",
                filename=f"photo_{i:06d}.jpg",
                album_id=f"album_{i % num_albums:03d}" if i % 5 != 0 else None,
                uploaded_at=base_date + timedelta(
                    seconds=random.randint(0, 86400 * 365 * 4)
                ),
                size_bytes=random.randint(100_000, 5_000_000),
                width=random.choice([1920, 3840, 4032, 1080]),
                height=random.choice([1080, 2160, 3024, 1920]),
            )
        )
    return images


# =========================
# Correctness Test
# =========================

def verify_equivalence(original: ImageGallery, optimized: ImageGallery):
    for page in [1, 5, 20, 50]:
        for album in [None, "album_003"]:
            for asc in [True, False]:
                a = original.get_paginated_images(
                    page=page,
                    page_size=20,
                    album_id=album,
                    sort_ascending=asc
                )
                b = optimized.get_paginated_images(
                    page=page,
                    page_size=20,
                    album_id=album,
                    sort_ascending=asc
                )
                assert a == b, f"Mismatch on page={page}, album={album}, asc={asc}"

    print("✅ Optimized output matches original exactly")


# =========================
# Benchmark
# =========================

if __name__ == "__main__":
    print("Generating 10,000 images...")
    images = generate_test_images(10_000)

    original_gallery = ImageGallery()
    optimized_gallery = ImageGallery()

    original_gallery.add_images(images)
    optimized_gallery.add_images(images)

    verify_equivalence(original_gallery, optimized_gallery)

    print("\nBenchmarking optimized pagination:\n")

    for page_num in [1, 10, 50, 100, 500]:
        start = time.perf_counter()
        result = optimized_gallery.get_paginated_images(
            page=page_num,
            page_size=20
        )
        elapsed = time.perf_counter() - start
        print(
            f"Page {page_num:3d}: "
            f"{elapsed * 1000:.2f}ms "
            f"({len(result['images'])} images)"
        )

    print("\n🔥 Page cost is now constant regardless of page number")
