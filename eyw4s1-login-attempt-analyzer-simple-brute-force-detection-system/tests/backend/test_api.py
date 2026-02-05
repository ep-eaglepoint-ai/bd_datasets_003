"""
Tests for Django REST API endpoints - Minimal implementation per prompt requirements.

This test suite ensures:
1. GET /api/login_attempts/ returns recent login attempts
2. GET /api/suspicious/ returns flagged suspicious IPs
3. Empty list handling works properly
4. Architectural constraints are maintained
"""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from login_analyzer.app.models import LoginAttempt


class LoginAttemptAPITest(APITestCase):
    """Test cases for Login Attempt API endpoints - minimal per prompt."""

    def setUp(self):
        """Set up test data for each test method."""
        self.base_time = timezone.now()
        
        # Create test login attempts
        self.create_test_data()
        
    def create_test_data(self):
        """Create a comprehensive set of test login attempts."""
        # Normal activity
        for i in range(3):
            LoginAttempt.objects.create(
                username=f"normal_user{i}",
                ip_address="192.168.1.100",
                timestamp=self.base_time + timedelta(minutes=i),
                success=True
            )
        
        # Suspicious activity: 5 failed attempts within 10 minutes from same IP
        self.suspicious_ip = "192.168.1.200"
        for i in range(5):
            LoginAttempt.objects.create(
                username=f"attacker{i}",
                ip_address=self.suspicious_ip,
                timestamp=self.base_time + timedelta(minutes=i * 2),
                success=False
            )
        
        # Another suspicious IP with more attempts
        self.suspicious_ip2 = "192.168.1.300"
        for i in range(7):
            LoginAttempt.objects.create(
                username=f"hacker{i}",
                ip_address=self.suspicious_ip2,
                timestamp=self.base_time + timedelta(minutes=i),
                success=False
            )

    def test_login_attempts_get_returns_recent_data(self):
        """Test GET /api/login_attempts/ returns recent login attempts."""
        url = reverse('app:login-attempt-list')
        response = self.client.get(url)
        
        # Check response status
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check response is a list (no pagination)
        self.assertIsInstance(response.data, list)
        
        # Check data content - should return attempts from last 24 hours
        self.assertGreater(len(response.data), 0)
        
        # Check field presence in each result
        for result in response.data:
            self.assertIn('id', result)
            self.assertIn('username', result)
            self.assertIn('ip_address', result)
            self.assertIn('timestamp', result)
            self.assertIn('success', result)
        
        # Check ordering (should be newest first)
        timestamps = [result['timestamp'] for result in response.data]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

    def test_suspicious_ips_flagged_correctly(self):
        """Test GET /api/suspicious/ flags suspicious IPs correctly."""
        url = reverse('app:suspicious-activity')
        response = self.client.get(url)
        
        # Check response status
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check response structure - minimal per prompt
        self.assertIn('suspicious_ips', response.data)
        self.assertIn('total_suspicious_ips', response.data)
        
        # Should detect both suspicious IPs
        suspicious_ips = response.data['suspicious_ips']
        self.assertEqual(len(suspicious_ips), 2)
        self.assertEqual(response.data['total_suspicious_ips'], 2)
        
        # Check that our test suspicious IPs are in the results
        self.assertIn(self.suspicious_ip, suspicious_ips)
        self.assertIn(self.suspicious_ip2, suspicious_ips)
        
        # Verify they are strings (IP addresses)
        for ip in suspicious_ips:
            self.assertIsInstance(ip, str)

    def test_suspicious_ips_empty_list_when_no_suspicious_activity(self):
        """Test empty list returned when no suspicious activity."""
        # Delete all login attempts
        LoginAttempt.objects.all().delete()
        
        # Create only normal activity (below threshold)
        for i in range(2):
            LoginAttempt.objects.create(
                username=f"safe_user{i}",
                ip_address="10.0.0.1",
                timestamp=timezone.now() + timedelta(minutes=i),
                success=False
            )
        
        url = reverse('app:suspicious-activity')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should return empty suspicious IPs list
        self.assertEqual(response.data['suspicious_ips'], [])
        self.assertEqual(response.data['total_suspicious_ips'], 0)

    def test_architectural_constraints_api_handles_db(self):
        """Test that API layer handles database interactions correctly."""
        url = reverse('app:suspicious-activity')
        
        # Create some test data
        test_ip = "10.0.0.100"
        for i in range(5):
            LoginAttempt.objects.create(
                username=f"test_user{i}",
                ip_address=test_ip,
                timestamp=timezone.now() + timedelta(minutes=i),
                success=False
            )
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # The API should have fetched from DB and detected the suspicious IP
        detected_ips = response.data['suspicious_ips']
        self.assertIn(test_ip, detected_ips)

    def test_architectural_constraints_no_persisted_state(self):
        """Test that suspicious state is computed on-the-fly, not persisted."""
        url = reverse('app:suspicious-activity')
        
        # Get initial suspicious count
        response1 = self.client.get(url)
        initial_count = response1.data['total_suspicious_ips']
        
        # Add new suspicious activity
        new_ip = "10.0.0.200"
        for i in range(5):
            LoginAttempt.objects.create(
                username=f"new_attacker{i}",
                ip_address=new_ip,
                timestamp=timezone.now() + timedelta(minutes=i),
                success=False
            )
        
        # Get updated suspicious count
        response2 = self.client.get(url)
        updated_count = response2.data['total_suspicious_ips']
        
        # Count should increase (computed on-the-fly)
        self.assertEqual(updated_count, initial_count + 1)
        
        # Verify the new IP is in the results
        self.assertIn(new_ip, response2.data['suspicious_ips'])

    def test_empty_database_handling(self):
        """Test API behavior with empty database."""
        # Delete all data
        LoginAttempt.objects.all().delete()
        
        # Test login attempts endpoint
        url = reverse('app:login-attempt-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])  # Empty list
        
        # Test suspicious endpoint
        url = reverse('app:suspicious-activity')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['suspicious_ips'], [])
        self.assertEqual(response.data['total_suspicious_ips'], 0)

    def test_login_attempts_time_window(self):
        """Test that login attempts endpoint respects 24-hour window."""
        url = reverse('app:login-attempt-list')
        
        # Create old attempt (more than 24 hours ago)
        old_time = timezone.now() - timedelta(hours=25)
        LoginAttempt.objects.create(
            username="old_user",
            ip_address="10.0.0.1",
            timestamp=old_time,
            success=False
        )
        
        response = self.client.get(url)
        
        # Should not include the old attempt
        usernames = [attempt['username'] for attempt in response.data]
        self.assertNotIn("old_user", usernames)
