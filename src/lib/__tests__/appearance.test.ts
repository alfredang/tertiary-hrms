import { describe, expect, it } from "vitest";
import { appearanceColors, appearanceVariables } from "../theme-palette";

function luminance(rgb: string) {
  const [r, g, b] = rgb.split(" ").map(Number).map((n) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Device appearance palettes", () => {
  it("preserves the existing light surfaces and navy text", () => {
    expect(appearanceVariables[":root"]["--hrms-gray-950"]).toBe("255 255 255");
    expect(appearanceVariables[":root"]["--hrms-gray-900"]).toBe("238 243 252");
    expect(appearanceVariables[":root"]["--hrms-ink"]).toBe("15 28 69");
  });
  it("restores dark surfaces and light text without changing on-colour white", () => {
    expect(appearanceVariables[".dark"]["--hrms-gray-950"]).toBe("3 7 18");
    expect(appearanceVariables[".dark"]["--hrms-ink"]).toBe("249 250 251");
    expect(appearanceColors["on-color"]).toBe("#FFFFFF");
    expect(appearanceColors.gray[950]).toContain("<alpha-value>");
  });
  it("provides every palette variable in both appearances with valid channels", () => {
    expect(Object.keys(appearanceVariables[":root"])).toEqual(Object.keys(appearanceVariables[".dark"]));
    for (const palette of Object.values(appearanceVariables)) {
      for (const value of Object.values(palette)) {
        expect(value).toMatch(/^\d+ \d+ \d+$/);
        expect(value.split(" ").map(Number).every((n) => n >= 0 && n <= 255)).toBe(true);
      }
    }
  });
  it("keeps primary text and common secondary labels readable on cards and page surfaces", () => {
    for (const palette of Object.values(appearanceVariables)) {
      for (const text of ["--hrms-ink", "--hrms-gray-300", "--hrms-gray-400"]) {
        for (const surface of ["--hrms-gray-950", "--hrms-gray-900"]) {
          expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
