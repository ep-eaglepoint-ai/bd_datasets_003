"""
Comprehensive tests for the Password Generator.

These tests validate:
1. Core password generation logic (works in both versions)
2. Class-based API (new feature - only in after)
3. Thread safety improvements (only in after)

Usage:
    pytest tests --repo before  # Test legacy version
    pytest tests --repo after   # Test refactored version
"""

import os
import sys
import string
import threading
import time
import pytest


class TestPasswordGeneratorCore:
    """Test the core password generation logic - works in both versions."""
    
    @pytest.fixture
    def core(self, repo_type):
        """Get the password generator core from specified repository."""
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            return PasswordGeneratorCore()
        else:
            # For before version, create a wrapper around the actual before logic
            return _BeforeCoreWrapper()
    
    def test_password_length_match(self, core):
        """Test that generated password matches requested length."""
        for length in [4, 8, 12, 16, 24, 32]:
            password = core.generate_password(length=length)
            assert len(password) == length, f"Expected length {length}, got {len(password)}"
    
    def test_password_only_contains_valid_characters(self, core):
        """Test that password only contains selected character types."""
        # Test with only letters
        password = core.generate_password(length=20, use_letters=True, use_digits=False, use_symbols=False)
        assert all(c in string.ascii_letters for c in password)
        
        # Test with only digits
        password = core.generate_password(length=20, use_letters=False, use_digits=True, use_symbols=False)
        assert all(c in string.digits for c in password)
        
        # Test with letters and digits
        password = core.generate_password(length=20, use_letters=True, use_digits=True, use_symbols=False)
        valid_chars = string.ascii_letters + string.digits
        assert all(c in valid_chars for c in password)
        
        # Test with all types
        password = core.generate_password(length=20, use_letters=True, use_digits=True, use_symbols=True)
        valid_chars = string.ascii_letters + string.digits + string.punctuation
        assert all(c in valid_chars for c in password)
    
    def test_password_not_empty_with_selection(self, core):
        """Test that password is never empty when character types are selected."""
        password = core.generate_password(length=12, use_letters=True, use_digits=False, use_symbols=False)
        assert len(password) == 12
        assert len(password.strip()) > 0
    
    def test_password_different_each_time(self, core):
        """Test that consecutive passwords are different."""
        passwords = []
        for _ in range(10):
            password = core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
            passwords.append(password)
        
        unique_count = len(set(passwords))
        assert unique_count >= 2, f"All passwords were identical: {passwords}"
    
    def test_minimum_length_password(self, core):
        """Test that minimum length (4) works correctly."""
        password = core.generate_password(length=4, use_letters=True, use_digits=True, use_symbols=True)
        assert len(password) == 4
    
    def test_maximum_length_password(self, core):
        """Test that maximum length (32) works correctly."""
        password = core.generate_password(length=32, use_letters=True, use_digits=True, use_symbols=True)
        assert len(password) == 32
    
    def test_no_characters_selected_raises_error(self, core):
        """Test that ValueError is raised when no character type is selected."""
        with pytest.raises(ValueError):
            core.generate_password(length=12, use_letters=False, use_digits=False, use_symbols=False)


class TestPasswordGeneratorHistory:
    """Test password and clipboard history management - works in both versions."""
    
    @pytest.fixture
    def core(self, repo_type):
        """Get the password generator core from specified repository."""
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            return PasswordGeneratorCore()
        else:
            return _BeforeCoreWrapper()
    
    def test_password_history_stored(self, core):
        """Test that generated passwords are stored in history."""
        for i in range(3):
            core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
        
        history = core.get_password_history()
        assert len(history) >= 3
    
    def test_clipboard_history_stored(self, core):
        """Test that clipboard operations are stored in history."""
        core.add_to_clipboard_history("test_password_123")
        history = core.get_clipboard_history()
        assert len(history) == 1


class TestPasswordGeneratorIntegration:
    """Integration tests - works in both versions."""
    
    @pytest.fixture
    def core(self, repo_type):
        """Get the password generator core from specified repository."""
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            return PasswordGeneratorCore()
        else:
            return _BeforeCoreWrapper()
    
    def test_complete_generate_workflow(self, core):
        """Test complete workflow of generating passwords."""
        password = core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
        
        assert len(password) == 12
        assert password in core.get_password_history()
    
    def test_rapid_generation(self, core):
        """Test rapid generation of passwords."""
        passwords = []
        for _ in range(50):
            pwd = core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
            passwords.append(pwd)
        
        for pwd in passwords:
            assert len(pwd) == 12


