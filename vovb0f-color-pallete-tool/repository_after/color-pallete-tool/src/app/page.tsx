import PaletteGenerator from "@/components/PaletteGenerator";
import ImagePaletteExtractor from "@/components/ImagePaletteExtractor";
import ColorPickerPalette from "@/components/ColorPickerPalette";
import Nav from "@/components/Nav";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <Nav />
      <PaletteGenerator />
      <ImagePaletteExtractor />
      <ColorPickerPalette />
    </main>
  );
}
