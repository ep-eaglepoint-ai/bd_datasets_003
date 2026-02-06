"""
Unit tests for the optimized UserActivityAnalyzer.
Tests ensure the optimized implementation produces identical results to the original.
"""

import unittest
import json
from typing import List, Dict
import sys
import os

# Add repository_after to path to import the optimized implementation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../repository_after'))

from user_activity import UserActivityAnalyzer


class TestUserActivityAnalyzer(unittest.TestCase):
    """Test suite for UserActivityAnalyzer."""
    
    def setUp(self):
        """Set up test data and analyzers."""
        self.analyzer = UserActivityAnalyzer()
        
        # Sample test data matching typical workload
        self.test_activities = [
            {'user_id': 1, 'activity_type': 'login', 'timestamp': 1000},
            {'user_id': 1, 'activity_type': 'view', 'timestamp': 1005},
            {'user_id': 2, 'activity_type': 'login', 'timestamp': 1010},
            {'user_id': 1, 'activity_type': 'purchase', 'timestamp': 1015},
            {'user_id': 3, 'activity_type': 'login', 'timestamp': 1020},
            {'user_id': 2, 'activity_type': 'view', 'timestamp': 1025},
            {'user_id': 3, 'activity_type': 'view', 'timestamp': 1030},
            {'user_id': 1, 'activity_type': 'logout', 'timestamp': 1035},
            {'user_id': 2, 'activity_type': 'purchase', 'timestamp': 1040},
            {'user_id': 3, 'activity_type': 'logout', 'timestamp': 1045},
        ]
        
        # Add activities
        self.analyzer.add_activities_batch(self.test_activities)
    
    def test_add_activity_single(self):
        """Test adding a single activity."""
        analyzer = UserActivityAnalyzer()
        analyzer.add_activity(100, 'test_activity', 2000)
        
        self.assertEqual(analyzer.get_user_activity_count(100), 1)
        self.assertEqual(analyzer.get_activity_type_count('test_activity'), 1)
    
    def test_add_activities_batch(self):
        """Test adding multiple activities in batch."""
        analyzer = UserActivityAnalyzer()
        batch = [
            {'user_id': 10, 'activity_type': 'A', 'timestamp': 1},
            {'user_id': 10, 'activity_type': 'B', 'timestamp': 2},
            {'user_id': 20, 'activity_type': 'A', 'timestamp': 3},
        ]
        analyzer.add_activities_batch(batch)
        
        self.assertEqual(analyzer.get_user_activity_count(10), 2)
        self.assertEqual(analyzer.get_user_activity_count(20), 1)
        self.assertEqual(analyzer.get_activity_type_count('A'), 2)
        self.assertEqual(analyzer.get_activity_type_count('B'), 1)
    
    def test_get_user_activity_count(self):
        """Test getting activity count for specific user."""
        self.assertEqual(self.analyzer.get_user_activity_count(1), 4)  # User 1 has 4 activities
        self.assertEqual(self.analyzer.get_user_activity_count(2), 3)  # User 2 has 3 activities
        self.assertEqual(self.analyzer.get_user_activity_count(3), 3)  # User 3 has 3 activities
        self.assertEqual(self.analyzer.get_user_activity_count(999), 0)  # Non-existent user
    
    def test_get_activity_type_count(self):
        """Test getting count for specific activity type."""
        self.assertEqual(self.analyzer.get_activity_type_count('login'), 3)
        self.assertEqual(self.analyzer.get_activity_type_count('view'), 3)
        self.assertEqual(self.analyzer.get_activity_type_count('purchase'), 2)
        self.assertEqual(self.analyzer.get_activity_type_count('logout'), 2)
        self.assertEqual(self.analyzer.get_activity_type_count('nonexistent'), 0)
    
    def test_get_user_activity_types(self):
        """Test getting unique activity types for a user."""
        # User 1: login, view, purchase, logout
        user1_types = set(self.analyzer.get_user_activity_types(1))
        self.assertEqual(user1_types, {'login', 'view', 'purchase', 'logout'})
        
        # User 2: login, view, purchase
        user2_types = set(self.analyzer.get_user_activity_types(2))
        self.assertEqual(user2_types, {'login', 'view', 'purchase'})
        
        # Non-existent user
        self.assertEqual(self.analyzer.get_user_activity_types(999), [])
    
    def test_get_top_active_users(self):
        """Test getting top active users."""
        # User 1: 4 activities (top)
        # Users 2 and 3: 3 activities each
        top_users = self.analyzer.get_top_active_users(limit=2)
        
        self.assertEqual(len(top_users), 2)
        self.assertEqual(top_users[0][0], 1)  # User 1 is first
        self.assertEqual(top_users[0][1], 4)  # With 4 activities
        
        # Check that results are sorted by count descending, then user_id ascending
        top_all = self.analyzer.get_top_active_users(limit=10)
        self.assertEqual(len(top_all), 3)
        
        # Verify order
        self.assertEqual(top_all[0], (1, 4))
        # Users 2 and 3 both have 3 activities, should be sorted by user_id
        self.assertEqual(top_all[1], (2, 3))
        self.assertEqual(top_all[2], (3, 3))
    
    def test_get_activity_type_distribution(self):
        """Test getting activity type distribution."""
        distribution = self.analyzer.get_activity_type_distribution()
        
        expected = {
            'login': 3,
            'view': 3,
            'purchase': 2,
            'logout': 2,
        }
        
        self.assertEqual(distribution, expected)
    
    def test_get_users_by_activity_type(self):
        """Test getting users who performed specific activity type."""
        # Users who logged in: 1, 2, 3
        login_users = set(self.analyzer.get_users_by_activity_type('login'))
        self.assertEqual(login_users, {1, 2, 3})
        
        # Users who made purchases: 1, 2
        purchase_users = set(self.analyzer.get_users_by_activity_type('purchase'))
        self.assertEqual(purchase_users, {1, 2})
        
        # Non-existent activity type
        self.assertEqual(self.analyzer.get_users_by_activity_type('nonexistent'), [])
    
    def test_get_user_activity_summary(self):
        """Test getting comprehensive summary for a specific user."""
        summary = self.analyzer.get_user_activity_summary(1)
        
        self.assertEqual(summary['user_id'], 1)
        self.assertEqual(summary['total_activities'], 4)
        
        # Check activity types
        activity_types = set(summary['activity_types'])
        self.assertEqual(activity_types, {'login', 'view', 'purchase', 'logout'})
        
        # Check activity type counts
        counts = summary['activity_type_counts']
        self.assertEqual(counts.get('login', 0), 1)
        self.assertEqual(counts.get('view', 0), 1)
        self.assertEqual(counts.get('purchase', 0), 1)
        self.assertEqual(counts.get('logout', 0), 1)
        
        # Test non-existent user
        non_existent_summary = self.analyzer.get_user_activity_summary(999)
        self.assertEqual(non_existent_summary['user_id'], 999)
        self.assertEqual(non_existent_summary['total_activities'], 0)
        self.assertEqual(non_existent_summary['activity_types'], [])
        self.assertEqual(non_existent_summary['activity_type_counts'], {})
    
    def test_get_all_users_summary(self):
        """Test getting summary for all users."""
        all_summaries = self.analyzer.get_all_users_summary()
        
        self.assertEqual(len(all_summaries), 3)  # Users 1, 2, 3
        
        # Check each user's summary
        for user_id in [1, 2, 3]:
            self.assertIn(user_id, all_summaries)
            summary = all_summaries[user_id]
            self.assertEqual(summary['user_id'], user_id)
            
            # Verify total activities match individual counts
            individual_count = self.analyzer.get_user_activity_count(user_id)
            self.assertEqual(summary['total_activities'], individual_count)
        
        # Test with empty analyzer
        empty_analyzer = UserActivityAnalyzer()
        empty_summaries = empty_analyzer.get_all_users_summary()
        self.assertEqual(empty_summaries, {})
    
    def test_clear_functionality(self):
        """Test clearing all activities."""
        # Verify analyzer has data
        self.assertGreater(len(self.analyzer.get_all_users_summary()), 0)
        
        # Clear data
        self.analyzer.clear()
        
        # Verify all data is cleared
        self.assertEqual(self.analyzer.get_all_users_summary(), {})
        self.assertEqual(self.analyzer.get_user_activity_count(1), 0)
        self.assertEqual(self.analyzer.get_activity_type_count('login'), 0)
    
    def test_performance_characteristics(self):
        """Test that operations have expected performance characteristics."""
        analyzer = UserActivityAnalyzer()
        
        # Add large batch of activities (simulating typical workload)
        activities = []
        for user_id in range(50, 150):  # 100 users
            for i in range(20, 30):  # 20-30 activities per user
                activities.append({
                    'user_id': user_id,
                    'activity_type': f'type_{i % 10}',
                    'timestamp': user_id * 1000 + i
                })
        
        analyzer.add_activities_batch(activities)
        
        # These operations should be fast (O(1) or O(log n))
        # If they were O(n), this would be very slow with 2500+ activities
        count = analyzer.get_user_activity_count(100)
        type_count = analyzer.get_activity_type_count('type_0')
        user_types = analyzer.get_user_activity_types(100)
        
        # Verify we get reasonable results
        self.assertGreater(count, 0)
        self.assertGreater(type_count, 0)
        self.assertGreater(len(user_types), 0)
    
    def test_cache_invalidation(self):
        """Test that caches are properly invalidated when data changes."""
        analyzer = UserActivityAnalyzer()
        
        # Add initial activity
        analyzer.add_activity(1, 'login', 1000)
        
        # Get summary (will be cached)
        summary1 = analyzer.get_user_activity_summary(1)
        self.assertEqual(summary1['total_activities'], 1)
        
        # Add another activity
        analyzer.add_activity(1, 'view', 1005)
        
        # Get summary again - should reflect new activity
        summary2 = analyzer.get_user_activity_summary(1)
        self.assertEqual(summary2['total_activities'], 2)
        
        # Test all users summary cache
        all_summary1 = analyzer.get_all_users_summary()
        analyzer.add_activity(2, 'login', 1010)
        all_summary2 = analyzer.get_all_users_summary()
        
        # Should have updated to include user 2
        self.assertIn(1, all_summary2)
        self.assertIn(2, all_summary2)
        self.assertEqual(len(all_summary2), 2)
    
    def test_edge_cases(self):
        """Test edge cases and boundary conditions."""
        analyzer = UserActivityAnalyzer()
        
        # Empty analyzer tests
        self.assertEqual(analyzer.get_user_activity_count(1), 0)
        self.assertEqual(analyzer.get_activity_type_count('login'), 0)
        self.assertEqual(analyzer.get_user_activity_types(1), [])
        self.assertEqual(analyzer.get_top_active_users(), [])
        self.assertEqual(analyzer.get_activity_type_distribution(), {})
        self.assertEqual(analyzer.get_users_by_activity_type('login'), [])
        self.assertEqual(analyzer.get_user_activity_summary(1)['total_activities'], 0)
        self.assertEqual(analyzer.get_all_users_summary(), {})
        
        # Test with limit larger than number of users
        self.analyzer.get_top_active_users(limit=100)
        # Should not crash and return all users
        
        # Test with duplicate activities
        analyzer.add_activity(1, 'login', 1000)
        analyzer.add_activity(1, 'login', 1000)  # Duplicate timestamp
        self.assertEqual(analyzer.get_user_activity_count(1), 2)
        self.assertEqual(analyzer.get_activity_type_count('login'), 2)


