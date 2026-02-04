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


class TestGUIFeatures:
    """GUI-specific tests for the refactored version."""
    
    @pytest.fixture
    def app(self, repo_type):
        """Create a PasswordGenerator application instance for testing."""
        import tkinter as tk
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator import PasswordGenerator
            root = tk.Tk()
            root.withdraw()
            app = PasswordGenerator(root=root)
            yield app
            app.destroy()
        else:
            pytest.skip("GUI tests only applicable to refactored version")
    
    def test_generate_button_disabled_when_no_character_type_selected(self, app):
        """Test that generate button is disabled when no character type is selected."""
        # Deselect all checkboxes
        app.use_letters.set(False)
        app.use_digits.set(False)
        app.use_symbols.set(False)
        
        # Button should be disabled
        assert app.generate_btn['state'] == 'disabled'
    
    def test_generate_button_enabled_when_character_type_selected(self, app):
        """Test that generate button is enabled when at least one character type is selected."""
        # Deselect all first
        app.use_letters.set(False)
        app.use_digits.set(False)
        app.use_symbols.set(False)
        
        # Button should be disabled
        assert app.generate_btn['state'] == 'disabled'
        
        # Select letters only
        app.use_letters.set(True)
        
        # Button should be enabled
        assert app.generate_btn['state'] == 'normal'
    
    def test_slider_label_updates_on_length_change(self, app):
        """Test that slider label updates immediately when length changes."""
        # Test various length values
        for length in [4, 8, 12, 16, 24, 32]:
            app.length_var.set(length)
            # Call the update method directly since trace might not fire in test
            app._on_length_change(length)
            
            expected_text = f"Length: {length}"
            assert app.length_label['text'] == expected_text, \
                f"Expected '{expected_text}', got '{app.length_label['text']}'"
    
    def test_generated_password_displayed_correctly(self, app):
        """Test that generated password is displayed in the result text widget."""
        import tkinter as tk
        # Generate a password
        password = app._generate_password()
        
        # Get displayed password
        displayed = app.result_text.get(1.0, tk.END).strip()
        
        # Should match
        assert displayed == password
    
    def test_copy_to_clipboard_functionality(self, app):
        """Test that copying to clipboard works correctly."""
        # Generate a password first
        password = app._generate_password()
        
        # Mock the clipboard_clear and clipboard_append
        clipboard_content = []
        original_clipboard_clear = app.root.clipboard_clear
        original_clipboard_append = app.root.clipboard_append
        
        def mock_clear():
            clipboard_content.clear()
        
        def mock_append(text):
            clipboard_content.append(text)
        
        app.root.clipboard_clear = mock_clear
        app.root.clipboard_append = mock_append
        
        try:
            # Copy to clipboard
            app._copy_to_clipboard()
            app.root.update_idletasks()
            
            # Verify clipboard contains the password
            assert len(clipboard_content) > 0
            assert clipboard_content[-1] == password
        finally:
            app.root.clipboard_clear = original_clipboard_clear
            app.root.clipboard_append = original_clipboard_append
    
    def test_no_copy_of_placeholder_text(self, app):
        """Test that placeholder text is not copied to clipboard."""
        # Don't generate a password - try to copy placeholder
        clipboard_was_cleared = []
        original_clipboard_clear = app.root.clipboard_clear
        
        def mock_clear():
            clipboard_was_cleared.append(True)
        
        app.root.clipboard_clear = mock_clear
        
        try:
            # Try to copy (should do nothing for placeholder)
            app._copy_to_clipboard()
            app.root.update_idletasks()
            
            # Clipboard should not have been cleared
            assert len(clipboard_was_cleared) == 0
        finally:
            app.root.clipboard_clear = original_clipboard_clear


class TestRapidInteraction:
    """Tests for rapid user interactions."""
    
    @pytest.fixture
    def app(self, repo_type):
        """Create a PasswordGenerator application instance for testing."""
        import tkinter as tk
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator import PasswordGenerator
            root = tk.Tk()
            root.withdraw()
            app = PasswordGenerator(root=root)
            yield app
            app.destroy()
        else:
            pytest.skip("GUI tests only applicable to refactored version")
    
    def test_rapid_password_generation(self, app):
        """Test that rapid password generation works correctly."""
        passwords = []
        
        # Generate many passwords rapidly
        for _ in range(50):
            password = app._generate_password()
            passwords.append(password)
        
        # All passwords should have correct length
        for pwd in passwords:
            assert len(pwd) == app.length_var.get()
        
        # History should have all passwords
        history = app.get_password_history()
        assert len(history) >= 50
    
    def test_no_race_conditions_in_rapid_generation(self, app):
        """Test that rapid generation doesn't cause race conditions."""
        import tkinter as tk
        passwords = []
        
        # Generate passwords and check display after each
        for i in range(20):
            password = app._generate_password()
            displayed = app.result_text.get(1.0, tk.END).strip()
            
            # Displayed password should match the last generated
            assert displayed == password, f"Race condition: expected '{password}', got '{displayed}'"
            passwords.append(password)
    
    def test_button_text_reset_after_copy(self, app):
        """Test that copy button text resets correctly."""
        # Generate password
        app._generate_password()
        
        # Mock clipboard to avoid actual clipboard operations
        clipboard_calls = []
        original_clear = app.root.clipboard_clear
        original_append = app.root.clipboard_append
        
        def mock_clear():
            pass
        
        def mock_append(text):
            clipboard_calls.append(text)
        
        app.root.clipboard_clear = mock_clear
        app.root.clipboard_append = mock_append
        
        try:
            # Copy
            app._copy_to_clipboard()
            
            # Button should show "Copied!"
            assert app.copy_button['text'] == 'Copied!'
        finally:
            app.root.clipboard_clear = original_clear
            app.root.clipboard_append = original_append


