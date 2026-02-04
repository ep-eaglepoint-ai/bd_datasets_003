import { NextRequest, NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongo";
import { Palette } from "@/lib/paletteModel";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await connectToMongo();

  const palettes = await Palette.find({
    userId: session.user.id,
  }).sort({ createdAt: -1 });

  return NextResponse.json(palettes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await connectToMongo();

  const data = await req.json();

  const newPalette = await Palette.create({
    name: data.name,
    colors: data.colors,
    description: data.description || "",
    tags: data.tags || [],
    collectionId: data.collectionId || null,
    userId: session.user.id,
    isPublic: false,
  });

  return NextResponse.json(newPalette);
}
