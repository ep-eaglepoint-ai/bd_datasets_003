// src/lib/colorUtils.ts
import { colord, Colord } from "colord";

export type AnyColor = string | Colord;

/** Random color */
export function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

/** Complementary */
export function getComplementary(color: AnyColor): string {
  return colord(color).rotate(180).toHex();
}

/** Analogous */
export function getAnalogous(color: AnyColor): string[] {
  const c = colord(color);
  return [c.rotate(30).toHex(), c.rotate(-30).toHex()];
}

/** Triadic */
export function getTriadic(color: AnyColor): string[] {
  const c = colord(color);
  return [c.rotate(120).toHex(), c.rotate(240).toHex()];
}

/** Split-complementary */
export function getSplitComplementary(color: AnyColor): string[] {
  const c = colord(color);
  return [c.rotate(150).toHex(), c.rotate(-150).toHex()];
}

/** Contrast ratio */
export function getContrastRatio(color1: AnyColor, color2: AnyColor): number {
  return colord(color1).contrast(colord(color2));
}
