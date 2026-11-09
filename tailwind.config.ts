import type { Config } from "tailwindcss";
import defaults from "tailwindcss/colors";

/** Light surfaces -> navy ink. Index = the dark-first class the code uses (gray-950 was the darkest card). */
const LIGHT_GRAY = {
  50: "#0F1C45",
  100: "#17275A",
  200: "#22346B",
  300: "#33467D",
  400: "#55668F",
  500: "#7182A8",
  600: "#97A6C6",
  700: "#C3CEE6",
  800: "#DCE4F4",
  900: "#EEF3FC",
  950: "#FFFFFF",
};

type Scale = Record<string, string>;
/** Dark-first tints (800-950 backgrounds) become light tints; light text shades (50-400) become dark. 500-700 fills stay. */
function adapt(c: Scale): Scale {
  return {
    50: c[950], 100: c[900], 200: c[800], 300: c[700], 400: c[600],
    500: c[500], 600: c[600], 700: c[700],
    800: c[200], 900: c[100], 950: c[50],
  };
}
const ADAPTED = Object.fromEntries(
  (["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "slate", "zinc", "neutral", "stone"] as const)
    .map((k) => [k, adapt(defaults[k] as Scale)]),
);

const config: Config = {
  darkMode: ["class"], // unused: the app has one light theme
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ONE theme: light, premium blue (iOS app). The codebase was written dark-first (text-white,
        // bg-gray-950 cards, *-400 accent text on *-900 tints), so the palette is adapted here
        // instead of rewriting 125 files: gray is inverted (950 = white card ... 50 = navy ink),
        // `white` is the ink colour, and chromatic scales swap their dark-tint / light-text ends.
        // Solid fills that need real white text use `text-on-color`.
        gray: LIGHT_GRAY,
        white: "#0F1C45",
        "on-color": "#FFFFFF",
        ...ADAPTED,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      padding: {
        "safe-top": "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        "safe-left": "env(safe-area-inset-left, 0px)",
        "safe-right": "env(safe-area-inset-right, 0px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
