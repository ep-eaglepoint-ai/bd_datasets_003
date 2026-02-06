import * as crypto from "crypto";
import {
  computeHmacSha256Hex,
  verifyHmacSha256HexTimingSafe,
} from "../repository_after/src/webhooks/utils/signature.util";

describe("signature.util", () => {
  it("computes HMAC-SHA256 hex correctly", () => {
    const sig = computeHmacSha256Hex("key", "hello");
    expect(sig).toBe(
      "9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b"
    );
  });

  it("verifies signature using timing-safe comparison", () => {
    const spy = jest.spyOn(crypto, "timingSafeEqual");

    const body = JSON.stringify({ a: 1 });
    const secret = "shhh";
    const good = computeHmacSha256Hex(secret, body);

    expect(verifyHmacSha256HexTimingSafe(secret, body, good)).toBe(true);
    expect(verifyHmacSha256HexTimingSafe(secret, body, "00")).toBe(false);

    expect(spy).toHaveBeenCalled();
  });
});
