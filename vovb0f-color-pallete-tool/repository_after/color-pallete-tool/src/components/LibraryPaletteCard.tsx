"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LibraryPalette = {
  _id: string;
  name: string;
  colors: string[];
  isPublic?: boolean;
};

type Props = { palette: LibraryPalette };

export default function LibraryPaletteCard({ palette }: Props) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(!!palette.isPublic);
  const [loading, setLoading] = useState(false);

  async function toggleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/palette/${palette._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (res.ok) {
        setIsPublic(!isPublic);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 p-4 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{palette.name}</p>
      <div className="flex gap-1 mt-2 flex-wrap">
        {palette.colors.map((c: string) => (
          <div
            key={c}
            className="w-8 h-8 rounded-lg border border-slate-200/50"
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={toggleShare}
        disabled={loading}
        className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "..." : isPublic ? "Unshare from gallery" : "Share to gallery"}
      </button>
    </div>
  );
}
