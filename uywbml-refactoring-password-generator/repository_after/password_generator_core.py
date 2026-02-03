"""
Core password generation logic.

This module contains the pure business logic for password generation,
separated from the UI concerns for better testability and maintainability.
"""

import random
import string
from typing import List, Optional


class PasswordGeneratorCore:
    """
    Core password generation logic.
    
    This class handles all password generation operations independently
    of any UI framework, making it easy to test and reuse.
    """
    
    # Character set constants
    LETTERS = string.ascii_letters
    DIGITS = string.digits
    SYMBOLS = string.punctuation
    
    # Default history limits
    DEFAULT_MAX_PASSWORD_HISTORY = 100
    DEFAULT_MAX_CLIPBOARD_HISTORY = 50
    
    def __init__(
        self,
        max_password_history: int = DEFAULT_MAX_PASSWORD_HISTORY,
        max_clipboard_history: int = DEFAULT_MAX_CLIPBOARD_HISTORY
    ):
        """
        Initialize the password generator core.
        
        Args:
            max_password_history: Maximum number of passwords to keep in history
            max_clipboard_history: Maximum number of clipboard entries to keep
        """
        self._max_password_history = max_password_history
        self._max_clipboard_history = max_clipboard_history
        self._password_history: List[str] = []
        self._clipboard_history: List[dict] = []
    
    def generate_password(
        self,
        length: int,
        use_letters: bool = True,
        use_digits: bool = True,
        use_symbols: bool = True
    ) -> str:
        """
        Generate a secure password based on selected options.
        
        Args:
            length: Desired password length
            use_letters: Include letters in password
            use_digits: Include digits in password
            use_symbols: Include symbols in password
            
        Returns:
            Generated password string
            
        Raises:
            ValueError: If no character type is selected
        """
        characters = self._build_character_pool(
            use_letters=use_letters,
            use_digits=use_digits,
            use_symbols=use_symbols
        )
        
        if not characters:
            raise ValueError("At least one character type must be selected")
        
        if length < 4:
            raise ValueError("Password length must be at least 4")
        
        if length > 32:
            raise ValueError("Password length must not exceed 32")
        
        # Use SystemRandom for cryptographically secure random selection
        generator = random.SystemRandom()
        password = ''.join(generator.choice(characters) for _ in range(length))
        
        # Store in history
        self._password_history.append(password)
        self._trim_password_history()
        
        return password
    
    def _build_character_pool(
        self,
        use_letters: bool,
        use_digits: bool,
        use_symbols: bool
    ) -> str:
        """
        Build character pool based on selected options.
        
        Args:
            use_letters: Include letters in pool
            use_digits: Include digits in pool
            use_symbols: Include symbols in pool
            
        Returns:
            String of allowed characters
        """
        pool = []
        
        if use_letters:
            pool.append(self.LETTERS)
        if use_digits:
            pool.append(self.DIGITS)
        if use_symbols:
            pool.append(self.SYMBOLS)
        
        return ''.join(pool)
    
    def _trim_password_history(self):
        """Trim password history to maximum size."""
        while len(self._password_history) > self._max_password_history:
            self._password_history.pop(0)
    
    def _trim_clipboard_history(self):
        """Trim clipboard history to maximum size."""
        while len(self._clipboard_history) > self._max_clipboard_history:
            self._clipboard_history.pop(0)
    
    def add_to_clipboard_history(self, password: str):
        """
        Add a password to clipboard history.
        
        Args:
            password: Password that was copied to clipboard
        """
        from datetime import datetime
        
        self._clipboard_history.append({
            "pwd": password,
            "timestamp": datetime.now().isoformat()
        })
        self._trim_clipboard_history()
    
    def get_password_history(self) -> List[str]:
        """Get copy of password history."""
        return list(self._password_history)
    
    def get_clipboard_history(self) -> List[dict]:
        """Get copy of clipboard history."""
        return list(self._clipboard_history)
    
    def clear_password_history(self):
        """Clear password history."""
        self._password_history.clear()
    
    def clear_clipboard_history(self):
        """Clear clipboard history."""
        self._clipboard_history.clear()
    
    def clear_all_histories(self):
        """Clear both password and clipboard histories."""
        self.clear_password_history()
        self.clear_clipboard_history()
    
    @property
    def password_history_count(self) -> int:
        """Get current count of passwords in history."""
        return len(self._password_history)
    
    @property
    def clipboard_history_count(self) -> int:
        """Get current count of clipboard entries in history."""
        return len(self._clipboard_history)
