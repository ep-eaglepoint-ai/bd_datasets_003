
import unittest
import time
from datetime import datetime, timedelta
import random
from typing import List

# Import from the module under test
# Adjust path depending on how you run the tests
try:
    from gallery import Image, ImageGallery, generate_test_images
except ImportError:
    # Fallback - adjust according to your folder structure
    from ..gallery import Image, ImageGallery, generate_test_images


class TestImageGalleryCorrectness(unittest.TestCase):
  

    def setUp(self):
        self.gallery = ImageGallery()
        self.base = datetime(2024, 6, 1, 12, 0, 0)

        # Small, deterministic dataset
        self.images = [
            Image("i1", "photo1.jpg", "A", self.base + timedelta(days=3), 120000, 1920, 1080),
            Image("i2", "photo2.jpg", "A", self.base + timedelta(days=1), 150000, 1080, 1920),
            Image("i3", "photo3.jpg", None, self.base + timedelta(days=5), 200000, 4032, 3024),
            Image("i4", "photo4.jpg", "B", self.base + timedelta(days=4), 180000, 3840, 2160),
            Image("i5", "photo5.jpg", "A", self.base + timedelta(days=2), 100000, 1080, 1080),
            Image("i6", "photo6.jpg", "B", self.base + timedelta(days=6), 220000, 1920, 1080),
        ]
        random.shuffle(self.images)  # insertion order random → forces sorting logic
        self.gallery.add_images(self.images)

    def test_add_images(self):
        self.assertEqual(len(self.gallery.images), 6)

    def test_get_all_album_ids(self):
        albums = sorted(self.gallery.get_all_album_ids())
        self.assertEqual(albums, ["A", "B"])

    def test_get_album_image_count(self):
        self.assertEqual(self.gallery.get_album_image_count("A"), 3)
        self.assertEqual(self.gallery.get_album_image_count("B"), 2)
        self.assertEqual(self.gallery.get_album_image_count("X"), 0)

    def test_pagination_no_filter_ascending(self):
        res = self.gallery.get_paginated_images(page=1, page_size=3, sort_ascending=True)
        self.assertEqual(res["total_count"], 6)
        self.assertEqual(res["total_pages"], 2)
        self.assertEqual(len(res["images"]), 3)

        dates = [img["uploaded_at"] for img in res["images"]]
        self.assertTrue(dates[0] < dates[1] < dates[2])  # oldest first

    def test_pagination_no_filter_descending(self):
        res = self.gallery.get_paginated_images(page=1, page_size=4)
        self.assertEqual(len(res["images"]), 4)
        dates = [img["uploaded_at"] for img in res["images"]]
        self.assertTrue(dates[0] > dates[1] > dates[2] > dates[3])  # newest first

    def test_pagination_album_filter_ascending(self):
        res = self.gallery.get_paginated_images(
            page=1, page_size=10, album_id="A", sort_ascending=True
        )
        self.assertEqual(res["total_count"], 3)
        filenames = [img["filename"] for img in res["images"]]
        self.assertEqual(filenames, ["photo2.jpg", "photo5.jpg", "photo1.jpg"])  # day 1,2,3

    def test_page_beyond_end(self):
        res = self.gallery.get_paginated_images(page=5, page_size=3)
        self.assertEqual(len(res["images"]), 0)
        self.assertEqual(res["total_pages"], 2)

    def test_invalid_page(self):
        with self.assertRaises(ValueError):
            self.gallery.get_paginated_images(page=0)
        with self.assertRaises(ValueError):
            self.gallery.get_paginated_images(page=-3)


class TestImageGalleryPerformance(unittest.TestCase):
   

    def _create_large_gallery(self, count=8000):
        gallery = ImageGallery()
        images = generate_test_images(count, num_albums=12)
        start = time.perf_counter()
        gallery.add_images(images)
        add_time = time.perf_counter() - start
        self.assertLess(add_time, 8.0, "Adding images took too long (possible O(n²) insert)")
        return gallery, len(images)

    def test_deep_pagination_stays_fast(self):
        gallery, total = self._create_large_gallery(12000)

        times = {}
        for page in [1, 10, 100, 400, 600]:
            start = time.perf_counter()
            res = gallery.get_paginated_images(page=page, page_size=25)
            elapsed = (time.perf_counter() - start) * 1000  # ms
            times[page] = elapsed

            self.assertEqual(res["page"], page)
            self.assertEqual(res["page_size"], 25)
            if page * 25 <= total:
                self.assertEqual(len(res["images"]), 25)
            else:
                self.assertLessEqual(len(res["images"]), 25)

       
        ratio_deep = times[600] / (times[1] + 0.0001)
        self.assertLess(
            ratio_deep, 4.0,
            msg=f"Deep page too slow! Page 1: {times[1]:.1f}ms | Page 600: {times[600]:.1f}ms | ratio={ratio_deep:.2f}"
        )

    def test_album_filter_deep_pagination_fast(self):
        gallery, _ = self._create_large_gallery(10000)

        start = time.perf_counter()
        res1 = gallery.get_paginated_images(page=1, page_size=20, album_id="album_007")
        t1 = (time.perf_counter() - start) * 1000

        start = time.perf_counter()
        res_deep = gallery.get_paginated_images(page=80, page_size=20, album_id="album_007")
        t_deep = (time.perf_counter() - start) * 1000

        ratio = t_deep / (t1 + 0.0001)
        self.assertLess(
            ratio, 5.0,
            f"Album deep pagination slow! Page 1: {t1:.1f}ms | Deep: {t_deep:.1f}ms | ratio={ratio:.2f}"
        )

    def test_total_count_consistent(self):
        gallery, total = self._create_large_gallery(9500)
        res = gallery.get_paginated_images(page=1, page_size=1)
        self.assertEqual(res["total_count"], total)


if __name__ == '__main__':
    unittest.main(verbosity=2)