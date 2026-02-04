"use client";

import { colord } from "colord";

type Props = {
  paletteName: string;
  colors: string[];
};

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "palette";
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportButton({ paletteName, colors }: Props) {
  const baseName = slug(paletteName);
  const hasColors = colors.length > 0;

  /** 1. CSS custom properties */
  function exportCSS() {
    const lines = colors.map((c, i) => `  --color-${i + 1}: ${c};`);
    const css = `/* CSS custom properties */\n:root {\n${lines.join("\n")}\n}\n`;
    downloadFile(css, `${baseName}.css`, "text/css");
  }

  /** 2. Tailwind CSS config object */
  function exportTailwind() {
    const colorObj = colors.reduce(
      (acc, c, i) => ({ ...acc, [i + 1]: c }),
      {} as Record<number, string>
    );
    const configObject = {
      theme: {
        extend: {
          colors: {
            [baseName]: colorObj,
          },
        },
      },
    };
    const config = `/** Tailwind CSS config object */\nmodule.exports = ${JSON.stringify(configObject, null, 2)};\n`;
    downloadFile(config, `tailwind-${baseName}.js`, "text/javascript");
  }

  /** 3. SCSS variables */
  function exportSCSS() {
    const vars = colors.map((c, i) => `$color-${i + 1}: ${c};`).join("\n");
    const scss = `/* SCSS variables */\n${vars}\n`;
    downloadFile(scss, `${baseName}.scss`, "text/x-scss");
  }

  /** 4. JSON array */
  function exportJSON() {
    const json = JSON.stringify(colors, null, 2);
    downloadFile(json, `${baseName}.json`, "application/json");
  }

  /** 5. Downloadable PNG swatch image with hex codes displayed */
  function exportPNG() {
    if (colors.length === 0) return;
    const scale = 2;
    const padding = 24;
    const titleHeight = 28;
    const swatchSize = 72;
    const swatchGap = 12;
    const hexHeight = 18;
    const rowHeight = swatchSize + hexHeight + 8;
    const cols = Math.min(colors.length, 5);
    const rows = Math.ceil(colors.length / cols);
    const width = padding * 2 + cols * swatchSize + (cols - 1) * swatchGap;
    const height =
      padding + titleHeight + 12 + rows * rowHeight + (rows - 1) * swatchGap;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#1e293b";
    ctx.font = "600 14px ui-monospace, monospace";
    ctx.fillText(paletteName, padding, padding + 20);
    colors.forEach((hex, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (swatchSize + swatchGap);
      const y = padding + titleHeight + 12 + row * (rowHeight + swatchGap);
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, swatchSize, swatchSize);
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.strokeRect(x, y, swatchSize, swatchSize);
      const textColor = colord(hex).isDark() ? "#ffffff" : "#000000";
      ctx.fillStyle = textColor;
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(hex, x + swatchSize / 2, y + swatchSize + 14);
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}-swatches.png`;
    a.click();
  }

  if (!hasColors) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
        Export:
      </span>
      <button
        type="button"
        onClick={exportCSS}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="CSS custom properties"
      >
        CSS
      </button>
      <button
        type="button"
        onClick={exportTailwind}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="Tailwind CSS config object"
      >
        Tailwind
      </button>
      <button
        type="button"
        onClick={exportSCSS}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="SCSS variables"
      >
        SCSS
      </button>
      <button
        type="button"
        onClick={exportJSON}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="JSON array"
      >
        JSON
      </button>
      <button
        type="button"
        onClick={exportPNG}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="PNG swatch image with hex codes"
      >
        PNG
      </button>
    </div>
  );
}
