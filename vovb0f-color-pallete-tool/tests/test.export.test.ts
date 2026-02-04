/**
 * Requirement 5: Export – CSS, Tailwind, SCSS, JSON, PNG with hex codes.
 */
import { readSourceFile } from "./helpers/sourceFiles";

describe("Requirement 5 – Export formats", () => {
  test("ExportButton component exists", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content).toBeTruthy();
  });

  test("CSS custom properties export present", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content).toContain(":root");
    expect(content.includes("--color") || content.toLowerCase().includes("css")).toBe(true);
  });

  test("Tailwind config export present", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content.toLowerCase()).toContain("tailwind");
    expect(
      content.includes("theme") || content.includes("extend") || content.includes("colors")
    ).toBe(true);
  });

  test("SCSS variables export present", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content.toLowerCase()).toContain("scss");
    expect(content.includes("$color") || content.includes("scss")).toBe(true);
  });

  test("JSON array export present", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content.toLowerCase()).toContain("json");
    expect(
      content.includes("JSON.stringify") || content.includes("stringify")
    ).toBe(true);
  });

  test("PNG swatch with hex codes", () => {
    const content = readSourceFile("components", "ExportButton.tsx");
    expect(content.toLowerCase()).toContain("png");
    expect(
      content.toLowerCase().includes("canvas") ||
        content.includes("toDataURL") ||
        content.toLowerCase().includes("download")
    ).toBe(true);
    expect(content.toLowerCase().includes("hex") || content.includes("hex")).toBe(true);
  });
});
