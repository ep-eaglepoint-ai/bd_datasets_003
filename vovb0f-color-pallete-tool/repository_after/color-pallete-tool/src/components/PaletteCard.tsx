"use client";

import { useState } from "react";
import { colord } from "colord";

export type GalleryPalette = {
  _id: string;
  name: string;
  colors: string[];
  tags: string[];
  description?: string;
  createdAt?: string;
};

type Props = {
  palette: GalleryPalette;
  onCopy: (palette: GalleryPalette) => void;
  onSave?: (palette: GalleryPalette) => void;
  isLoggedIn: boolean;
};

export default function PaletteCard({
  palette,
  onCopy,
  onSave,
  isLoggedIn,
}: Props) {
  const [copyDone, setCopyDone] = useState(false);
  const [saveDone, setSaveDone] = useState(false);

  function handleCopy() {
    onCopy(palette);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }

  function handleSave() {
    if (!onSave || !isLoggedIn) return;
    onSave(palette);
    setSaveDone(true);
    setTimeout(() => setSaveDone(false), 2000);
  }

  return (
    <article
      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
      data-testid="gallery-palette-card"
    >
      <div className="p-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">
          {palette.name}
        </h3>
        {palette.description && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
            {palette.description}
          </p>
        )}
        {palette.tags && palette.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {palette.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Color swatches */}
      <div className="flex flex-wrap gap-0.5 p-2 border-t border-slate-100 dark:border-slate-800">
        {palette.colors.map((hex, i) => (
          <div
            key={i}
            className="flex-1 min-w-[24px] h-12 rounded-sm border border-slate-200/50 dark:border-slate-700/50 flex items-end justify-center pb-1"
            style={{ backgroundColor: hex }}
            title={hex}
          >
            <span
              className="text-[10px] font-mono font-semibold truncate max-w-full px-0.5"
              style={{
                color: colord(hex).isDark() ? "#fff" : "#000",
                textShadow: "0 0 1px rgba(0,0,0,0.3)",
              }}
            >
              {hex}
            </span>
          </div>
        ))}
      </div>

      {/* One-click Copy and Save */}
      <div className="p-3 flex gap-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          {copyDone ? "Copied!" : "Copy"}
        </button>
        {isLoggedIn && onSave && (
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saveDone ? "Saved!" : "Save"}
          </button>
        )}
      </div>
    </article>
  );
}
