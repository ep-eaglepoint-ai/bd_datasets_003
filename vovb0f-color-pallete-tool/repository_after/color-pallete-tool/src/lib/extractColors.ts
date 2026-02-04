// src/lib/extractColors.ts
import Vibrant from "node-vibrant";

export type ExtractionMode = "Vibrant" | "Muted" | "Dominant";

export async function extractColors(
  file: File,
  mode: ExtractionMode = "Vibrant",
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const palette = await Vibrant.from(buffer).getPalette();

  switch (mode) {
    case "Vibrant":
      return palette.Vibrant ? [palette.Vibrant.hex] : [];
    case "Muted":
      return palette.Muted ? [palette.Muted.hex] : [];
    case "Dominant":
      // return all prominent colors
      return Object.values(palette)
        .filter(Boolean)
        .map((swatch) => swatch!.hex);
    default:
      return [];
  }
}
