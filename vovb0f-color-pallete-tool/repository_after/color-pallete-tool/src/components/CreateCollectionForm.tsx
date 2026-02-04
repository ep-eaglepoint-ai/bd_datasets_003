"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateCollectionForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      setName("");
      setDescription("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create collection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
      <h3 className="font-semibold mb-3">Create new collection</h3>
      <div className="flex flex-wrap gap-2">
        <input
          className="px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 flex-1 min-w-[200px]"
          placeholder="Collection name (e.g. Website Redesign)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 flex-1 min-w-[200px]"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create"}
        </button>
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </form>
  );
}
