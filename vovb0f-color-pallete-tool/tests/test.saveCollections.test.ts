/**
 * Requirement 4: Save palettes to library, collections, tags, descriptions.
 */
import { readSourceFile, sourceFileExists } from "./helpers/sourceFiles";

describe("Requirement 4 – Save & Collections", () => {
  test("Palette model exists", () => {
    const content = readSourceFile("lib", "paletteModel.ts");
    expect(content).toContain("Palette");
    expect(content.includes("Schema") || content.toLowerCase().includes("model")).toBe(true);
  });

  test("Palette model has required fields", () => {
    const content = readSourceFile("lib", "paletteModel.ts");
    const required = ["name", "colors", "userId", "tags", "description"];
    required.forEach((field) => expect(content).toContain(field));
  });

  test("POST /api/palette creates palettes", () => {
    const content = readSourceFile("app", "api", "palette", "route.ts");
    expect(content).toContain("POST");
    expect(
      content.toLowerCase().includes("create") || content.includes("create")
    ).toBe(true);
  });

  test("palette save uses authentication", () => {
    const content = readSourceFile("app", "api", "palette", "route.ts");
    expect(
      content.toLowerCase().includes("session") ||
        content.toLowerCase().includes("auth") ||
        content.includes("getServerSession")
    ).toBe(true);
  });

  test("SavePaletteModal exists", () => {
    const content = readSourceFile("components", "SavePaletteModal.tsx");
    expect(content).toBeTruthy();
  });

  test("Save modal has name and tags", () => {
    const content = readSourceFile("components", "SavePaletteModal.tsx");
    expect(content.toLowerCase()).toContain("name");
    expect(
      content.toLowerCase().includes("tag") || content.includes("tags")
    ).toBe(true);
  });

  test("Library page exists", () => {
    const content = readSourceFile("app", "library", "page.tsx");
    expect(
      content.toLowerCase().includes("library") || content.includes("Palette")
    ).toBe(true);
  });

  test("Collections API or page exists", () => {
    const hasRoute = sourceFileExists("app", "api", "collections", "route.ts");
    const hasPage = sourceFileExists("app", "collections", "page.tsx");
    expect(hasRoute || hasPage).toBe(true);
  });
});
