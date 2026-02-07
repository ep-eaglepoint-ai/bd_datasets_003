import { computeHmacSha256Hex } from "../repository_after/src/webhooks/utils/signature.util";

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
});
