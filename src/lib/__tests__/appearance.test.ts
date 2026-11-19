import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appearanceColors, appearanceVariables, darkVariables, lightVariables } from "../theme-palette";
import { defaultAppearanceFor, isAppearance } from "../appearance";

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

describe("Appearance palettes (light premium blue + dark)", () => {
  it("preserves the existing light surfaces and navy text", () => {
    expect(lightVariables["--hrms-gray-950"]).toBe("255 255 255");
    expect(lightVariables["--hrms-gray-900"]).toBe("238 243 252");
    expect(lightVariables["--hrms-ink"]).toBe("15 28 69");
  });
  it("restores dark surfaces and light text, declared after light, and keeps on-colour white", () => {
    expect(Object.keys(appearanceVariables)).toEqual([":root, .light", ".dark"]);
    expect(Object.keys(lightVariables)).toEqual(Object.keys(darkVariables));
    expect(darkVariables["--hrms-gray-950"]).toBe("3 7 18");
    expect(darkVariables["--hrms-ink"]).toBe("249 250 251");
    expect(appearanceColors["on-color"]).toBe("#FFFFFF");
    expect(appearanceColors.gray[950]).toContain("<alpha-value>");
  });
  it("provides every palette variable with valid channels", () => {
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
  it("keeps the dark-first text shades (gray-500, every -300 / -400) readable on a white card", () => {
    const root = lightVariables;
    const white = root["--hrms-gray-950"];
    expect(contrast(root["--hrms-gray-500"], white)).toBeGreaterThanOrEqual(4.5);
    const hues = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky",
      "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];
    for (const hue of hues) {
      for (const shade of [300, 400]) {
        expect(contrast(root[`--hrms-${hue}-${shade}`], white), `${hue}-${shade}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("never puts ink (`text-white`) on a solid colour fill; white labels use `text-on-color`", () => {
    const offenders: string[] = [];
    const fill = /\bbg-(primary|black|(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(500|600|700))(?![/\d])/;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!["api", "__tests__", "email-templates"].includes(entry.name)) walk(full);
        } else if (entry.name.endsWith(".tsx")) {
          readFileSync(full, "utf8").split("\n").forEach((line, i) => {
            for (const m of Array.from(line.matchAll(/className="([^"]*)"/g))) {
              if (fill.test(m[1]) && /(^|\s)text-white(?![/\w-])/.test(m[1])) offenders.push(`${full}:${i + 1}`);
            }
          });
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
  it("starts everyone on System except the two accounts pinned to Light", () => {
    expect(defaultAppearanceFor("angch@tertiaryinfotech.com")).toBe("light");
    expect(defaultAppearanceFor(" TanSC@tertiaryinfotech.com ")).toBe("light");
    expect(defaultAppearanceFor("someone@tertiaryinfotech.com")).toBe("system");
    expect(defaultAppearanceFor(null)).toBe("system");
    expect(isAppearance("system")).toBe(true);
    expect(isAppearance("sepia")).toBe(false);
  });
});
