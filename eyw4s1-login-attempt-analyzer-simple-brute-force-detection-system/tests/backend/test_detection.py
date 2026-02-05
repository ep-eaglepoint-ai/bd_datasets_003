"""
Tests for brute-force detection functionality.

This test suite ensures:
1. Detection works for threshold met (>=5 failed attempts in 10 minutes)
2. Detection ignores non-suspicious IPs
3. Multiple IPs detection works correctly
4. Edge cases and boundary conditions are handled properly
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from login_analyzer.app.models import LoginAttempt
from login_analyzer.app.detection import BruteForceDetector, detect_suspicious_ips


class TestBruteForceDetection:
    """Test cases for brute-force detection logic."""

    def setup_method(self):
        """Set up test data for each test method."""
        self.base_time = timezone.now()
        self.detector = BruteForceDetector(failed_threshold=5, time_window_minutes=10)
        
    def create_failed_attempt(self, ip_address: str, timestamp: timezone.datetime, username: str = "testuser") -> LoginAttempt:
        """Helper method to create a failed login attempt."""
        return LoginAttempt(
            username=username,
            ip_address=ip_address,
            timestamp=timestamp,
            success=False
        )
    
    def create_successful_attempt(self, ip_address: str, timestamp: timezone.datetime, username: str = "testuser") -> LoginAttempt:
        """Helper method to create a successful login attempt."""
        return LoginAttempt(
            username=username,
            ip_address=ip_address,
            timestamp=timestamp,
            success=True
        )
    
    def test_threshold_met_detection(self):
        """Test detection works when threshold is met (>=5 failed attempts in 10 minutes)."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts within 10 minutes
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should detect the IP as suspicious
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
    def test_threshold_not_met_detection(self):
        """Test detection ignores IPs that don't meet threshold."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create only 4 failed attempts (below threshold)
        for i in range(4):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should NOT detect the IP as suspicious
        assert len(suspicious_ips) == 0
        assert ip_address not in suspicious_ips
        
    def test_time_window_exceeded_detection(self):
        """Test detection ignores attempts spread beyond time window."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts but spread over 15 minutes (exceeds 10-minute window)
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i * 4)  # 0, 4, 8, 12, 16 minutes
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should NOT detect as suspicious because attempts exceed time window
        assert len(suspicious_ips) == 0
        assert ip_address not in suspicious_ips
        
    def test_successful_attempts_ignored(self):
        """Test that successful attempts are ignored in detection."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts within 10 minutes (should trigger detection)
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Add some successful attempts (should be ignored)
        for i in range(3):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_successful_attempt(ip_address, timestamp, f"success_user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should still detect the IP as suspicious based on failed attempts only
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
    def test_non_suspicious_ip_exclusion(self):
        """Test detection ignores non-suspicious IPs."""
        suspicious_ip = "192.168.1.100"
        normal_ip = "192.168.1.200"
        attempts = []
        
        # Create suspicious activity for first IP
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(suspicious_ip, timestamp, f"suspicious_user{i}")
            attempts.append(attempt)
        
        # Create normal activity for second IP (below threshold)
        for i in range(2):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(normal_ip, timestamp, f"normal_user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should only detect the suspicious IP
        assert len(suspicious_ips) == 1
        assert suspicious_ip in suspicious_ips
        assert normal_ip not in suspicious_ips
        
    def test_multiple_ips_detection(self):
        """Test detection works for multiple suspicious IPs."""
        suspicious_ip1 = "192.168.1.100"
        suspicious_ip2 = "192.168.1.200"
        normal_ip = "192.168.1.300"
        attempts = []
        
        # Create suspicious activity for first IP
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(suspicious_ip1, timestamp, f"user1_{i}")
            attempts.append(attempt)
        
        # Create suspicious activity for second IP
        for i in range(6):  # Even more attempts
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(suspicious_ip2, timestamp, f"user2_{i}")
            attempts.append(attempt)
        
        # Create normal activity for third IP
        for i in range(2):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(normal_ip, timestamp, f"normal_user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should detect both suspicious IPs but not the normal one
        assert len(suspicious_ips) == 2
        assert suspicious_ip1 in suspicious_ips
        assert suspicious_ip2 in suspicious_ips
        assert normal_ip not in suspicious_ips
        
    def test_edge_case_exact_threshold(self):
        """Test detection with exactly 5 failed attempts in exactly 10 minutes."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts exactly 10 minutes apart (first to last)
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i * 2.5)  # 0, 2.5, 5, 7.5, 10 minutes
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should detect as suspicious (exactly at threshold)
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
    def test_edge_case_just_over_threshold(self):
        """Test detection with attempts just over 10 minutes."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts with first-to-last just over 10 minutes
        timestamps = [
            self.base_time,
            self.base_time + timedelta(minutes=2),
            self.base_time + timedelta(minutes=4),
            self.base_time + timedelta(minutes=6),
            self.base_time + timedelta(minutes=10, seconds=1)  # Just over 10 minutes
        ]
        
        for i, timestamp in enumerate(timestamps):
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should NOT detect as suspicious (over time window)
        assert len(suspicious_ips) == 0
        assert ip_address not in suspicious_ips
        
    def test_sliding_window_detection(self):
        """Test that sliding window detection works correctly."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 7 failed attempts spread over time
        # First 5 are within 10 minutes, last 2 extend beyond
        for i in range(7):
            timestamp = self.base_time + timedelta(minutes=i * 2)  # 0, 2, 4, 6, 8, 10, 12
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should detect as suspicious because there's a window (attempts 0-4) that meets criteria
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
    def test_empty_attempts_list(self):
        """Test detection with empty attempts list."""
        suspicious_ips = self.detector.detect_suspicious_ips([])
        
        # Should return empty set
        assert len(suspicious_ips) == 0
        assert isinstance(suspicious_ips, set)
        
    def test_all_successful_attempts(self):
        """Test detection with only successful attempts."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create only successful attempts
        for i in range(10):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_successful_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test detection
        suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        
        # Should return empty set (no failed attempts)
        assert len(suspicious_ips) == 0
        
    def test_convenience_function(self):
        """Test the convenience function works with default settings."""
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 5 failed attempts within 10 minutes
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test convenience function
        suspicious_ips = detect_suspicious_ips(attempts)
        
        # Should detect the IP as suspicious
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
    def test_custom_thresholds(self):
        """Test detector with custom thresholds."""
        # Create detector with lower threshold
        custom_detector = BruteForceDetector(failed_threshold=3, time_window_minutes=5)
        
        ip_address = "192.168.1.100"
        attempts = []
        
        # Create 3 failed attempts within 5 minutes
        for i in range(3):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(ip_address, timestamp, f"user{i}")
            attempts.append(attempt)
        
        # Test with custom detector
        suspicious_ips = custom_detector.detect_suspicious_ips(attempts)
        
        # Should detect with custom threshold
        assert len(suspicious_ips) == 1
        assert ip_address in suspicious_ips
        
        # Test with default detector (should not detect)
        default_suspicious_ips = self.detector.detect_suspicious_ips(attempts)
        assert len(default_suspicious_ips) == 0
        
    def test_get_suspicious_attempts(self):
        """Test getting all attempts from suspicious IPs."""
        suspicious_ip = "192.168.1.100"
        normal_ip = "192.168.1.200"
        attempts = []
        
        # Create suspicious activity
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            failed_attempt = self.create_failed_attempt(suspicious_ip, timestamp, f"suspicious_user{i}")
            attempts.append(failed_attempt)
            
            # Add some successful attempts from same IP
            success_attempt = self.create_successful_attempt(suspicious_ip, timestamp, f"success_user{i}")
            attempts.append(success_attempt)
        
        # Create normal activity
        for i in range(2):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(normal_ip, timestamp, f"normal_user{i}")
            attempts.append(attempt)
        
        # Test getting suspicious attempts
        suspicious_attempts = self.detector.get_suspicious_attempts(attempts)
        
        # Should return all attempts from suspicious IP (both failed and successful)
        assert len(suspicious_attempts) == 10  # 5 failed + 5 successful from suspicious IP
        
        # Verify all returned attempts are from suspicious IP
        for attempt in suspicious_attempts:
            assert attempt.ip_address == suspicious_ip
            
    def test_get_detection_summary(self):
        """Test detection summary functionality."""
        suspicious_ip = "192.168.1.100"
        normal_ip = "192.168.1.200"
        attempts = []
        
        # Create suspicious activity (5 failed)
        for i in range(5):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(suspicious_ip, timestamp, f"suspicious_user{i}")
            attempts.append(attempt)
        
        # Create normal activity (2 failed, 3 successful)
        for i in range(2):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_failed_attempt(normal_ip, timestamp, f"normal_user{i}")
            attempts.append(attempt)
            
        for i in range(3):
            timestamp = self.base_time + timedelta(minutes=i)
            attempt = self.create_successful_attempt(normal_ip, timestamp, f"success_user{i}")
            attempts.append(attempt)
        
        # Test summary
        summary = self.detector.get_detection_summary(attempts)
        
        # Verify summary contents
        assert summary['total_attempts'] == 10
        assert summary['failed_attempts'] == 7
        assert summary['suspicious_ip_count'] == 1
        assert summary['suspicious_attempts_count'] == 5
        assert suspicious_ip in summary['suspicious_ips']
        assert normal_ip not in summary['suspicious_ips']
        assert summary['threshold_used'] == 5
        assert summary['time_window_minutes'] == 10
