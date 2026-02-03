export function encodeBitmapBase64(bits: boolean[]): string {
  const byteLen = Math.ceil(bits.length / 8);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return Buffer.from(bytes).toString("base64");
}

export function decodeBitmapBase64(
  base64: string,
  bitLength: number
): boolean[] {
  const raw = Buffer.from(base64, "base64");
  const out = new Array<boolean>(bitLength).fill(false);
  for (let i = 0; i < bitLength; i++) {
    const byte = raw[i >> 3] ?? 0;
    out[i] = ((byte >> (i & 7)) & 1) === 1;
  }
  return out;
}
