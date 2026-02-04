"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { generatePalette, randomHexColor } from "@/lib/colorGenerator";
import SavePaletteModal from "./SavePaletteModal";
import ExportButton from "./ExportButton";

const FALLBACK_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function PaletteGenerator() {
  const [colors, setColors] = useState<string[]>(FALLBACK_COLORS);
  const [locked, setLocked] = useState<boolean[]>(Array(5).fill(false));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    setColors(Array.from({ length: 5 }, () => randomHexColor()));
  }, []);

  function toggleLock(index: number) {
    setLocked((prev) => prev.map((lock, i) => (i === index ? !lock : lock)));
  }

  function generateNewPalette() {
    setColors((prev) => generatePalette(prev, locked));
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
        Palette Generator
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
        {colors.map((color, index) => (
          <div
            key={index}
            className="rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-200/60 dark:border-slate-700/60 hover:-translate-y-1 bg-white dark:bg-slate-900"
          >
            <div
              className="h-36 transition-transform duration-300 hover:scale-[1.02]"
              style={{ backgroundColor: color }}
            />

            <div className="p-4 flex flex-col items-center gap-3 bg-white dark:bg-slate-900">
              <span className="text-sm font-mono font-medium tracking-wider text-slate-600 dark:text-slate-300">
                {color}
              </span>

              <button
                onClick={() => toggleLock(index)}
                className={`text-xs font-semibold px-4 py-2 rounded-full transition-all duration-200 shadow-sm hover:shadow-md ${
                  locked[index]
                    ? "bg-rose-500 text-white hover:bg-rose-600"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {locked[index] ? "Locked" : "Lock"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={generateNewPalette}
          className="px-8 py-3 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-800 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 border-0"
        >
          Generate New
        </button>
        {session ? (
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:bg-indigo-700 hover:-translate-y-0.5 transition-all duration-200"
          >
            Save to Library
          </button>
        ) : (
          <Link
            href="/auth/signin?callbackUrl=/"
            className="px-8 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
          >
            Sign in to save
          </Link>
        )}
        <span className="text-slate-500 dark:text-slate-400 text-sm">Export:</span>
        <ExportButton paletteName="Generated Palette" colors={colors} />
      </div>

      <SavePaletteModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        colors={colors}
      />
    </div>
  );
}
