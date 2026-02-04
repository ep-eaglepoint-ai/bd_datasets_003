import Nav from "@/components/Nav";

export default function GalleryPage() {
  return (
    <div className="p-8">
      <Nav />
      <h1 className="text-2xl font-bold mb-6">Gallery</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Public gallery of shared palettes.
      </p>
    </div>
  );
}
