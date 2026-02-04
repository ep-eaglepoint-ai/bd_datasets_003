import { NextRequest, NextResponse } from "next/server";
import { Vibrant } from "node-vibrant/node"; // ✅ named import for server

export type ExtractionMode = "Vibrant" | "Muted" | "Dominant";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("image") as File | null;

  if (!file) return NextResponse.json({ colors: [] });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extract colors
  const palette = await Vibrant.from(buffer).getPalette();

  const colors: string[] = [];
  const mode = (formData.get("mode") as ExtractionMode) || "Vibrant";

  switch (mode) {
    case "Vibrant":
      if (palette.Vibrant) colors.push((palette.Vibrant as any).hex);
      break;
    case "Muted":
      if (palette.Muted) colors.push((palette.Muted as any).hex);
      break;
    case "Dominant":
      Object.values(palette)
        .filter(Boolean)
        .forEach((swatch: any) => colors.push(swatch.hex));
      break;
  }

  return NextResponse.json({ colors });
}
