"""Unit tests for encryption service."""

import pytest
from repository_after.backend.encryption import EncryptionService
from repository_after.backend.config import Config


class TestEncryptionService:
    """Test encryption and decryption functionality."""

    def test_encrypt_decrypt_success(self):
        """Test successful encryption and decryption."""
        service = EncryptionService()
        secret = "my-secret-api-key-12345"

        ciphertext, nonce = service.encrypt(secret)

        assert ciphertext is not None
        assert nonce is not None
        assert len(nonce) == 12  # GCM nonce is 12 bytes
        assert ciphertext != secret.encode()  # Should be encrypted

        decrypted = service.decrypt(ciphertext, nonce)
        assert decrypted == secret

    def test_encrypt_different_nonces(self):
        """Test that same secret produces different ciphertext with different nonces."""
        service = EncryptionService()
        secret = "test-secret"

        ciphertext1, nonce1 = service.encrypt(secret)
        ciphertext2, nonce2 = service.encrypt(secret)

        # Nonces should be different (random)
        assert nonce1 != nonce2

        # Ciphertexts should be different
        assert ciphertext1 != ciphertext2

        # But both should decrypt to the same secret
        assert service.decrypt(ciphertext1, nonce1) == secret
        assert service.decrypt(ciphertext2, nonce2) == secret

    def test_decrypt_invalid_ciphertext(self):
        """Test decryption with invalid ciphertext fails."""
        service = EncryptionService()
        nonce = b"\x00" * 12

        with pytest.raises(ValueError, match="Decryption failed"):
            service.decrypt(b"invalid-ciphertext", nonce)

    def test_decrypt_invalid_nonce(self):
        """Test decryption with invalid nonce fails."""
        service = EncryptionService()
        secret = "test-secret"
        ciphertext, nonce = service.encrypt(secret)

        # Use wrong nonce
        wrong_nonce = b"\x00" * 12

        with pytest.raises(ValueError, match="Decryption failed"):
            service.decrypt(ciphertext, wrong_nonce)

    def test_encrypt_empty_string(self):
        """Test encryption of empty string."""
        service = EncryptionService()
        secret = ""

        ciphertext, nonce = service.encrypt(secret)
        decrypted = service.decrypt(ciphertext, nonce)

        assert decrypted == secret

    def test_encrypt_long_string(self):
        """Test encryption of long string."""
        service = EncryptionService()
        secret = "a" * 10000  # 10KB string

        ciphertext, nonce = service.encrypt(secret)
        decrypted = service.decrypt(ciphertext, nonce)

        assert decrypted == secret

    def test_encrypt_special_characters(self):
        """Test encryption of string with special characters."""
        service = EncryptionService()
        secret = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~"

        ciphertext, nonce = service.encrypt(secret)
        decrypted = service.decrypt(ciphertext, nonce)

        assert decrypted == secret

    def test_encrypt_unicode(self):
        """Test encryption of unicode string."""
        service = EncryptionService()
        secret = "Hello 世界 🌍"

        ciphertext, nonce = service.encrypt(secret)
        decrypted = service.decrypt(ciphertext, nonce)

        assert decrypted == secret

    def test_different_keys_produce_different_ciphertext(self):
        """Test that different keys produce different ciphertexts."""
        import secrets

        key1 = secrets.token_bytes(32)
        key2 = secrets.token_bytes(32)

        service1 = EncryptionService(key1)
        service2 = EncryptionService(key2)

        secret = "test-secret"
        ciphertext1, nonce1 = service1.encrypt(secret)
        ciphertext2, nonce2 = service2.encrypt(secret)

        # Even with same nonce, ciphertexts should be different
        assert ciphertext1 != ciphertext2

        # Each can only decrypt its own ciphertext
        assert service1.decrypt(ciphertext1, nonce1) == secret
        assert service2.decrypt(ciphertext2, nonce2) == secret

        # Cannot decrypt with wrong key
        with pytest.raises(ValueError):
            service1.decrypt(ciphertext2, nonce2)
