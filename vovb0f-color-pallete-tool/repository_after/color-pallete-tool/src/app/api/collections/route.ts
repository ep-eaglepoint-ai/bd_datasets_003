import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { connectToMongo } from "@/lib/mongo";
import { Collection } from "@/lib/collection";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { name, description } = await req.json();

  if (!name || name.trim() === "") {
    return NextResponse.json(
      { error: "Collection name is required" },
      { status: 400 }
    );
  }

  await connectToMongo();

  const collection = await Collection.create({
    name: name.trim(),
    description: description || "",
    userId: session.user.id,
  });

  return NextResponse.json(collection);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await connectToMongo();

  const collections = await Collection.find({
    userId: session.user.id,
  }).sort({ createdAt: -1 });

  return NextResponse.json(collections);
}
