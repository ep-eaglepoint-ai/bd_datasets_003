
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  
  constructor(private configService: ConfigService) {
    const secret = this.configService.get<string>('AES_SECRET') || '12345678901234567890123456789012';
    // Ensure key is 32 bytes
    this.key = crypto.scryptSync(secret, 'salt', 32);
  }

  encrypt(text: string): string {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text: string): string {
    if (!text) return text;
    try {
      const textParts = text.split(':');
      if (textParts.length < 2) return text;
      const ivHex = textParts.shift();
      if (!ivHex) return text;
      const iv = Buffer.from(ivHex, 'hex');
      const encryptedText = textParts.join(':');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
       console.error('Decryption failed', error);
       return text; // Return original if fail, or throw
    }
  }
}
