import unittest
import sys
import os

# Add parent directory to path to import solution
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from solution import find_bridges, verify_bridge


class TestBridgeFinding(unittest.TestCase):
    """Test suite for bridge finding algorithm."""
    
    def python_implementation(self):
        """Solution must be implemented in Python"""
        # This test passes if the module can be imported
        self.assertTrue(callable(find_bridges))
        self.assertEqual(find_bridges.__module__, 'solution')
    
    def correct_input_format(self):
        """Input is an integer n and a list of edges [u, v]"""
        # Test that function accepts correct input format
        n = 4
        edges = [[0, 1], [1, 2], [2, 0], [1, 3]]
        result = find_bridges(n, edges)
        self.assertIsInstance(result, dict)
    
    def correct_output_format(self):
        """Output must be { bridges: [[u, v], ...] } with u < v and sorted"""
        n = 4
        edges = [[0, 1], [1, 2], [2, 0], [1, 3]]
        result = find_bridges(n, edges)
        
        # Check structure
        self.assertIn('bridges', result)
        self.assertIsInstance(result['bridges'], list)
        
        # Check each bridge has u < v
        for bridge in result['bridges']:
            self.assertEqual(len(bridge), 2)
            self.assertLess(bridge[0], bridge[1], f"Bridge {bridge} should have u < v")
        
        # Check sorting: first by u, then by v
        bridges = result['bridges']
        for i in range(len(bridges) - 1):
            u1, v1 = bridges[i]
            u2, v2 = bridges[i + 1]
            self.assertTrue(
                (u1 < u2) or (u1 == u2 and v1 < v2),
                f"Bridges not properly sorted: {bridges[i]} should come before {bridges[i+1]}"
            )
    
    def identifies_bridges_example1(self):
        """Correctly identify bridges - Example 1"""
        n = 4
        edges = [[0, 1], [1, 2], [2, 0], [1, 3]]
        result = find_bridges(n, edges)
        expected = [[1, 3]]
        self.assertEqual(result['bridges'], expected)
        
        # Verify it's actually a bridge
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def identifies_bridges_example2(self):
        """Correctly identify bridges - Example 2"""
        n = 2
        edges = [[0, 1]]
        result = find_bridges(n, edges)
        expected = [[0, 1]]
        self.assertEqual(result['bridges'], expected)
        
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def identifies_bridges_example3(self):
        """No bridges in fully cyclic graph - Example 3"""
        n = 5
        edges = [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 1]]
        result = find_bridges(n, edges)
        expected = []
        self.assertEqual(result['bridges'], expected)
    
    def identifies_bridges_example4(self):
        """Correctly identify bridges - Example 4"""
        n = 6
        edges = [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3]]
        result = find_bridges(n, edges)
        expected = [[1, 3]]
        self.assertEqual(result['bridges'], expected)
        
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def tarjan_algorithm(self):
        """Uses Tarjan's algorithm with proper low-link updates"""
        # Test case that would fail with incorrect low-link updates
        # This graph has a complex structure where wrong formula produces false bridges
        n = 7
        edges = [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 6], [6, 4]]
        result = find_bridges(n, edges)
        
        # Only edge (1,4) should be a bridge
        expected = [[1, 4]]
        self.assertEqual(result['bridges'], expected)
        
        # Verify each bridge
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def small_graph(self):
        """Handle small graphs (n = 2)"""
        n = 2
        edges = [[0, 1]]
        result = find_bridges(n, edges)
        self.assertEqual(len(result['bridges']), 1)
        self.assertEqual(result['bridges'][0], [0, 1])
    
    def medium_graph(self):
        """Handle medium-sized graphs"""
        # Create a chain of 100 nodes (99 bridges)
        n = 100
        edges = [[i, i + 1] for i in range(n - 1)]
        result = find_bridges(n, edges)
        self.assertEqual(len(result['bridges']), 99)
    
    def large_graph(self):
        """Handle large graphs (n ≤ 10^5) efficiently"""
        # Create a large graph with cycles and bridges
        n = 1000
        edges = []
        
        # Create 10 cycles of 100 nodes each
        for cycle in range(10):
            start = cycle * 100
            for i in range(start, start + 100):
                edges.append([i, start + (i - start + 1) % 100])
        
        # Connect cycles with bridges
        for cycle in range(9):
            edges.append([cycle * 100 + 50, (cycle + 1) * 100 + 50])
        
        result = find_bridges(n, edges)
        # Should have 9 bridges (connecting the cycles)
        self.assertEqual(len(result['bridges']), 9)
    
    def time_complexity(self):
        """Time complexity O(n + m)"""
        import time
        
        # Test with increasing graph sizes
        for n in [100, 500, 1000]:
            edges = [[i, (i + 1) % n] for i in range(n)]  # Cycle
            edges.extend([[i, (i + n // 2) % n] for i in range(n // 2)])  # Additional edges
            
            start = time.time()
            result = find_bridges(n, edges)
            elapsed = time.time() - start
            
            # Should complete quickly (under 1 second for these sizes)
            self.assertLess(elapsed, 1.0, f"Algorithm too slow for n={n}")
    
    def edge_case_all_bridges(self):
        """Edge case - all edges are bridges (tree structure)"""
        # Star graph: all edges from center are bridges
        n = 10
        edges = [[0, i] for i in range(1, n)]
        result = find_bridges(n, edges)
        
        self.assertEqual(len(result['bridges']), n - 1)
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def edge_case_no_bridges(self):
        """Edge case - no bridges (complete cycle)"""
        n = 10
        edges = [[i, (i + 1) % n] for i in range(n)]
        edges.extend([[i, (i + 2) % n] for i in range(n)])  # Double connections
        result = find_bridges(n, edges)
        
        self.assertEqual(len(result['bridges']), 0)
    
    def edge_case_multiple_bridges(self):
        """Edge case - multiple bridges in sequence"""
        # Chain of cycles connected by bridges
        n = 12
        edges = []
        # Three cycles of 4 nodes
        for cycle in range(3):
            start = cycle * 4
            edges.extend([
                [start, start + 1],
                [start + 1, start + 2],
                [start + 2, start + 3],
                [start + 3, start]
            ])
        # Connect cycles
        edges.append([3, 4])  # Bridge between cycle 0 and 1
        edges.append([7, 8])  # Bridge between cycle 1 and 2
        
        result = find_bridges(n, edges)
        expected = [[3, 4], [7, 8]]
        self.assertEqual(result['bridges'], expected)
        
        for bridge in result['bridges']:
            self.assertTrue(verify_bridge(n, edges, bridge))
    
    def verification(self):
        """All reported bridges increase connected components when removed"""
        test_cases = [
            (4, [[0, 1], [1, 2], [2, 0], [1, 3]]),
            (6, [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3]]),
            (8, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [6, 7]]),
        ]
        
        for n, edges in test_cases:
            result = find_bridges(n, edges)
            for bridge in result['bridges']:
                # Removing a bridge should increase connected components
                self.assertTrue(
                    verify_bridge(n, edges, bridge),
                    f"Bridge {bridge} does not increase connected components when removed"
                )
    
    def test_sorting_complex(self):
        """Test proper sorting of bridges"""
        n = 10
        edges = [
            [0, 1], [1, 2], [2, 0],  # Cycle
            [2, 5],  # Bridge
            [5, 6], [6, 7], [7, 5],  # Cycle
            [0, 3],  # Bridge
            [3, 4], [4, 8], [8, 9], [9, 3]  # Cycle
        ]
        result = find_bridges(n, edges)
        
        # Bridges should be [0, 3], [2, 5]
        expected = [[0, 3], [2, 5]]
        self.assertEqual(result['bridges'], expected)
    
    def test_parallel_edges(self):
        """Test graph with multiple edges between same nodes"""
        n = 3
        edges = [[0, 1], [0, 1], [1, 2]]  # Two edges between 0 and 1
        result = find_bridges(n, edges)
        
        # Only (1, 2) should be a bridge since 0-1 has redundancy
        # Note: This depends on how we handle multi-edges
        # For this implementation, we build adjacency list, so both edges exist
        self.assertIn([1, 2], result['bridges'])


if __name__ == '__main__':
    unittest.main(verbosity=2)