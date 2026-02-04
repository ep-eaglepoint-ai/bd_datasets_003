import { NextRequest, NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongo";
import { Palette } from "@/lib/paletteModel";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * PATCH /api/palette/[id] - Update palette (e.g. isPublic for sharing to gallery).
 * Only the owner can update.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectToMongo();

  const palette = await Palette.findOne({
    _id: id,
    userId: session.user.id,
  });

  if (!palette) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  if (typeof body.isPublic === "boolean") {
    palette.isPublic = body.isPublic;
    await palette.save();
  }

  return NextResponse.json(palette);
}
