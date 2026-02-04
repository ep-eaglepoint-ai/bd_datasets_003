import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

import { connectToMongo } from "@/lib/mongo";
import { Palette } from "@/lib/paletteModel";
import Nav from "@/components/Nav";
import LibraryPaletteCard from "@/components/LibraryPaletteCard";

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin?callbackUrl=/library");

  await connectToMongo();

  const palettes = await Palette.find({
    userId: session.user.id,
  }).lean();

  const list = palettes.map((p) => ({
    _id: String(p._id),
    name: p.name,
    colors: p.colors,
    isPublic: !!p.isPublic,
  }));

  return (
    <div className="p-8">
      <Nav />
      <h1 className="text-2xl font-bold mb-6">My Palettes</h1>
      <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
        Share a palette to gallery to make it visible on the public Gallery page.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((p) => (
          <LibraryPaletteCard key={p._id} palette={p} />
        ))}
      </div>
    </div>
  );
}
