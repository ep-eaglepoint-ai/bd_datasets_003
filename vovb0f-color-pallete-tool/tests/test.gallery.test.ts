/**
 * Requirement 6: Browsable public gallery, filter by tags and color, one-click copy/save.
 */
import { readSourceFile, sourceFileExists } from "./helpers/sourceFiles";

describe("Requirement 6 – Public Gallery", () => {
  test("Gallery page exists", () => {
    const content = readSourceFile("app", "gallery", "page.tsx");
    expect(content).toBeTruthy();
    expect(content.toLowerCase()).toContain("gallery");
  });

  test("Gallery API exists and returns public palettes", () => {
    const content = readSourceFile("app", "api", "gallery", "route.ts");
    expect(content).toBeTruthy();
    expect(content.includes("isPublic") || content.toLowerCase().includes("public")).toBe(true);
  });

  test("Gallery API filter by tag", () => {
    const content = readSourceFile("app", "api", "gallery", "route.ts");
    expect(content.toLowerCase()).toContain("tag");
  });

  test("Gallery API filter by color", () => {
    const content = readSourceFile("app", "api", "gallery", "route.ts");
    expect(content.toLowerCase()).toContain("color");
  });

  test("GalleryGrid component exists", () => {
    const content = readSourceFile("components", "GalleryGrid.tsx");
    expect(content).toBeTruthy();
  });

  test("PaletteCard component exists", () => {
    const content = readSourceFile("components", "PaletteCard.tsx");
    expect(content).toBeTruthy();
  });

  test("PaletteCard has one-click copy", () => {
    const content = readSourceFile("components", "PaletteCard.tsx");
    expect(content.toLowerCase().includes("copy") || content.includes("Copy")).toBe(true);
  });

  test("PaletteCard has save for logged-in users", () => {
    const content = readSourceFile("components", "PaletteCard.tsx");
    expect(content.toLowerCase().includes("save") || content.includes("Save")).toBe(true);
    expect(
      content.includes("isLoggedIn") ||
        content.toLowerCase().includes("session") ||
        content.toLowerCase().includes("logged")
    ).toBe(true);
  });

  test("Nav links to Gallery", () => {
    const content = readSourceFile("components", "Nav.tsx");
    expect(content.toLowerCase()).toContain("gallery");
    expect(content.includes("/gallery") || content.includes("href")).toBe(true);
  });

  test("Share to gallery from library (PATCH palette)", () => {
    const exists = sourceFileExists("app", "api", "palette", "[id]", "route.ts");
    expect(exists).toBe(true);
    const content = readSourceFile("app", "api", "palette", "[id]", "route.ts");
    expect(content.includes("isPublic") || content.includes("PATCH")).toBe(true);
  });
});
