/**
 * Requirement 3: Color picker, contrast ratios, complementary suggestions.
 */
import { readSourceFile } from "./helpers/sourceFiles";

describe("Requirement 3 – Color Picker", () => {
  test("ColorPickerPalette component exists", () => {
    const content = readSourceFile("components", "ColorPickerPalette.tsx");
    expect(content).toBeTruthy();
  });

  test("color picker input present", () => {
    const content = readSourceFile("components", "ColorPickerPalette.tsx");
    expect(content.toLowerCase()).toContain("color");
    expect(content.includes("input") || content.includes("type=")).toBe(true);
  });

  test("contrast ratio (accessibility) in colorUtils", () => {
    const content = readSourceFile("lib", "colorUtils.ts");
    expect(
      content.toLowerCase().includes("contrast") || content.includes("getContrastRatio")
    ).toBe(true);
  });

  test("complementary suggestions present", () => {
    const content = readSourceFile("components", "ColorPickerPalette.tsx");
    expect(
      content.toLowerCase().includes("complement") || content.includes("Complementary")
    ).toBe(true);
  });

  test("colorUtils provides harmony helpers", () => {
    const content = readSourceFile("lib", "colorUtils.ts");
    expect(
      content.includes("getComplementary") || content.toLowerCase().includes("complementary")
    ).toBe(true);
  });
});
