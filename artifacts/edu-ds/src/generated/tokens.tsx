/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f8f7f4",
      "foreground": "#1a1917",
      "card": "#ffffff",
      "cardForeground": "#1a1917",
      "popover": "#ffffff",
      "popoverForeground": "#1a1917",
      "primary": "#1e40af",
      "primaryForeground": "#ffffff",
      "secondary": "#eeeae4",
      "secondaryForeground": "#1a1917",
      "muted": "#eeeae4",
      "mutedForeground": "#6b6560",
      "accent": "#0d9488",
      "accentForeground": "#ffffff",
      "destructive": "#dc2626",
      "destructiveForeground": "#ffffff",
      "border": "#e2ddd8",
      "input": "#e2ddd8",
      "ring": "#1e40af",
      "chart1": "#1e40af",
      "chart2": "#0d9488",
      "chart3": "#d97706",
      "chart4": "#7c3aed",
      "chart5": "#059669",
      "sidebar": "#eeeae4",
      "sidebarForeground": "#3d3a36",
      "sidebarBorder": "#ddd9d3",
      "sidebarPrimary": "#1e40af",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#ddd9d3",
      "sidebarAccentForeground": "#1a1917",
      "sidebarRing": "#1e40af"
    },
    "dark": {
      "background": "#0f1117",
      "foreground": "#ede9e3",
      "card": "#1a1e2a",
      "cardForeground": "#ede9e3",
      "popover": "#1a1e2a",
      "popoverForeground": "#ede9e3",
      "primary": "#6096e8",
      "primaryForeground": "#0f1117",
      "secondary": "#272b38",
      "secondaryForeground": "#ede9e3",
      "muted": "#272b38",
      "mutedForeground": "#9b9590",
      "accent": "#2dd4bf",
      "accentForeground": "#0f1117",
      "destructive": "#991b1b",
      "destructiveForeground": "#fef2f2",
      "border": "#2e3240",
      "input": "#2e3240",
      "ring": "#6096e8",
      "chart1": "#6096e8",
      "chart2": "#2dd4bf",
      "chart3": "#fbbf24",
      "chart4": "#a78bfa",
      "chart5": "#34d399",
      "sidebar": "#141820",
      "sidebarForeground": "#ccc8c2",
      "sidebarBorder": "#2e3240",
      "sidebarPrimary": "#6096e8",
      "sidebarPrimaryForeground": "#0f1117",
      "sidebarAccent": "#272b38",
      "sidebarAccentForeground": "#ede9e3",
      "sidebarRing": "#6096e8"
    }
  },
  "fontFamily": {
    "sans": [
      "Plus Jakarta Sans",
      "sans-serif"
    ],
    "serif": [
      "Source Serif 4",
      "serif"
    ],
    "mono": [
      "JetBrains Mono",
      "monospace"
    ]
  },
  "radius": "0.5rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
