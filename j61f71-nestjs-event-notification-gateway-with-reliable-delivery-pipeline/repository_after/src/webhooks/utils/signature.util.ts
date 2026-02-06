import * as crypto from "crypto";

export function computeHmacSha256Hex(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyHmacSha256HexTimingSafe(
  secret: string,
  body: string,
  providedSignatureHex: string
): boolean {
  const expectedHex = computeHmacSha256Hex(secret, body);

  let expected: Buffer;
  let provided: Buffer;

  try {
    expected = Buffer.from(expectedHex, "hex");
    provided = Buffer.from(providedSignatureHex, "hex");
  } catch {
    provided = Buffer.alloc(0);
    expected = Buffer.from(expectedHex, "hex");
  }

  if (provided.length !== expected.length) {
    const padded = Buffer.alloc(expected.length);
    if (provided.length > 0) {
      provided.copy(padded, 0, 0, Math.min(provided.length, expected.length));
    }
    crypto.timingSafeEqual(expected, padded);
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}
