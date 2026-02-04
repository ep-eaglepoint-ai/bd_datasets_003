import { NextRequest, NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongo";
import { Palette } from "@/lib/paletteModel";

/** Normalize hex for comparison (e.g. #abc -> #AABBCC) */
function normalizeHex(hex: string): string {
  const cleaned = hex.replace(/^#/, "").trim();
  if (cleaned.length === 3) {
    return "#" + cleaned.split("").map((c) => c + c).join("").toUpperCase();
  }
  return "#" + cleaned.padStart(6, "0").toUpperCase();
}

/**
 * GET /api/gallery
 * Public gallery: returns palettes that users have chosen to share publicly.
 * Query: tag (string), color (hex string) for filtering.
 * No auth required.
 */
export async function GET(req: NextRequest) {
  await connectToMongo();

  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag")?.trim();
  const colorParam = searchParams.get("color")?.trim();

  const filter: Record<string, unknown> = { isPublic: true };

  if (tag) {
    filter.tags = { $in: [tag] };
  }

  if (colorParam) {
    try {
      const normalized = normalizeHex(colorParam);
      filter.colors = { $in: [normalized, normalized.toLowerCase()] };
    } catch {
      // ignore invalid color param
    }
  }

  const palettes = await Palette.find(filter)
    .sort({ createdAt: -1 })
    .select("name colors tags description createdAt")
    .lean();

  return NextResponse.json(palettes);
}
