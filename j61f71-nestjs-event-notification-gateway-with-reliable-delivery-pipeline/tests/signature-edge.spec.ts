import {
  computeHmacSha256Hex,
  verifyHmacSha256HexTimingSafe,
} from "../repository_after/src/webhooks/utils/signature.util";

describe("Signature Edge Cases (Req 5)", () => {
  // Req 5 Edge 1: Unicode characters in payload
  it("computes correct HMAC for unicode payloads", () => {
    const secret = "secret";
    const payload = JSON.stringify({ msg: "Hello 🌍" }); // Contains Emoji
    const hmac = computeHmacSha256Hex(secret, payload);

    // Verify with standard crypto to align
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    expect(hmac).toBe(expected);
  });

  // Req 5 Edge 2: Empty secret or payload
  it("handles empty payload", () => {
    const secret = "secret";
    const payload = "";
    const hmac = computeHmacSha256Hex(secret, payload);
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    expect(hmac).toBe(expected);
  });

  // Req 5 Edge 3: Timing Safe Verification Length Mismatch
  it("uses timingSafeEqual even when lengths mismatch to prevent timing attacks", () => {
    const crypto = require("crypto");
    const spy = jest.spyOn(crypto, "timingSafeEqual");
    const secret = "secret";
    const body = "{}";

    // Create a mismatching signature length (signature is 64 hex chars -> 32 bytes)
    // "00" is 2 hex chars -> 1 byte.
    const shortSig = "00";

    const result = verifyHmacSha256HexTimingSafe(secret, body, shortSig);

    expect(result).toBe(false);
    expect(spy).toHaveBeenCalled(); // Ensure constant time path is taken
  });
});
