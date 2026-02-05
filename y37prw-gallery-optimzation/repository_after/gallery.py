from datetime import datetime
from typing import List, Optional, Dict, Any
from bisect import bisect_left, bisect_right, insort_left


class Image:
    def __init__(self, id: str, filename: str, album_id: Optional[str],
                 uploaded_at: datetime, size_bytes: int, width: int, height: int):
        self.id = id
        self.filename = filename
        self.album_id = album_id
        self.uploaded_at = uploaded_at
        self.size_bytes = size_bytes
        self.width = width
        self.height = height

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'filename': self.filename,
            'album_id': self.album_id,
            'uploaded_at': self.uploaded_at.isoformat(),
            'size_bytes': self.size_bytes,
            'width': self.width,
            'height': self.height
        }


class ImageGallery:
    def __init__(self):
       
        self.images: List[Image] = []

      
        self._sorted_all_asc: List[Image] = []

       
        self._sorted_all_desc: List[Image] = []

       
        self._sorted_by_album_asc: Dict[str, List[Image]] = {}

       
        self._sorted_by_album_desc: Dict[str, List[Image]] = {}

    def add_image(self, image: Image) -> None:
        self.images.append(image)

       
        insort_left(self._sorted_all_asc, image, key=lambda x: x.uploaded_at)
        
        insort_left(self._sorted_all_desc, image, key=lambda x: -x.uploaded_at.timestamp())

        if image.album_id:
            if image.album_id not in self._sorted_by_album_asc:
                self._sorted_by_album_asc[image.album_id] = []
                self._sorted_by_album_desc[image.album_id] = []

            insort_left(self._sorted_by_album_asc[image.album_id], image,
                        key=lambda x: x.uploaded_at)
            insort_left(self._sorted_by_album_desc[image.album_id], image,
                        key=lambda x: -x.uploaded_at.timestamp())

    def add_images(self, images: List[Image]) -> None:
        for img in images:
            self.add_image(img)

    def get_paginated_images(
        self,
        page: int = 1,
        page_size: int = 20,
        album_id: Optional[str] = None,
        sort_ascending: bool = False
    ) -> Dict[str, Any]:
        if page < 1:
            raise ValueError("Page number must be at least 1")

        
        if album_id is not None:
            if album_id not in self._sorted_by_album_asc:
                sorted_images = []
            else:
                sorted_images = (
                    self._sorted_by_album_asc[album_id]
                    if sort_ascending else
                    self._sorted_by_album_desc[album_id]
                )
        else:
            sorted_images = (
                self._sorted_all_asc
                if sort_ascending else
                self._sorted_all_desc
            )

        total_count = len(sorted_images)
        total_pages = max(1, (total_count + page_size - 1) // page_size)

        start_index = (page - 1) * page_size
        end_index = start_index + page_size

        # Slice directly — O(k) where k = page_size
        page_images = sorted_images[start_index:end_index]
        result_images = [img.to_dict() for img in page_images]

        return {
            'images': result_images,
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages
        }

    def get_album_image_count(self, album_id: str) -> int:
      
        return len(self._sorted_by_album_asc.get(album_id, []))

    def get_all_album_ids(self) -> List[str]:
        return list(self._sorted_by_album_asc.keys())



def generate_test_images(count: int, num_albums: int = 10) -> List[Image]:
    import random
    from datetime import timedelta

    images = []
    base_date = datetime(2020, 1, 1)

    for i in range(count):
        img = Image(
            id=f"img_{i:06d}",
            filename=f"photo_{i:06d}.jpg",
            album_id=f"album_{i % num_albums:03d}" if i % 5 != 0 else None,
            uploaded_at=base_date + timedelta(seconds=random.randint(0, 86400 * 365 * 4)),
            size_bytes=random.randint(100000, 5000000),
            width=random.choice([1920, 3840, 4032, 1080]),
            height=random.choice([1080, 2160, 3024, 1920])
        )
        images.append(img)

    return images


if __name__ == "__main__":
    import time

    print("Generating 10,000 test images...")
    test_images = generate_test_images(10000)

    gallery = ImageGallery()
    gallery.add_images(test_images)

    print("\nBenchmarking pagination performance:\n")

    for page_num in [1, 10, 50, 100, 500]:
        start = time.perf_counter()
        result = gallery.get_paginated_images(page=page_num, page_size=20)
        elapsed = time.perf_counter() - start
        print(f"Page {page_num:3d}: {elapsed*1000:6.2f} ms   (images: {len(result['images']):2d})")

    print("\nBenchmarking with album filter:\n")

    for page_num in [1, 10, 50, 200]:
        start = time.perf_counter()
        result = gallery.get_paginated_images(page=page_num, page_size=20, album_id="album_003")
        elapsed = time.perf_counter() - start
        print(f"Album filter, Page {page_num:3d}: {elapsed*1000:6.2f} ms   (images: {len(result['images']):2d})")

    print("\n" + "="*70)
    print("Optimized version: deep pages should now be fast (similar time to page 1)")
    print("="*70)