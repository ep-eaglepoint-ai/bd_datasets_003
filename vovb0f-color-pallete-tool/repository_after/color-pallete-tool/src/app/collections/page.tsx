import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

import { connectToMongo } from "@/lib/mongo";
import { Collection } from "@/lib/collection";
import Nav from "@/components/Nav";
import CreateCollectionForm from "@/components/CreateCollectionForm";

export default async function CollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin?callbackUrl=/collections");

  await connectToMongo();

  const collections = await Collection.find({
    userId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean();

  return (
    <div className="p-8">
      <Nav />
      <h1 className="text-2xl font-bold mb-6">My Collections</h1>

      <CreateCollectionForm />

      {collections.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">No collections yet. Create one to organize your palettes.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c: { _id: unknown; name: string; description?: string }) => (
            <div
              key={String(c._id)}
              className="border border-slate-200 dark:border-slate-700 p-4 rounded-lg"
            >
              <p className="font-semibold">{c.name}</p>
              {c.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{c.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