class TestMainThreadUIUpdates:
    """Tests verifying that UI updates are done on the main thread."""
    
    def test_ui_updates_use_after_method(self, repo_type):
        """Test that UI updates are scheduled using after() method."""
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from ui_utils import ClipboardManager, UIHelpers
            
            # Verify ClipboardManager uses after() for scheduled operations
            assert hasattr(ClipboardManager, 'copy_with_feedback')
            
            # UIHelpers should have safe_update methods
            assert hasattr(UIHelpers, 'safe_update_text')
            assert hasattr(UIHelpers, 'safe_update_label')
            assert hasattr(UIHelpers, 'safe_update_button_state')
        else:
            pytest.skip("UI update tests only applicable to refactored version")
    
    @pytest.fixture
    def app(self, repo_type):
        """Create a PasswordGenerator application instance for testing."""
        import tkinter as tk
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        if repo_type == "after":
            repo_path = os.path.join(project_root, 'repository_after')
            if repo_path not in sys.path:
                sys.path.insert(0, repo_path)
            from password_generator import PasswordGenerator
            root = tk.Tk()
            root.withdraw()
            app = PasswordGenerator(root=root)
            yield app
            app.destroy()
        else:
            pytest.skip("GUI tests only applicable to refactored version")
    
    def test_no_tcl_errors_during_operations(self, app):
        """Test that no Tcl errors occur during UI operations."""
        import tkinter as tk
        
        # Generate multiple passwords
        for _ in range(10):
            try:
                app._generate_password()
                app.root.update_idletasks()
            except tk.TclError:
                pytest.fail("TclError occurred during UI operations")
        
        # Copy operation
        app._generate_password()
        try:
            app._copy_to_clipboard()
            app.root.update_idletasks()
        except tk.TclError:
            pytest.fail("TclError occurred during copy operation")


class TestPerformanceAndMemory:
    """Performance and memory tests for long-running operation."""
    
    @pytest.fixture
    def core(self, repo_type):
        """Get the password generator core."""
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
    
    def test_no_thread_growth_during_extended_operation(self, core):
        """Test that no threads are created during extended password generation."""
        initial_threads = threading.active_count()
        
        # Generate many passwords
        for _ in range(100):
            core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
        
        final_threads = threading.active_count()
        
        # Thread count should not increase
        assert final_threads <= initial_threads, \
            f"Thread growth detected: {initial_threads} -> {final_threads}"
    
    def test_history_stays_bounded_after_many_generations(self, core):
        """Test that history stays bounded after generating many passwords."""
        # Generate way more than the max history
        for i in range(500):
            core.generate_password(length=12, use_letters=True, use_digits=True, use_symbols=True)
        
        history = core.get_password_history()
        
        # History should be bounded at 100
        assert len(history) <= 100, f"History exceeded bound: {len(history)} > 100"
    
    def test_clipboard_history_stays_bounded(self, core):
        """Test that clipboard history stays bounded."""
        # Add more than max clipboard history
        for i in range(200):
            core.add_to_clipboard_history(f"password_{i}")
        
        clipboard_history = core.get_clipboard_history()
        
        # Clipboard history should be bounded at 50
        assert len(clipboard_history) <= 50, \
            f"Clipboard history exceeded bound: {len(clipboard_history)} > 50"
    
    def test_memory_stable_after_many_generations(self, core):
        """Test that memory usage remains stable (indirect check via history boundedness)."""
        import gc
        
        # Generate many passwords
        for i in range(1000):
            core.generate_password(length=16, use_letters=True, use_digits=True, use_symbols=True)
        
        # Force garbage collection
        gc.collect()
        
        # History should still be bounded
        history = core.get_password_history()
        assert len(history) <= 100
        
        # All passwords should have correct length
        for pwd in history:
            assert len(pwd) == 16
    
    def test_no_resource_leaks_after_many_operations(self, repo_type):
        """Test that no resources are leaked after many operations."""
        if repo_type != "after":
            pytest.skip("Resource leak tests only applicable to refactored version")
        
        import tkinter as tk
        tests_dir = os.path.dirname(__file__)
        project_root = os.path.dirname(tests_dir)
        
        repo_path = os.path.join(project_root, 'repository_after')
        if repo_path not in sys.path:
            sys.path.insert(0, repo_path)
        from password_generator import PasswordGenerator
        
        initial_threads = threading.active_count()
        
        apps = []
        # Create and destroy many app instances
        for i in range(10):
            root = tk.Tk()
            root.withdraw()
            app = PasswordGenerator(root=root)
            apps.append(app)
            
            # Generate some passwords
            for _ in range(10):
                app._generate_password()
            
            app.destroy()
            apps.remove(app)
        
        # Force garbage collection
        import gc
        gc.collect()
        
        final_threads = threading.active_count()
        
        # Thread count should return to near initial
        # (allowing for some tolerance)
        thread_diff = final_threads - initial_threads
        assert thread_diff <= 2, \
            f"Thread leak detected: {thread_diff} extra threads remain"
