
import { ValueTransformer } from 'typeorm';
import * as crypto from 'crypto';

const getAlgorithm = () => 'aes-256-cbc';
const getKey = () => {
    const secret = process.env.AES_SECRET || '12345678901234567890123456789012';
    return crypto.scryptSync(secret, 'salt', 32);
}

export const EncryptionTransformer: ValueTransformer = {
  to: (value: string) => {
    if (!value) return value;
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(getAlgorithm(), key, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  },
  from: (value: string) => {
    if (!value) return value;
    try {
        const key = getKey();
        const textParts = value.split(':');
        if (textParts.length < 2) return value;
        const ivHex = textParts.shift();
        if (!ivHex) return value;
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedText = textParts.join(':');
        const decipher = crypto.createDecipheriv(getAlgorithm(), key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return value;
    }
  }
};
