"""
Brute-force detection service for analyzing login attempts.

This module provides functionality to detect potential brute-force attacks
by analyzing patterns of failed login attempts from IP addresses.
"""

from datetime import timedelta
from django.utils import timezone
from collections import defaultdict
from typing import List, Set
from .models import LoginAttempt


class BruteForceDetector:
    """
    Detects brute-force attacks by analyzing login attempt patterns.
    
    Rules:
    - Flag IP if it has >=5 failed attempts within 10 minutes
    - Only considers failed attempts (success=False)
    - Time window is sliding, not fixed
    """
    
    def __init__(self, failed_threshold: int = 5, time_window_minutes: int = 10):
        """
        Initialize detector with configurable thresholds.
        
        Args:
            failed_threshold: Number of failed attempts to trigger detection
            time_window_minutes: Time window in minutes to analyze
        """
        self.failed_threshold = failed_threshold
        self.time_window = timedelta(minutes=time_window_minutes)
    
    def detect_suspicious_ips(self, login_attempts: List[LoginAttempt]) -> Set[str]:
        """
        Analyze login attempts and return set of suspicious IP addresses.
        
        Args:
            login_attempts: List of LoginAttempt objects to analyze
            
        Returns:
            Set of IP addresses that meet the brute-force criteria
        """
        # Group failed attempts by IP address
        ip_attempts = defaultdict(list)
        
        for attempt in login_attempts:
            # Only consider failed attempts
            if not attempt.success:
                ip_attempts[attempt.ip_address].append(attempt)
        
        suspicious_ips = set()
        
        # Check each IP for brute-force patterns
        for ip_address, attempts in ip_attempts.items():
            if self._is_ip_suspicious(attempts):
                suspicious_ips.add(ip_address)
        
        return suspicious_ips
    
    def _is_ip_suspicious(self, attempts: List[LoginAttempt]) -> bool:
        """
        Check if a single IP's attempts indicate brute-force behavior.
        
        Args:
            attempts: List of failed LoginAttempt objects from same IP
            
        Returns:
            True if IP meets brute-force criteria, False otherwise
        """
        if len(attempts) < self.failed_threshold:
            return False
        
        # Sort attempts by timestamp (oldest first)
        attempts_sorted = sorted(attempts, key=lambda x: x.timestamp)
        
        # Use sliding window approach
        for i in range(len(attempts_sorted) - self.failed_threshold + 1):
            window_start = attempts_sorted[i].timestamp
            window_end = attempts_sorted[i + self.failed_threshold - 1].timestamp
            
            # Check if all attempts in window are within time threshold
            if window_end - window_start <= self.time_window:
                return True
        
        return False
    
    def get_suspicious_attempts(self, login_attempts: List[LoginAttempt]) -> List[LoginAttempt]:
        """
        Return all login attempts from suspicious IP addresses.
        
        Args:
            login_attempts: List of LoginAttempt objects to analyze
            
        Returns:
            List of LoginAttempt objects from suspicious IPs
        """
        suspicious_ips = self.detect_suspicious_ips(login_attempts)
        
        return [
            attempt for attempt in login_attempts
            if attempt.ip_address in suspicious_ips
        ]
    
    def get_detection_summary(self, login_attempts: List[LoginAttempt]) -> dict:
        """
        Get a summary of detection results.
        
        Args:
            login_attempts: List of LoginAttempt objects to analyze
            
        Returns:
            Dictionary containing detection statistics
        """
        suspicious_ips = self.detect_suspicious_ips(login_attempts)
        suspicious_attempts = self.get_suspicious_attempts(login_attempts)
        
        return {
            'total_attempts': len(login_attempts),
            'failed_attempts': len([a for a in login_attempts if not a.success]),
            'suspicious_ips': list(suspicious_ips),
            'suspicious_ip_count': len(suspicious_ips),
            'suspicious_attempts_count': len(suspicious_attempts),
            'threshold_used': self.failed_threshold,
            'time_window_minutes': self.time_window.total_seconds() / 60
        }


def detect_suspicious_ips(login_attempts: List[LoginAttempt]) -> Set[str]:
    """
    Convenience function for detecting suspicious IPs with default settings.
    
    Args:
        login_attempts: List of LoginAttempt objects to analyze
        
    Returns:
        Set of IP addresses that meet the brute-force criteria
    """
    detector = BruteForceDetector()
    return detector.detect_suspicious_ips(login_attempts)
