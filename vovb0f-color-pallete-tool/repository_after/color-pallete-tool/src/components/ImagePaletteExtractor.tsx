"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ExtractionMode } from "@/app/api/extractColors/route";
import { colord } from "colord";
import SavePaletteModal from "./SavePaletteModal";
import ExportButton from "./ExportButton";

export default function ImagePaletteExtractor() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [mode, setMode] = useState<ExtractionMode>("Vibrant");
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { data: session } = useSession();

  // Avoid SSR mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  async function fetchColors(file: File, mode: ExtractionMode) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("mode", mode);

    const res = await fetch("/api/extractColors", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    return data.colors as string[];
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    setLoading(true);
    const extractedColors = await fetchColors(file, mode);
    setColors(extractedColors);
    setLoading(false);
  }

  async function handleModeChange(newMode: ExtractionMode) {
    setMode(newMode);
    if (imageFile) {
      setLoading(true);
      const extractedColors = await fetchColors(imageFile, newMode);
      setColors(extractedColors);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white dark:bg-slate-900/50 rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 space-y-8">
      <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
        Image Palette Extractor
      </h2>

      {/* File input */}
      <label className="block w-full group">
        <span className="text-slate-700 dark:text-slate-300 font-semibold mb-2 block">
          Upload Image
        </span>
        <div className="relative rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors duration-200 p-6 bg-slate-50/50 dark:bg-slate-800/30">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
            Click or drag an image here
          </p>
        </div>
      </label>

      {/* Image preview */}
      {isClient && imagePreview && (
        <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200/60 dark:border-slate-700/60">
          <img
            src={imagePreview}
            alt="Uploaded"
            className="w-full max-h-72 object-contain bg-slate-100 dark:bg-slate-800"
          />
        </div>
      )}

      {/* Mode buttons */}
      <div className="flex flex-wrap gap-3">
        {(["Vibrant", "Muted", "Dominant"] as ExtractionMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
              mode === m
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Extracting colors...
        </p>
      )}

      {/* Save & Export - only when colors extracted */}
      {colors.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
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
          <ExportButton paletteName="Extracted Palette" colors={colors} />
        </div>
      )}

      {/* Color swatches */}
      {colors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-5">
          {colors.map((color, idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl shadow-lg flex flex-col justify-center items-center transition-transform duration-200 hover:scale-105 hover:shadow-xl"
              style={{ backgroundColor: color }}
            >
              <span
                className="text-sm font-mono font-semibold select-none tracking-wider px-2 py-1 rounded-lg bg-black/10 dark:bg-white/10"
                style={{ color: colord(color).isDark() ? "#FFF" : "#000" }}
              >
                {color}
              </span>
            </div>
          ))}
        </div>
      )}

      <SavePaletteModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        colors={colors}
      />
    </div>
  );
}
