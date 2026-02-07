import os
import sys
import time
import threading
import unittest
from unittest.mock import patch

_repo = os.environ.get("REPO_PATH", "repository_after")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", _repo))
try:
    from snowflake import SnowflakeGenerator, ClockMovedBackwardsError, CUSTOM_EPOCH_MS
except ImportError:
    class ClockMovedBackwardsError(Exception):
        pass
    class SnowflakeGenerator:
        def __init__(self, machine_id=0):
            pass
        def next_id(self):
            raise NotImplementedError("No implementation in this repo path")
    CUSTOM_EPOCH_MS = 1704067200000


class TestBitLayout(unittest.TestCase):
    def test_64bit_output(self):
        gen = SnowflakeGenerator(machine_id=0)
        id = gen.next_id()
        self.assertIsInstance(id, int)
        self.assertGreaterEqual(id, 0)
        self.assertLessEqual(id, (1 << 64) - 1)

    def test_structure_verification_timestamp_and_machine_id(self):
        machine_id = 42
        gen = SnowflakeGenerator(machine_id=machine_id)
        before_ms = int(time.time() * 1000)
        id = gen.next_id()
        after_ms = int(time.time() * 1000)
        ts_bits = (id >> 22) & 0x1FFFFFFFFFF
        decoded_machine_id = (id >> 12) & 0x3FF
        expected_ts = (before_ms - CUSTOM_EPOCH_MS) & 0x1FFFFFFFFFF
        self.assertEqual(decoded_machine_id, machine_id)
        expected_ts_after = (after_ms - CUSTOM_EPOCH_MS) & 0x1FFFFFFFFFF
        self.assertGreaterEqual(ts_bits, expected_ts - 1)
        self.assertLessEqual(ts_bits, expected_ts_after + 1)


class TestThreadSafety(unittest.TestCase):
    def test_concurrency_100_threads_1000_ids_each_no_duplicates(self):
        gen = SnowflakeGenerator(machine_id=1)
        collected = []
        lock = threading.Lock()

        def run():
            ids = []
            for _ in range(1000):
                ids.append(gen.next_id())
            with lock:
                collected.extend(ids)

        threads = []
        for _ in range(100):
            t = threading.Thread(target=run)
            threads.append(t)
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(collected), 100000)
        self.assertEqual(len(set(collected)), 100000)


class TestClockRollback(unittest.TestCase):
    def test_rollback_raises_ClockMovedBackwardsError(self):
        gen = SnowflakeGenerator(machine_id=0)
        T = 1704067200.5
        with patch("time.time", return_value=T):
            gen.next_id()
        with patch("time.time", return_value=T - 1):
            with self.assertRaises(ClockMovedBackwardsError):
                gen.next_id()


class TestSequenceOverflow(unittest.TestCase):
    def test_4097_calls_last_id_has_timestamp_plus_one_ms(self):
        gen = SnowflakeGenerator(machine_id=0)
        T_sec = 1704067200.0
        T_ms = int(T_sec * 1000)
        time_returns = [T_sec] * 4097 + [T_sec + 0.001]
        with patch("time.time", side_effect=time_returns):
            ids = []
            for _ in range(4097):
                ids.append(gen.next_id())
        last_ts = (ids[-1] >> 22) & 0x1FFFFFFFFFF
        expected_ts_after_wait = (T_ms + 1 - CUSTOM_EPOCH_MS) & 0x1FFFFFFFFFF
        self.assertEqual(last_ts, expected_ts_after_wait)


class TestCustomEpoch(unittest.TestCase):
    def test_timestamp_uses_custom_epoch_not_unix(self):
        gen = SnowflakeGenerator(machine_id=0)
        id = gen.next_id()
        ts_bits = (id >> 22) & 0x1FFFFFFFFFF
        now_ms = int(time.time() * 1000)
        expected_ts = (now_ms - CUSTOM_EPOCH_MS) & 0x1FFFFFFFFFF
        self.assertEqual(ts_bits, expected_ts)


if __name__ == "__main__":
    unittest.main()
