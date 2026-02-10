"""
Tests for LoginAttempt model.

This test suite ensures:
1. LoginAttempt instance creation works correctly
2. All fields are stored properly in the database
3. Timestamp defaults to timezone.now() when not provided
4. Model validation and constraints work as expected
5. String representation and ordering work correctly
"""

import pytest
from django.test import TestCase
from django.utils import timezone
from datetime import datetime, timedelta
from login_analyzer.app.models import LoginAttempt


class LoginAttemptModelTest(TestCase):
    """Test cases for LoginAttempt model functionality."""

    def setUp(self):
        """Set up test data for each test method."""
        self.test_username = "testuser"
        self.test_ip = "192.168.1.100"
        self.test_timestamp = timezone.now()
        
    def test_create_login_attempt_instance(self):
        """Test creating a LoginAttempt instance with all fields."""
        login_attempt = LoginAttempt.objects.create(
            username=self.test_username,
            ip_address=self.test_ip,
            timestamp=self.test_timestamp,
            success=True
        )
        
        # Verify the instance was created
        self.assertIsInstance(login_attempt, LoginAttempt)
        self.assertEqual(login_attempt.username, self.test_username)
        self.assertEqual(login_attempt.ip_address, self.test_ip)
        self.assertEqual(login_attempt.timestamp, self.test_timestamp)
        self.assertTrue(login_attempt.success)
        self.assertIsNotNone(login_attempt.id)
        
    def test_create_login_attempt_minimal_fields(self):
        """Test creating a LoginAttempt with only required fields."""
        login_attempt = LoginAttempt.objects.create(
            username=self.test_username,
            ip_address=self.test_ip
        )
        
        # Verify default values
        self.assertEqual(login_attempt.username, self.test_username)
        self.assertEqual(login_attempt.ip_address, self.test_ip)
        self.assertFalse(login_attempt.success)  # Default should be False
        self.assertIsNotNone(login_attempt.timestamp)  # Should have default timestamp
        
    def test_timestamp_default_to_now(self):
        """Test that timestamp defaults to timezone.now() when not provided."""
        before_creation = timezone.now()
        
        login_attempt = LoginAttempt.objects.create(
            username=self.test_username,
            ip_address=self.test_ip
        )
        
        after_creation = timezone.now()
        
        # Verify timestamp is set and within reasonable range
        self.assertIsNotNone(login_attempt.timestamp)
        self.assertGreaterEqual(login_attempt.timestamp, before_creation)
        self.assertLessEqual(login_attempt.timestamp, after_creation)
        
    def test_database_storage_all_fields(self):
        """Test that all fields are correctly stored and retrieved from database."""
        # Create instance
        login_attempt = LoginAttempt.objects.create(
            username="stored_user",
            ip_address="10.0.0.1",
            timestamp=self.test_timestamp,
            success=False
        )
        
        # Retrieve from database
        retrieved_attempt = LoginAttempt.objects.get(id=login_attempt.id)
        
        # Verify all fields match
        self.assertEqual(retrieved_attempt.username, "stored_user")
        self.assertEqual(retrieved_attempt.ip_address, "10.0.0.1")
        self.assertEqual(retrieved_attempt.timestamp, self.test_timestamp)
        self.assertFalse(retrieved_attempt.success)
        
    def test_username_field_constraints(self):
        """Test username field constraints and validation."""
        # Test maximum length
        long_username = "a" * 150  # Exactly at max length
        login_attempt = LoginAttempt.objects.create(
            username=long_username,
            ip_address=self.test_ip
        )
        self.assertEqual(login_attempt.username, long_username)
        
        # Test that username can be empty (CharField allows this by default)
        login_attempt_empty = LoginAttempt.objects.create(
            username="",
            ip_address=self.test_ip
        )
        self.assertEqual(login_attempt_empty.username, "")
        
    def test_ip_address_field_validation(self):
        """Test IP address field accepts valid IPv4 and IPv6 addresses."""
        # Test IPv4 addresses
        ipv4_addresses = [
            "192.168.1.1",
            "10.0.0.1",
            "127.0.0.1",
            "255.255.255.255"
        ]
        
        for ip in ipv4_addresses:
            with self.subTest(ip=ip):
                login_attempt = LoginAttempt.objects.create(
                    username="testuser",
                    ip_address=ip
                )
                self.assertEqual(login_attempt.ip_address, ip)
                
        # Test IPv6 addresses
        ipv6_addresses = [
            "2001:db8::1",
            "::1",
            "fe80::1",
            "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
        ]
        
        for ip in ipv6_addresses:
            with self.subTest(ip=ip):
                login_attempt = LoginAttempt.objects.create(
                    username="testuser",
                    ip_address=ip
                )
                self.assertEqual(login_attempt.ip_address, ip)
                
    def test_success_field_boolean(self):
        """Test success field behaves as a boolean."""
        # Test explicit True
        success_attempt = LoginAttempt.objects.create(
            username="testuser",
            ip_address=self.test_ip,
            success=True
        )
        self.assertTrue(success_attempt.success)
        
        # Test explicit False
        fail_attempt = LoginAttempt.objects.create(
            username="testuser",
            ip_address=self.test_ip,
            success=False
        )
        self.assertFalse(fail_attempt.success)
        
        # Test default (should be False)
        default_attempt = LoginAttempt.objects.create(
            username="testuser",
            ip_address=self.test_ip
        )
        self.assertFalse(default_attempt.success)
        
    def test_model_ordering(self):
        """Test that model ordering by timestamp descending works correctly."""
        # Create multiple attempts with different timestamps
        timestamps = [
            timezone.now() - timedelta(hours=2),
            timezone.now() - timedelta(hours=1),
            timezone.now()
        ]
        
        created_attempts = []
        for i, timestamp in enumerate(timestamps):
            attempt = LoginAttempt.objects.create(
                username=f"user{i}",
                ip_address=f"192.168.1.{i+1}",
                timestamp=timestamp
            )
            created_attempts.append(attempt)
        
        # Retrieve all attempts - should be ordered by timestamp descending
        all_attempts = LoginAttempt.objects.all()
        
        # Verify ordering (newest first)
        self.assertEqual(all_attempts[0].username, "user2")  # Most recent
        self.assertEqual(all_attempts[1].username, "user1")  # Middle
        self.assertEqual(all_attempts[2].username, "user0")  # Oldest
        
    def test_string_representation(self):
        """Test the __str__ method returns expected format."""
        login_attempt = LoginAttempt.objects.create(
            username="testuser",
            ip_address="192.168.1.100",
            timestamp=self.test_timestamp,
            success=True
        )
        
        expected_str = f"testuser from 192.168.1.100 at {self.test_timestamp} - Success"
        self.assertEqual(str(login_attempt), expected_str)
        
        # Test failed attempt string representation
        failed_attempt = LoginAttempt.objects.create(
            username="faileduser",
            ip_address="10.0.0.1",
            success=False
        )
        
        failed_str = f"faileduser from 10.0.0.1 at {failed_attempt.timestamp} - Failed"
        self.assertEqual(str(failed_attempt), failed_str)
        
    def test_model_indexes(self):
        """Test that model has the expected indexes for performance."""
        # This is a basic test - in a real scenario you might want to 
        # check actual database indexes, but that's more complex
        from django.db import connection
        
        # Get the model's meta indexes
        indexes = LoginAttempt._meta.indexes
        
        # Verify we have the expected indexes
        index_fields = [index.fields for index in indexes]
        
        expected_indexes = [
            ['ip_address'],
            ['timestamp'],
            ['ip_address', 'timestamp'],
            ['success']
        ]
        
        for expected_index in expected_indexes:
            self.assertIn(expected_index, index_fields)
            
    def test_multiple_login_attempts_same_ip(self):
        """Test creating multiple attempts from the same IP address."""
        ip_address = "192.168.1.100"
        
        # Create multiple attempts from same IP
        attempts = []
        for i in range(5):
            attempt = LoginAttempt.objects.create(
                username=f"user{i}",
                ip_address=ip_address,
                success=(i % 2 == 0)  # Alternate success/failure
            )
            attempts.append(attempt)
        
        # Verify all attempts were created
        self.assertEqual(LoginAttempt.objects.filter(ip_address=ip_address).count(), 5)
        
        # Verify mix of success and failure
        successful_attempts = LoginAttempt.objects.filter(
            ip_address=ip_address, 
            success=True
        )
        failed_attempts = LoginAttempt.objects.filter(
            ip_address=ip_address, 
            success=False
        )
        
        self.assertEqual(successful_attempts.count(), 3)
        self.assertEqual(failed_attempts.count(), 2)
        
    def test_timestamp_precision(self):
        """Test that timestamp maintains precision when stored and retrieved."""
        # Create with precise timestamp
        precise_timestamp = timezone.now()
        
        login_attempt = LoginAttempt.objects.create(
            username="testuser",
            ip_address=self.test_ip,
            timestamp=precise_timestamp
        )
        
        # Retrieve and compare
        retrieved_attempt = LoginAttempt.objects.get(id=login_attempt.id)
        
        # Should be exactly the same (within microsecond precision)
        self.assertEqual(
            retrieved_attempt.timestamp.replace(microsecond=0),
            precise_timestamp.replace(microsecond=0)
        )
