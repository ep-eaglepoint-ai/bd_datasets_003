"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { randomHexColor, getComplementary } from "@/lib/colorUtils";
import SavePaletteModal from "./SavePaletteModal";
import ExportButton from "./ExportButton";
import {
  getAnalogous,
  getTriadic,
  getSplitComplementary,
} from "@/lib/colorUtils";

function getSuggestions(
  color: string,
  type: "complementary" | "analogous" | "triadic" | "split",
) {
  switch (type) {
    case "complementary":
      return [getComplementary(color)];
    case "analogous":
      return getAnalogous(color);
    case "triadic":
      return getTriadic(color);
    case "split":
      return getSplitComplementary(color);
  }
}

const FALLBACK_COLORS = ["#3B82F6", "#10B981", "#F59E0B"];

export default function ColorPickerPalette() {
  const [colors, setColors] = useState<string[]>(FALLBACK_COLORS);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    setColors([
      randomHexColor(),
      randomHexColor(),
      randomHexColor(),
    ]);
  }, []);

  const handleChange = (index: number, value: string) => {
    const newColors = [...colors];
    newColors[index] = value;
    setColors(newColors);
  };

  const handleComplement = (index: number) => {
    const newColors = [...colors];
    newColors[index] = getComplementary(colors[index]);
    setColors(newColors);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-6">
      <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
        Manual Color Picker
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {colors.map((color, idx) => (
          <div
            key={idx}
            className="rounded-2xl overflow-hidden shadow-lg border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:shadow-xl transition-all duration-300"
          >
            <div
              className="h-32"
              style={{ backgroundColor: color }}
            />
            <div className="p-5 flex flex-col items-center gap-4 bg-white dark:bg-slate-900">
              <input
                type="color"
                value={color}
                onChange={(e) => handleChange(idx, e.target.value)}
                className="w-14 h-14 rounded-xl border-2 border-slate-300 dark:border-slate-600 cursor-pointer shadow-inner"
              />
              <span className="font-mono text-sm font-semibold tracking-wider text-slate-600 dark:text-slate-300">
                {color}
              </span>
              <button
                className="px-5 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                onClick={() => handleComplement(idx)}
              >
                Complement
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        {session ? (
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
          >
            Save to Library
          </button>
        ) : (
          <Link
            href="/auth/signin?callbackUrl=/"
            className="px-6 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Sign in to save
          </Link>
        )}
        <span className="text-slate-500 dark:text-slate-400 text-sm">Export:</span>
        <ExportButton paletteName="Manual Palette" colors={colors} />
      </div>

      <SavePaletteModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        colors={colors}
      />
    </div>
  );
}
