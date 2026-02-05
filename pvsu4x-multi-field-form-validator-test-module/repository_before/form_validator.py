# form_validator.py

import re
import string

def validate_form(username: str, email: str, password: str, confirm_password: str = None, country_code: str = None) -> bool:
    """
    Validates a multi-field registration form with extended checks.
    
    Args:
        username: Alphanumeric username (3–15 chars, no spaces, Unicode allowed)
        email: Email address in valid format
        password: Password string (≥8 chars, mixed case, numeric, special char)
        confirm_password: Optional field to confirm password matches
        country_code: Optional ISO 2-letter country code for localization
    
    Returns:
        True if all validations pass, False otherwise
    """
    
    # --------------------------
    # Username validation
    # --------------------------
    if not isinstance(username, str) or not username:
        return False
    
    if not (3 <= len(username) <= 15):
        return False
    
    # Unicode-aware alphanumeric check
    if not all(char.isalnum() for char in username):
        return False
    
    # Prevent purely numeric usernames
    if username.isdigit():
        return False
    
    # --------------------------
    # Email validation
    # --------------------------
    if not isinstance(email, str) or not email:
        return False
    
    # Basic structure check
    if "@" not in email or "." not in email.split("@")[-1]:
        return False
    
    # Disallow multiple '@'
    if email.count("@") != 1:
        return False
    
    # No consecutive dots
    if ".." in email:
        return False
    
    # Local and domain part rules
    local_part, domain_part = email.split("@")
    if not local_part or not domain_part or domain_part.startswith(".") or domain_part.endswith("."):
        return False
    
    # --------------------------
    # Password validation
    # --------------------------
    if not isinstance(password, str) or len(password) < 8:
        return False
    
    if password.lower() == password or password.upper() == password:
        return False
    
    if not any(c.isdigit() for c in password):
        return False
    
    if not any(not c.isalnum() for c in password):
        return False
    
    # Disallow spaces in password
    if " " in password:
        return False
    
    # Optional confirm password check
    if confirm_password is not None and password != confirm_password:
        return False
    
    # Check for simple repeated sequences (e.g., 'aaaa', 'abab')
    for seq_len in range(1, len(password)//2 + 1):
        for i in range(len(password) - 2*seq_len + 1):
            if password[i:i+seq_len] == password[i+seq_len:i+2*seq_len]:
                return False
    
    # --------------------------
    # Country code validation
    # --------------------------
    if country_code is not None:
        if not isinstance(country_code, str) or len(country_code) != 2 or not country_code.isalpha():
            return False
    if all(char in string.punctuation or char.isspace() for char in username):
        return False
    
    # Disallow very long consecutive sequences of digits in password
    if re.search(r"\d{6,}", password):
        return False
    
    return True

