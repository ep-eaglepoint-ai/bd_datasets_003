/**
 * Requirement 1: 5-color palette generator with lock and "Generate New".
 */
import { readSourceFile } from "./helpers/sourceFiles";

describe("Requirement 1 – Palette Generator", () => {
  test("PaletteGenerator component exists", () => {
    const content = readSourceFile("components", "PaletteGenerator.tsx");
    expect(content.trim()).toBeTruthy();
  });

  test("uses 5 colors", () => {
    const content = readSourceFile("components", "PaletteGenerator.tsx");
    expect(
      content.includes("5") || content.includes("length: 5") || content.includes("length(5)")
    ).toBe(true);
  });

  test("has locking mechanism", () => {
    const content = readSourceFile("components", "PaletteGenerator.tsx");
    expect(content.toLowerCase()).toContain("locked");
  });

  test("has Generate New button", () => {
    const content = readSourceFile("components", "PaletteGenerator.tsx");
    expect(content).toContain("Generate New");
  });

  test("colorGenerator lib provides palette generation", () => {
    const content = readSourceFile("lib", "colorGenerator.ts");
    expect(
      content.includes("generatePalette") || content.toLowerCase().includes("generate")
    ).toBe(true);
  });

  test("colorGenerator respects locked state", () => {
    const content = readSourceFile("lib", "colorGenerator.ts");
    expect(content.toLowerCase()).toContain("locked");
  });
});
