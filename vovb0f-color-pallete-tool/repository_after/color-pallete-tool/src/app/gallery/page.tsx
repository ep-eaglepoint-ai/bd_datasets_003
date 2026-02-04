"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Nav from "@/components/Nav";
import GalleryGrid from "@/components/GalleryGrid";
import SavePaletteModal from "@/components/SavePaletteModal";
import type { GalleryPalette } from "@/components/PaletteCard";

function buildGalleryUrl(params: { tag?: string; color?: string }): string {
  const search = new URLSearchParams();
  if (params.tag) search.set("tag", params.tag);
  if (params.color) search.set("color", params.color);
  const q = search.toString();
  return `/api/gallery${q ? `?${q}` : ""}`;
}

export default function GalleryPage() {
  const { data: session } = useSession();
  const [palettes, setPalettes] = useState<GalleryPalette[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [colorFilter, setColorFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saveModalPalette, setSaveModalPalette] = useState<GalleryPalette | null>(null);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const url = buildGalleryUrl({
        tag: tagFilter || undefined,
        color: colorFilter || undefined,
      });
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      setPalettes(Array.isArray(data) ? data : []);
      if (!tagFilter && !colorFilter) {
        const tags = new Set<string>();
        (Array.isArray(data) ? data : []).forEach((p: GalleryPalette) => {
          (p.tags || []).forEach((t: string) => tags.add(t));
        });
        setAllTags(Array.from(tags).sort());
      }
    } catch {
      setPalettes([]);
    } finally {
      setLoading(false);
    }
  }, [tagFilter, colorFilter]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  function handleCopy(palette: GalleryPalette) {
    const text = JSON.stringify(palette.colors, null, 2);
    void navigator.clipboard.writeText(text);
  }

  function handleSave(palette: GalleryPalette) {
    setSaveModalPalette(palette);
  }

  function handleSaveModalClose() {
    setSaveModalPalette(null);
  }

  const isLoggedIn = !!session;
  const presetColors = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  return (
    <div className="min-h-screen p-6 md:p-8">
      <Nav />
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Public Gallery
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Browse palettes shared by the community. Copy colors or save to your library.
        </p>

        {/* Filtering by tags and color */}
        <div className="flex flex-wrap items-center gap-4 mb-8 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Filter by tag:
          </span>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2 text-sm min-w-[160px]"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-4">
            Filter by color:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {presetColors.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColorFilter(colorFilter === hex ? "" : hex)}
                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  backgroundColor: hex,
                  borderColor: colorFilter === hex ? "#1e293b" : "transparent",
                  boxShadow: colorFilter === hex ? "0 0 0 2px white" : undefined,
                }}
                title={hex}
              />
            ))}
            <input
              type="color"
              value={colorFilter || "#888888"}
              onChange={(e) => setColorFilter(e.target.value)}
              className="w-8 h-8 rounded-full border-0 cursor-pointer bg-transparent"
              title="Pick a color"
            />
            {colorFilter && (
              <button
                type="button"
                onClick={() => setColorFilter("")}
                className="text-sm text-slate-600 dark:text-slate-400 underline"
              >
                Clear color
              </button>
            )}
          </div>
        </div>

        {!isLoggedIn && (
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
            <Link href="/auth/signin?callbackUrl=/gallery" className="text-indigo-600 dark:text-indigo-400 font-medium underline">
              Sign in
            </Link>
            {" "}to save palettes to your library.
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <GalleryGrid
            palettes={palettes}
            isLoggedIn={isLoggedIn}
            onCopy={handleCopy}
            onSave={isLoggedIn ? handleSave : undefined}
          />
        )}
      </div>

      {saveModalPalette && (
        <SavePaletteModal
          isOpen={true}
          onClose={handleSaveModalClose}
          colors={saveModalPalette.colors}
          defaultName={saveModalPalette.name}
          defaultDescription={saveModalPalette.description}
          defaultTags={saveModalPalette.tags}
        />
      )}
    </div>
  );
}
