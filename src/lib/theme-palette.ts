import defaults from "tailwindcss/colors";

type Scale = Record<string, string>;
const LIGHT_GRAY: Scale = {
  50: "#0F1C45", 100: "#17275A", 200: "#22346B", 300: "#2A3C70",
  // 400 = secondary text (7.5:1 on white), 500 = tertiary text (5.6:1), 600 = decoration only,
  // 700 / 800 = input and card borders, 900 = inset / hover tint, 950 = card.
  400: "#43547E", 500: "#56678F", 600: "#8090B5", 700: "#B3C0DD",
  800: "#D0DAEE", 900: "#EEF3FC", 950: "#FFFFFF",
};
const SCALES = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "slate", "zinc", "neutral", "stone"] as const;

/**
 * ONE theme: light premium blue (iOS app). The code is dark-first (text-white, bg-gray-950
 * cards, *-400 text on *-900 tints), so the palette is adapted: gray is inverted (950 = white
 * card ... 50 = navy ink), `white` is the ink colour, and chromatic scales swap their
 * dark-tint / light-text ends. Solid fills that need real white text use `text-on-color`.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast of a colour against a white card. */
function onWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * `-400` and `-300` are the dark-first TEXT/ICON shades, so both must read on a white card
 * (4.5:1). Default 600 passes for red/blue/indigo/violet/purple/fuchsia/pink/rose; the lighter
 * hues (amber, yellow, orange, lime, green, emerald, teal, cyan, sky) step down to 700/800.
 */
function adapt(c: Scale): Scale {
  const dim = onWhite(c[600]) < 4.5;
  return { 50: c[950], 100: c[900], 200: c[800], 300: dim ? c[800] : c[700], 400: dim ? c[700] : c[600],
    500: c[500], 600: c[600], 700: c[700], 800: c[200], 900: c[100], 950: c[50] };
}

function channels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

function variables() {
  const scales: Record<string, Scale> = { gray: LIGHT_GRAY };
  for (const name of SCALES) scales[name] = adapt(defaults[name]);
  const result: Record<string, string> = { "--hrms-ink": channels("#0F1C45") };
  for (const [name, scale] of Object.entries(scales)) {
    for (const [shade, hex] of Object.entries(scale)) result[`--hrms-${name}-${shade}`] = channels(hex);
  }
  return result;
}

function scaleColors(name: string) {
  return Object.fromEntries(Object.keys(LIGHT_GRAY).map((shade) => [shade, `rgb(var(--hrms-${name}-${shade}) / <alpha-value>)`]));
}

export const appearanceVariables = { ":root": variables() };
export const appearanceColors = {
  gray: scaleColors("gray"),
  white: "rgb(var(--hrms-ink) / <alpha-value>)",
  "on-color": "#FFFFFF",
  ...Object.fromEntries(SCALES.map((name) => [name, scaleColors(name)])),
};
