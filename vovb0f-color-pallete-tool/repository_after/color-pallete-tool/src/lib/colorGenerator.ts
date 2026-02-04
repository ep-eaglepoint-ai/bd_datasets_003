export function randomHexColor(): string {
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `#${hex.toUpperCase()}`;
}

export function generatePalette(
  current: string[],
  locked: boolean[],
): string[] {
  return current.map((color, index) =>
    locked[index] ? color : randomHexColor(),
  );
}