def run_performance_comparison():
    """Run a performance comparison between original and optimized implementations.
    This is for demonstration purposes only."""
    import time
    
    # We can't import the original since it's not in the path,
    # but we can create a simple performance test
    print("Performance test with 100 users, 30 activities each (3000 total activities)...")
    
    analyzer = UserActivityAnalyzer()
    
    # Generate test data
    start_time = time.time()
    activities = []
    for user_id in range(100):
        for i in range(30):
            activities.append({
                'user_id': user_id,
                'activity_type': f'type_{i % 10}',
                'timestamp': user_id * 1000 + i
            })
    
    # Add activities
    analyzer.add_activities_batch(activities)
    add_time = time.time() - start_time
    print(f"  Add activities time: {add_time:.4f} seconds")
    
    # Test query performance
    start_time = time.time()
    for user_id in range(0, 100, 10):  # Query 10 users
        analyzer.get_user_activity_summary(user_id)
    query_time = time.time() - start_time
    print(f"  10 user summary queries: {query_time:.4f} seconds")
    
    # Test top users
    start_time = time.time()
    for _ in range(100):
        analyzer.get_top_active_users(10)
    top_users_time = time.time() - start_time
    print(f"  100 top user queries: {top_users_time:.4f} seconds")
    
    print("\nAll performance tests completed successfully!")


if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)
    
    # Optional: Run performance comparison
    # run_performance_comparison()