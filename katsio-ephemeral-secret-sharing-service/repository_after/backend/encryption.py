"""AES-256-GCM encryption service."""
import secrets
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import Config


class EncryptionService:
    """Service for encrypting and decrypting secrets using AES-256-GCM."""
    
    def __init__(self, key: Optional[bytes] = None):
        """Initialize encryption service with a key.
        
        Args:
            key: Optional encryption key. If not provided, uses Config.get_encryption_key()
        """
        self.key = key or Config.get_encryption_key()
        if len(self.key) != 32:
            raise ValueError("Encryption key must be exactly 32 bytes (256 bits)")
        self.cipher = AESGCM(self.key)
    
    def encrypt(self, secret: str) -> tuple[bytes, bytes]:
        """Encrypt a secret string.
        
        Args:
            secret: The plaintext secret to encrypt
            
        Returns:
            Tuple of (ciphertext, nonce) as bytes
        """
        # Generate a random 12-byte nonce for GCM
        nonce = secrets.token_bytes(12)
        
        # Encrypt the secret
        secret_bytes = secret.encode('utf-8')
        ciphertext = self.cipher.encrypt(nonce, secret_bytes, None)
        
        return ciphertext, nonce
    
    def decrypt(self, ciphertext: bytes, nonce: bytes) -> str:
        """Decrypt a secret.
        
        Args:
            ciphertext: The encrypted secret
            nonce: The nonce used for encryption
            
        Returns:
            The decrypted plaintext string
            
        Raises:
            ValueError: If decryption fails (invalid ciphertext or nonce)
        """
        try:
            plaintext = self.cipher.decrypt(nonce, ciphertext, None)
            return plaintext.decode('utf-8')
        except Exception as e:
            raise ValueError(f"Decryption failed: {str(e)}")


# Global encryption service instance
encryption_service = EncryptionService()

