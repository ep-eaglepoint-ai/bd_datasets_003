"use client";

import { useState, useEffect } from "react";

type Collection = { _id: string; name: string; description?: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  colors: string[];
  defaultName?: string;
  defaultDescription?: string;
  defaultTags?: string[];
};

export default function SavePaletteModal({
  isOpen,
  onClose,
  colors,
  defaultName = "",
  defaultDescription = "",
  defaultTags = [],
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [collectionId, setCollectionId] = useState<string>("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setDescription(defaultDescription);
      setTags(Array.isArray(defaultTags) ? defaultTags.join(", ") : "");
      setCollectionId("");
      setError("");
      setSuccess(false);
      fetch("/api/collections", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setCollections(Array.isArray(data) ? data : []))
        .catch(() => setCollections([]));
    }
  }, [isOpen, defaultName, defaultDescription, defaultTags]);

  async function savePalette() {
    if (!name.trim()) {
      setError("Palette name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/palette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          colors,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          collectionId: collectionId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save palette");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold mb-4">Save to Library</h3>

        <div className="space-y-3 mb-4">
          <input
            className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
            placeholder="Palette name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <select
            className="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            <option value="">No collection</option>
            {collections.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        {success && <p className="text-green-500 text-sm mb-2">Saved!</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={savePalette}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
