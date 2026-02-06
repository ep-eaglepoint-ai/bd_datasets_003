"""
Optimized User Activity Analyzer - Processes user activity logs and generates statistics.
"""

from typing import List, Dict, Tuple, Set
from collections import defaultdict, Counter
import heapq


class UserActivityAnalyzer:
    """Analyzes user activity logs and generates statistics with optimized performance."""
    
    def __init__(self):
        # Main storage
        self.activities = []
        
        # Indexes for faster lookups
        self.user_activities: Dict[int, List[Dict]] = defaultdict(list)
        self.activity_type_counts = Counter()
        self.user_activity_counts = Counter()
        self.user_activity_types: Dict[int, Set[str]] = defaultdict(set)
        self.activity_type_users: Dict[str, Set[int]] = defaultdict(set)
        self.user_activity_summaries_cache: Dict[int, Dict] = {}
        self.all_users_summary_cache = None
        
        # Flag to track if cache needs refresh
        self._cache_invalid = False
    
    def add_activity(self, user_id: int, activity_type: str, timestamp: int):
        """Add a single activity record with incremental updates to indexes."""
        activity = {
            'user_id': user_id,
            'activity_type': activity_type,
            'timestamp': timestamp
        }
        
        # Store activity
        self.activities.append(activity)
        
        # Update indexes incrementally
        self.user_activities[user_id].append(activity)
        self.activity_type_counts[activity_type] += 1
        self.user_activity_counts[user_id] += 1
        self.user_activity_types[user_id].add(activity_type)
        self.activity_type_users[activity_type].add(user_id)
        
        # Invalidate cache since data changed
        self._cache_invalid = True
        if user_id in self.user_activity_summaries_cache:
            del self.user_activity_summaries_cache[user_id]
    
    def add_activities_batch(self, activities: List[Dict]):
        """Add multiple activity records with optimized batch processing."""
        for activity in activities:
            self.add_activity(
                activity['user_id'],
                activity['activity_type'],
                activity['timestamp']
            )
    
    def get_user_activity_count(self, user_id: int) -> int:
        """Get total activity count for a specific user in O(1) time."""
        return self.user_activity_counts.get(user_id, 0)
    
    def get_activity_type_count(self, activity_type: str) -> int:
        """Get total count for a specific activity type in O(1) time."""
        return self.activity_type_counts.get(activity_type, 0)
    
    def get_user_activity_types(self, user_id: int) -> List[str]:
        """Get list of unique activity types for a user in O(1) time."""
        return list(self.user_activity_types.get(user_id, set()))
    
    def get_top_active_users(self, limit: int = 10) -> List[Tuple[int, int]]:
        """Get top N users by activity count using efficient heap operations."""
        if not self.user_activity_counts:
            return []
        
        # Use heap to get top N users efficiently (O(n log k) where k = limit)
        heap = []
        for user_id, count in self.user_activity_counts.items():
            if len(heap) < limit:
                heapq.heappush(heap, (count, -user_id))
            else:
                heapq.heappushpop(heap, (count, -user_id))
        
        # Convert heap to sorted result
        result = [(-user_id, count) for count, user_id in sorted(heap, reverse=True)]
        return result
    
    def get_activity_type_distribution(self) -> Dict[str, int]:
        """Get distribution of activity types in O(1) time."""
        return dict(self.activity_type_counts)
    
    def get_users_by_activity_type(self, activity_type: str) -> List[int]:
        """Get list of user IDs who performed a specific activity type in O(1) time."""
        users_set = self.activity_type_users.get(activity_type, set())
        return sorted(users_set)
    
    def get_user_activity_summary(self, user_id: int) -> Dict:
        """Get comprehensive summary for a specific user with caching."""
        # Return cached result if available
        if user_id in self.user_activity_summaries_cache:
            return self.user_activity_summaries_cache[user_id]
        
        # Compute summary efficiently using indexes
        user_activities = self.user_activities.get(user_id, [])
        if not user_activities:
            summary = {
                'user_id': user_id,
                'total_activities': 0,
                'activity_types': [],
                'activity_type_counts': {}
            }
        else:
            # Count activity types for this user
            activity_type_counts = Counter()
            for activity in user_activities:
                activity_type_counts[activity['activity_type']] += 1
            
            summary = {
                'user_id': user_id,
                'total_activities': self.user_activity_counts.get(user_id, 0),
                'activity_types': list(self.user_activity_types.get(user_id, set())),
                'activity_type_counts': dict(activity_type_counts)
            }
        
        # Cache the result
        self.user_activity_summaries_cache[user_id] = summary
        return summary
    
    def get_all_users_summary(self) -> Dict[int, Dict]:
        """Get summary for all users with caching."""
        # Return cached result if available and valid
        if self.all_users_summary_cache is not None and not self._cache_invalid:
            return self.all_users_summary_cache
        
        # Compute summaries for all users efficiently
        summaries = {}
        for user_id in self.user_activity_counts.keys():
            summaries[user_id] = self.get_user_activity_summary(user_id)
        
        # Cache the result
        self.all_users_summary_cache = summaries
        self._cache_invalid = False
        return summaries
    
    def clear(self):
        """Clear all activities and reset indexes."""
        self.activities = []
        self.user_activities.clear()
        self.activity_type_counts.clear()
        self.user_activity_counts.clear()
        self.user_activity_types.clear()
        self.activity_type_users.clear()
        self.user_activity_summaries_cache.clear()
        self.all_users_summary_cache = None
        self._cache_invalid = False