"use client";

import PaletteCard, { type GalleryPalette } from "./PaletteCard";

type Props = {
  palettes: GalleryPalette[];
  isLoggedIn: boolean;
  onCopy: (palette: GalleryPalette) => void;
  onSave?: (palette: GalleryPalette) => void;
};

export default function GalleryGrid({
  palettes,
  isLoggedIn,
  onCopy,
  onSave,
}: Props) {
  if (palettes.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        <p className="text-lg">No public palettes yet.</p>
        <p className="text-sm mt-2">
          Share palettes from My Library to see them here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      data-testid="gallery-grid"
    >
      {palettes.map((palette) => (
        <PaletteCard
          key={palette._id}
          palette={palette}
          onCopy={onCopy}
          onSave={onSave}
          isLoggedIn={isLoggedIn}
        />
      ))}
    </div>
  );
}
