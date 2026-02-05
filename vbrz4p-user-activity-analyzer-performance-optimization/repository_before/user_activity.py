"""
User Activity Analyzer - Processes user activity logs and generates statistics.
"""

from typing import List, Dict, Tuple
from collections import defaultdict


class UserActivityAnalyzer:
    """Analyzes user activity logs and generates statistics."""
    
    def __init__(self):
        self.activities = []
    
    def add_activity(self, user_id: int, activity_type: str, timestamp: int):
        """Add a single activity record."""
        self.activities.append({
            'user_id': user_id,
            'activity_type': activity_type,
            'timestamp': timestamp
        })
    
    def add_activities_batch(self, activities: List[Dict]):
        """Add multiple activity records."""
        for activity in activities:
            self.add_activity(
                activity['user_id'],
                activity['activity_type'],
                activity['timestamp']
            )
    
    def get_user_activity_count(self, user_id: int) -> int:
        """Get total activity count for a specific user."""
        count = 0
        for activity in self.activities:
            if activity['user_id'] == user_id:
                count += 1
        return count
    
    def get_activity_type_count(self, activity_type: str) -> int:
        """Get total count for a specific activity type."""
        count = 0
        for activity in self.activities:
            if activity['activity_type'] == activity_type:
                count += 1
        return count
    
    def get_user_activity_types(self, user_id: int) -> List[str]:
        """Get list of unique activity types for a user."""
        types = []
        for activity in self.activities:
            if activity['user_id'] == user_id:
                if activity['activity_type'] not in types:
                    types.append(activity['activity_type'])
        return types
    
    def get_top_active_users(self, limit: int = 10) -> List[Tuple[int, int]]:
        """Get top N users by activity count."""
        user_counts = {}
        for activity in self.activities:
            user_id = activity['user_id']
            if user_id not in user_counts:
                user_counts[user_id] = 0
            user_counts[user_id] += 1
        
        # Sort by count descending, then by user_id ascending
        sorted_users = sorted(
            user_counts.items(),
            key=lambda x: (-x[1], x[0])
        )
        return sorted_users[:limit]
    
    def get_activity_type_distribution(self) -> Dict[str, int]:
        """Get distribution of activity types."""
        distribution = {}
        for activity in self.activities:
            activity_type = activity['activity_type']
            if activity_type not in distribution:
                distribution[activity_type] = 0
            distribution[activity_type] += 1
        return distribution
    
    def get_users_by_activity_type(self, activity_type: str) -> List[int]:
        """Get list of user IDs who performed a specific activity type."""
        user_ids = []
        for activity in self.activities:
            if activity['activity_type'] == activity_type:
                if activity['user_id'] not in user_ids:
                    user_ids.append(activity['user_id'])
        return user_ids
    
    def get_user_activity_summary(self, user_id: int) -> Dict:
        """Get comprehensive summary for a specific user."""
        summary = {
            'user_id': user_id,
            'total_activities': 0,
            'activity_types': [],
            'activity_type_counts': {}
        }
        
        for activity in self.activities:
            if activity['user_id'] == user_id:
                summary['total_activities'] += 1
                activity_type = activity['activity_type']
                if activity_type not in summary['activity_types']:
                    summary['activity_types'].append(activity_type)
                if activity_type not in summary['activity_type_counts']:
                    summary['activity_type_counts'][activity_type] = 0
                summary['activity_type_counts'][activity_type] += 1
        
        return summary
    
    def get_all_users_summary(self) -> Dict[int, Dict]:
        """Get summary for all users."""
        summaries = {}
        user_ids = []
        
        # Collect all unique user IDs
        for activity in self.activities:
            if activity['user_id'] not in user_ids:
                user_ids.append(activity['user_id'])
        
        # Generate summary for each user
        for user_id in user_ids:
            summaries[user_id] = self.get_user_activity_summary(user_id)
        
        return summaries
    
    def clear(self):
        """Clear all activities."""
        self.activities = []