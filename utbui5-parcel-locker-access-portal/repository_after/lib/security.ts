import bcrypt from 'bcryptjs';

export function generateSecurePin(): string {
  const min = 100000;
  const max = 999999;
  const pin = Math.floor(Math.random() * (max - min + 1)) + min;
  return pin.toString().padStart(6, '0');
}

export async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(pin, saltRounds);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return await bcrypt.compare(pin, pinHash);
}
