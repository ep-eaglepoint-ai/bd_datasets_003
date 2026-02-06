export function truncateUtf8ToMaxBytes(
  input: string,
  maxBytes: number
): string {
  const buffer = Buffer.from(input ?? "", "utf8");
  if (buffer.length <= maxBytes) return input ?? "";

  const sliced = buffer.subarray(0, maxBytes);
  return sliced.toString("utf8");
}
