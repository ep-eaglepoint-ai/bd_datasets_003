import unittest
import sys
import os
import threading
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from backpressure_queue import BackpressureQueue

class TestBackpressure(unittest.TestCase):
    """
    Tests for backpressure-aware bounded queue.
    EXPECTED TO PASS against repository_after.
    """
    
    def test_producer_blocks_when_queue_full(self):
        """
        Test that producer blocks when queue is full.
        EXPECTED TO PASS: Put operation blocks until space available.
        """
        q = BackpressureQueue(maxsize=5)
        
        # Fill the queue
        for i in range(5):
            q.put(i)
        
        # Queue should be full
        self.assertTrue(q.full(), "Queue should be full")
        
        # Track if producer blocked
        blocked = {'value': False}
        put_completed = {'value': False}
        
        def producer():
            blocked['value'] = True
            q.put(999, timeout=2)  # This should block
            put_completed['value'] = True
        
        # Start producer thread
        t = threading.Thread(target=producer)
        t.start()
        
        # Give producer time to block
        time.sleep(0.5)
        
        # Producer should be blocked (not completed yet)
        self.assertTrue(blocked['value'], "Producer should have attempted put")
        self.assertFalse(put_completed['value'], "Producer should be blocked")
        
        # Consume one item to make space
        q.get()
        
        # Wait for producer to complete
        t.join(timeout=2)
        
        # Producer should have completed
        self.assertTrue(put_completed['value'], "Producer should complete after space available")
    
    def test_queue_size_never_exceeds_max(self):
        """
        Test that queue size never exceeds maximum size.
        EXPECTED TO PASS: Queue enforces size limit.
        """
        max_size = 10
        q = BackpressureQueue(maxsize=max_size)
        
        # Track maximum size observed
        max_observed = {'value': 0}
        
        def producer():
            for i in range(50):
                q.put(i)
                current_size = q.qsize()
                if current_size > max_observed['value']:
                    max_observed['value'] = current_size
                time.sleep(0.001)
        
        def consumer():
            for _ in range(50):
                time.sleep(0.002)  # Slower than producer
                q.get()
                current_size = q.qsize()
                if current_size > max_observed['value']:
                    max_observed['value'] = current_size
        
        # Start producer and consumer
        t_prod = threading.Thread(target=producer)
        t_cons = threading.Thread(target=consumer)
        
        t_prod.start()
        t_cons.start()
        
        t_prod.join()
        t_cons.join()
        
        # Maximum observed size should not exceed limit
        self.assertLessEqual(max_observed['value'], max_size,
            f"Queue size {max_observed['value']} exceeded max {max_size}")
        
        # Also check internal tracking
        self.assertLessEqual(q.get_max_observed_size(), max_size,
            f"Internal max size {q.get_max_observed_size()} exceeded max {max_size}")
    
    def test_prevents_unbounded_memory_growth(self):
        """
        Test that bounded queue prevents unbounded memory growth.
        EXPECTED TO PASS: Fast producer doesn't cause memory explosion.
        """
        q = BackpressureQueue(maxsize=100)
        
        items_produced = {'value': 0}
        items_consumed = {'value': 0}
        
        def fast_producer():
            for i in range(1000):
                q.put({'data': f'item_{i}' * 100})  # Larger items
                items_produced['value'] += 1
        
        def slow_consumer():
            while items_consumed['value'] < 1000:
                time.sleep(0.001)  # Slow consumer
                try:
                    q.get(timeout=1)
                    items_consumed['value'] += 1
                except:
                    break
        
        # Start threads
        t_prod = threading.Thread(target=fast_producer)
        t_cons = threading.Thread(target=slow_consumer)
        
        t_prod.start()
        t_cons.start()
        
        # Check queue size periodically
        max_size_seen = 0
        for _ in range(10):
            time.sleep(0.1)
            size = q.qsize()
            max_size_seen = max(max_size_seen, size)
        
        t_prod.join()
        t_cons.join()
        
        # Queue should never have grown beyond its limit
        self.assertLessEqual(max_size_seen, 100,
            f"Queue grew to {max_size_seen}, should stay <= 100")
    
    def test_backpressure_with_multiple_producers(self):
        """
        Test backpressure works with multiple producers.
        EXPECTED TO PASS: All producers respect queue limit.
        """
        q = BackpressureQueue(maxsize=20)
        
        items_produced = {'value': 0}
        
        def producer(producer_id):
            for i in range(50):
                q.put({'producer': producer_id, 'item': i})
                items_produced['value'] += 1
        
        def consumer():
            for _ in range(150):  # 3 producers * 50 items
                time.sleep(0.001)
                try:
                    q.get(timeout=5)
                except:
                    break
        
        # Start 3 producers and 1 consumer
        producers = [threading.Thread(target=producer, args=(i,)) for i in range(3)]
        consumer_thread = threading.Thread(target=consumer)
        
        for p in producers:
            p.start()
        consumer_thread.start()
        
        # Monitor queue size
        max_size = 0
        for _ in range(20):
            time.sleep(0.05)
            size = q.qsize()
            max_size = max(max_size, size)
        
        for p in producers:
            p.join()
        consumer_thread.join()
        
        # Queue should never exceed limit
        self.assertLessEqual(max_size, 20,
            f"Queue size {max_size} exceeded limit with multiple producers")
    
    def test_queue_operations(self):
        """
        Test basic queue operations work correctly.
        EXPECTED TO PASS: Put, get, empty, full work as expected.
        """
        q = BackpressureQueue(maxsize=3)
        
        # Initially empty
        self.assertTrue(q.empty())
        self.assertFalse(q.full())
        
        # Add items
        q.put(1)
        q.put(2)
        q.put(3)
        
        # Now full
        self.assertFalse(q.empty())
        self.assertTrue(q.full())
        self.assertEqual(q.qsize(), 3)
        
        # Get items
        self.assertEqual(q.get(), 1)
        self.assertEqual(q.get(), 2)
        
        # Not full anymore
        self.assertFalse(q.full())
        
        # Get last item
        self.assertEqual(q.get(), 3)
        
        # Empty again
        self.assertTrue(q.empty())


if __name__ == '__main__':
    unittest.main()
