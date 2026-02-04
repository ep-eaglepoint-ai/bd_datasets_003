/**
 * Requirement 2: Image upload and extract dominant colors; Vibrant, Muted, Dominant modes.
 */
import { readSourceFile } from "./helpers/sourceFiles";

describe("Requirement 2 – Image Palette Extractor", () => {
  test("ImagePaletteExtractor component exists", () => {
    const content = readSourceFile("components", "ImagePaletteExtractor.tsx");
    expect(content).toBeTruthy();
  });

  test("extraction modes Vibrant, Muted, Dominant present", () => {
    const content = readSourceFile("components", "ImagePaletteExtractor.tsx");
    expect(content).toContain("Vibrant");
    expect(content).toContain("Muted");
    expect(content).toContain("Dominant");
  });

  test("extractColors API exists", () => {
    const content = readSourceFile("app", "api", "extractColors", "route.ts");
    expect(content.includes("extractColors") || content.includes("Vibrant")).toBe(true);
  });

  test("API uses node-vibrant", () => {
    const content = readSourceFile("app", "api", "extractColors", "route.ts");
    expect(
      content.toLowerCase().includes("vibrant") || content.includes("Vibrant")
    ).toBe(true);
  });

  test("supports image upload and preview in UI", () => {
    const content = readSourceFile("components", "ImagePaletteExtractor.tsx");
    expect(content.toLowerCase()).toContain("file");
    expect(
      content.toLowerCase().includes("upload") || content.toLowerCase().includes("image")
    ).toBe(true);
    expect(
      content.toLowerCase().includes("preview") ||
        content.includes("src=") ||
        content.includes("imagePreview")
    ).toBe(true);
  });
});