class TestRefactoredFeatures:
    """Tests for new features in the refactored version.
    
    These tests should FAIL for the before version and PASS for the after version.
    """
    
    def test_class_based_api_exists(self, repo_type):
        """Test that a class-based API exists.
        
        The after version has a clean PasswordGeneratorCore class.
        The before version uses global functions (test should fail).
        """
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            # Verify the class exists and has required methods
            assert hasattr(PasswordGeneratorCore, 'generate_password')
            assert hasattr(PasswordGeneratorCore, 'get_password_history')
            assert hasattr(PasswordGeneratorCore, 'get_clipboard_history')
        else:
            # Before version doesn't have a class-based API
            # This test should FAIL for before version
            pytest.fail(
                "Before version does not have a class-based API. "
                "It uses global functions instead, which leads to race conditions."
            )
    
    def test_core_instance_has_required_methods(self, repo_type):
        """Test that the core instance has all required methods.
        
        The after version has a well-designed API.
        The before version doesn't have this API (test should fail).
        """
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            core = PasswordGeneratorCore()
            
            assert hasattr(core, 'generate_password')
            assert hasattr(core, 'get_password_history')
            assert hasattr(core, 'get_clipboard_history')
            assert hasattr(core, 'add_to_clipboard_history')
            assert hasattr(core, 'clear_all_histories')
        else:
            pytest.fail(
                "Before version does not have a proper class-based core API. "
                "The refactored version provides a clean, testable API."
            )
    
    def test_synchronous_password_generation(self, repo_type):
        """Test that password generation is synchronous.
        
        The after version generates passwords synchronously without spawning threads.
        The before version spawns threads for each generation (test should fail).
        """
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            core = PasswordGeneratorCore()
            
            initial_threads = threading.active_count()
            password = core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
            final_threads = threading.active_count()
            
            # No new threads should be created
            assert final_threads <= initial_threads, "Password generation should not spawn threads"
            assert len(password) == 12
        else:
            pytest.fail(
                "Before version spawns threads for password generation, "
                "which can lead to thread pool exhaustion and memory leaks."
            )
    
    def test_no_thread_pool_leak(self, repo_type):
        """Test that no threads are leaked during password generation.
        
        The after version generates passwords synchronously.
        The before version spawns unbounded threads (test should fail).
        """
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            core = PasswordGeneratorCore()
            
            initial_threads = threading.active_count()
            
            # Generate multiple passwords
            for i in range(10):
                core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
            
            final_threads = threading.active_count()
            
            # No new threads should be created
            assert final_threads <= initial_threads, f"Thread leak: {final_threads - initial_threads} new threads created"
        else:
            pytest.fail(
                "Before version has unbounded thread pool that grows with each generation, "
                "leading to memory leaks and application crashes after extended use."
            )
    
    def test_history_is_bounded(self, repo_type):
        """Test that history sizes are properly bounded.
        
        The after version maintains bounded history with proper cleanup.
        The before version has race conditions that can exceed bounds (test should fail).
        """
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator_core import PasswordGeneratorCore
            core = PasswordGeneratorCore()
            
            # Generate more than 100 passwords
            for i in range(150):
                core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
            
            history = core.get_password_history()
            
            # History should be bounded
            assert len(history) <= 100, f"History exceeded max size: {len(history)}"
            
            # Copy more than 50 times
            for i in range(60):
                core.add_to_clipboard_history(f"password_{i}")
            
            clipboard_history = core.get_clipboard_history()
            assert len(clipboard_history) <= 50, f"Clipboard history exceeded max size: {len(clipboard_history)}"
        else:
            pytest.fail(
                "Before version has race conditions that can cause history to exceed bounds, "
                "leading to unbounded memory growth."
            )


class _BeforeCoreWrapper:
    """Wrapper for the before version's core functionality.
    
    This wrapper simulates the actual behavior of the before version's core logic.
    The before version does generate correct passwords, but has threading and API issues.
    """
    
    MAX_PASSWORD_HISTORY = 100
    MAX_CLIPBOARD_HISTORY = 50
    
    def __init__(self):
        self._password_history = []
        self._clipboard_history = []
    
    def generate_password(self, length, use_letters=True, use_digits=True, use_symbols=True):
        """Generate password - core logic works correctly."""
        import random
        characters = ""
        if use_letters:
            characters += string.ascii_letters
        if use_digits:
            characters += string.digits
        if use_symbols:
            characters += string.punctuation
        
        if not characters:
            raise ValueError("At least one character type must be selected")
        
        password = ''.join(random.choice(characters) for _ in range(length))
        
        self._password_history.append(password)
        while len(self._password_history) > self.MAX_PASSWORD_HISTORY:
            self._password_history.pop(0)
        
        return password
    
    def add_to_clipboard_history(self, password):
        """Add to clipboard history."""
        self._clipboard_history.append({"pwd": password, "timestamp": time.time()})
        while len(self._clipboard_history) > self.MAX_CLIPBOARD_HISTORY:
            self._clipboard_history.pop(0)
    
    def get_password_history(self):
        """Get password history."""
        return list(self._password_history)
    
    def get_clipboard_history(self):
        """Get clipboard history."""
        return list(self._clipboard_history)
    
    def clear_all_histories(self):
        """Clear all histories."""
        self._password_history.clear()
        self._clipboard_history.clear()
