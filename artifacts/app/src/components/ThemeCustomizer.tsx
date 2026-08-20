import { useEffect, useLayoutEffect, useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/edu-ds/components/ui/dialog";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";

const STORAGE_KEY_PREFIX = "schoolar_interface_colors";
const LAST_COLORS_KEY = "schoolar_interface_colors:last";
const THEME_CHANGE_EVENT = "schoolar-interface-colors-change";

/**
 * Apply the most-recently-saved colors immediately, before the user record
 * loads from the API.  Called once at module import time so there is no flash
 * of default colors during the initial /me round-trip.
 */
export function applyLastSavedColors() {
  try {
    const raw = localStorage.getItem(LAST_COLORS_KEY);
    if (raw) applyColors({ ...DEFAULT_COLORS, ...JSON.parse(raw) });
  } catch {
    /* ignore */
  }
}

type InterfaceColors = {
  background: string;
  surface: string;
  primary: string;
  accent: string;
};

/**
 * The design system's own light palette, mirrored from
 * artifacts/schoolar-edu/tokens.json (color.light background / card / primary /
 * accent).
 *
 * applyColors writes these onto :root's inline style, which outranks every rule
 * in the generated stylesheet, so any value here that is not the token value
 * silently replaces the design system with a second palette for accounts that
 * never opened the picker. Keep them in step with tokens.json.
 */
const DEFAULT_COLORS: InterfaceColors = {
  background: "#f8f7f4",
  surface: "#ffffff",
  primary: "#1e40af",
  accent: "#0d9488",
};

/** Restore the signed-out interface without deleting account-specific colors. */
export function applyDefaultColors() {
  localStorage.removeItem(LAST_COLORS_KEY);
  applyColors(DEFAULT_COLORS);
}

const COLOR_FIELDS: Array<{
  key: keyof InterfaceColors;
  label: string;
  description: string;
}> = [
  {
    key: "background",
    label: "Page background",
    description: "The main workspace canvas.",
  },
  {
    key: "surface",
    label: "Cards and panels",
    description: "Cards, dialogs, and menus.",
  },
  {
    key: "primary",
    label: "Brand color",
    description: "Buttons, links, and focus rings.",
  },
  {
    key: "accent",
    label: "Accent color",
    description: "Selected and highlighted items.",
  },
];

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
  const number = Number.parseInt(normalized, 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function hexToHsl(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 1000) / 10}% ${Math.round(lightness * 1000) / 10}%`;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastingForeground(hex: string) {
  const luminance = relativeLuminance(hex);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "0 0% 100%" : "225 21.1% 7.5%";
}

/** A little headroom over the 4.5:1 text floor, so rounding cannot cross it. */
const MIN_MUTED_CONTRAST = 5;

/**
 * A grey that still reads as *secondary* text on every surface it can land on.
 *
 * Two fixed greys cannot cover an arbitrary palette: a mid-tone surface leaves
 * both of them under 2:1, and `--muted-foreground` has to hold up against the
 * card surface as well as the page canvas, because portalled overlays (dialogs,
 * popovers, selects) render outside `.ambient-copy-contrast` and so never get
 * the per-surface re-resolution in the app stylesheet. This walks the grey axis
 * and returns the quietest value that clears the floor against all of them, so
 * the muted/body hierarchy survives a custom palette instead of collapsing onto
 * `--foreground`.
 */
function readableMutedForeground(...surfaceHexes: string[]) {
  const surfaces = surfaceHexes.map(relativeLuminance);
  const worst = (lightness: number) =>
    Math.min(
      ...surfaces.map((surface) =>
        contrastRatio(hslChannelsToLuminance(0, 0, lightness), surface),
      ),
    );
  let quietest: { lightness: number; ratio: number } | null = null;
  let strongest = { lightness: 0.5, ratio: 0 };
  for (let step = 0; step <= 200; step++) {
    const lightness = step / 200;
    const ratio = worst(lightness);
    if (ratio > strongest.ratio) strongest = { lightness, ratio };
    if (ratio >= MIN_MUTED_CONTRAST && (!quietest || ratio < quietest.ratio))
      quietest = { lightness, ratio };
  }
  // Opposite-polarity surfaces can leave nothing clearing the floor on both;
  // then the best available worst case is the honest answer.
  const chosen = quietest ?? strongest;
  return `0 0% ${Math.round(chosen.lightness * 1000) / 10}%`;
}

/** WCAG contrast ratio between two luminances. */
function contrastRatio(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const MIN_TEXT_CONTRAST = 4.5;

function hslChannelsToLuminance(hue: number, saturation: number, l: number) {
  // Minimal HSL to linear-luminance conversion, enough to score a candidate.
  const c = (1 - Math.abs(2 * l - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  ).map((channel) => {
    const value = channel + m;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The account's own primary, moved along the lightness axis until it is
 * readable as text on this palette.
 *
 * `--primary` has two jobs: it fills the sidebar and buttons, where a deep
 * navy is exactly right, and it tints text and icons on cards, where that same
 * navy on a dark surface measures under 2:1. Since users pick their own
 * colours, no single value can serve both. This keeps the hue and saturation
 * they chose, so the interface still reads as theirs, and only lifts or drops
 * the lightness far enough to clear 4.5:1 against both the page background and
 * the card surface.
 */
function readableTextTint(tint: string, background: string, surface: string) {
  const [hue, saturationPercent, lightnessPercent] = hexToHsl(tint)
    .replace(/%/g, "")
    .split(" ")
    .map(Number);
  const saturation = saturationPercent / 100;
  const surfaces = [
    relativeLuminance(background),
    relativeLuminance(surface),
  ];
  const scores = (l: number) => {
    const candidate = hslChannelsToLuminance(hue, saturation, l);
    return Math.min(...surfaces.map((s) => contrastRatio(candidate, s)));
  };

  const start = lightnessPercent / 100;
  if (scores(start) >= MIN_TEXT_CONTRAST) return hexToHsl(tint);

  // Walk toward whichever end of the lightness axis the surfaces leave room in,
  // in small steps, and stop at the first value that clears the floor.
  const towardLight = Math.max(...surfaces) < 0.4;
  for (let step = 1; step <= 20; step++) {
    const l = towardLight
      ? Math.min(0.97, start + step * 0.04)
      : Math.max(0.05, start - step * 0.04);
    if (scores(l) >= MIN_TEXT_CONTRAST) {
      return `${hue} ${saturationPercent}% ${Math.round(l * 1000) / 10}%`;
    }
  }
  // Nothing on this hue works, so fall back to plain contrast against the page.
  return contrastingForeground(background);
}

/**
 * How far a hairline has to separate itself from the surface it sits on.
 *
 * 1.3:1, which is what the design system's own tokens measure: the light
 * border is 1.27:1 against the page and 1.40:1 against a card, the dark one
 * 1.57:1 and 1.31:1. Below this a divider disappears; much above it and every
 * card is drawn in outline rather than resting on the page.
 */
const MIN_SEPARATOR_CONTRAST = 1.3;

/**
 * The hairline for this palette: visible on every surface, loud on none.
 *
 * `--border` and `--input` were the two tokens applyColors never wrote, and a
 * variable that is never written keeps whatever `:root` says -- which is the
 * *light* theme's near-white `30 14.7% 86.7%`, because the palette is applied
 * as inline custom properties rather than by adding `.dark`. So an account
 * that chose a dark background got a near-white line around every card, input,
 * table row and separator in the product, at about 12:1 against the surface it
 * was supposed to quietly delimit.
 *
 * It went unseen for as long as it did because a border is one pixel wide, and
 * a contrast audit looks at text. The seating chart's grid draws its dot
 * pattern with `hsl(var(--border))` as a *background*, which is the single
 * place in the app where the border colour is wide enough for an audit to
 * sample -- 57 findings on one page, all of them the same missing line.
 *
 * Same shape as readableMutedForeground: walk the lightness axis away from the
 * surfaces and stop at the first value that separates from all of them. The
 * hue and saturation come from the page background, so the line carries the
 * palette's own tint rather than reading as a grey stripe across it.
 */
function separatorFor(...surfaceHexes: string[]) {
  const [hue, saturationPercent] = hexToHsl(surfaceHexes[0])
    .replace(/%/g, "")
    .split(" ")
    .map(Number);
  // Capped: a vivid canvas would otherwise draw every divider in full colour.
  const saturation = Math.min(saturationPercent, 18) / 100;
  const surfaces = surfaceHexes.map(relativeLuminance);
  const worst = (lightness: number) =>
    Math.min(
      ...surfaces.map((surface) =>
        contrastRatio(hslChannelsToLuminance(hue, saturation, lightness), surface),
      ),
    );

  // Outward from where the surfaces themselves sit, toward whichever end of
  // the axis has room left in it.
  const lightnesses = surfaceHexes.map(
    (hex) => Number(hexToHsl(hex).replace(/%/g, "").split(" ")[2]) / 100,
  );
  const towardLight = Math.max(...surfaces) < 0.4;
  const from = towardLight ? Math.max(...lightnesses) : Math.min(...lightnesses);
  let best = { lightness: from, ratio: 0 };
  for (let step = 1; step <= 60; step++) {
    const lightness = towardLight
      ? Math.min(1, from + step * 0.012)
      : Math.max(0, from - step * 0.012);
    const ratio = worst(lightness);
    if (ratio > best.ratio) best = { lightness, ratio };
    if (ratio >= MIN_SEPARATOR_CONTRAST) {
      return `${hue} ${Math.round(saturation * 1000) / 10}% ${Math.round(lightness * 1000) / 10}%`;
    }
  }
  // Surfaces at opposite ends leave no single line that separates from both;
  // the most visible one available is the honest answer.
  return `${hue} ${Math.round(saturation * 1000) / 10}% ${Math.round(best.lightness * 1000) / 10}%`;
}

// The two destructive reds from the design tokens, as HSL channels.
const DESTRUCTIVE_TEXT_ON_LIGHT = "0 73.7% 41.8%"; // #b91c1c
const DESTRUCTIVE_TEXT_ON_DARK = "0 90.6% 70.8%"; // #f87171
const DESTRUCTIVE_TEXT_LUMINANCE = {
  onLight: relativeLuminance("#b91c1c"),
  onDark: relativeLuminance("#f87171"),
};

/**
 * Pick the destructive red that stays readable against this palette.
 *
 * Error text, delete actions and the at-limit usage counts are the messages a
 * user least wants to miss, and a custom palette can put them on a surface the
 * token was not chosen for. The design system ships one red for light surfaces
 * and one for dark; this picks whichever holds up better against *both* the
 * page background and the card surface, since destructive text appears on each.
 */
function contrastingDestructiveText(background: string, surface: string) {
  const surfaces = [relativeLuminance(background), relativeLuminance(surface)];
  const worst = (candidate: number) =>
    Math.min(...surfaces.map((s) => contrastRatio(candidate, s)));
  return worst(DESTRUCTIVE_TEXT_LUMINANCE.onDark) >
    worst(DESTRUCTIVE_TEXT_LUMINANCE.onLight)
    ? DESTRUCTIVE_TEXT_ON_DARK
    : DESTRUCTIVE_TEXT_ON_LIGHT;
}

function applyColors(colors: InterfaceColors) {
  const root = document.documentElement;
  const background = hexToHsl(colors.background);
  const backgroundForeground = contrastingForeground(colors.background);
  const surface = hexToHsl(colors.surface);
  const surfaceForeground = contrastingForeground(colors.surface);
  const surfaceMutedForeground = readableMutedForeground(colors.surface);
  const primary = hexToHsl(colors.primary);
  const primaryForeground = contrastingForeground(colors.primary);
  const accent = hexToHsl(colors.accent);
  const accentForeground = contrastingForeground(colors.accent);

  const properties: Record<string, string> = {
    "--background": background,
    "--foreground": backgroundForeground,
    "--card": surface,
    "--card-foreground": surfaceForeground,
    "--surface-muted-foreground": surfaceMutedForeground,
    "--popover": surface,
    "--popover-foreground": surfaceForeground,
    "--secondary": surface,
    "--secondary-foreground": surfaceForeground,
    "--muted": surface,
    // Secondary text has to stay quieter than body text and remain readable on
    // both the page canvas and the card surface, because portalled overlays
    // inherit this value while rendering on a card. Setting it to the page
    // foreground made every "muted" string full strength, and unreadable
    // outright whenever the canvas and the surface differ in polarity.
    "--muted-foreground": readableMutedForeground(
      colors.background,
      colors.surface,
    ),
    "--primary": primary,
    "--primary-foreground": primaryForeground,
    "--ring": primary,
    "--sidebar": primary,
    "--sidebar-foreground": primaryForeground,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": primaryForeground,
    "--destructive-text": contrastingDestructiveText(
      colors.background,
      colors.surface,
    ),
    "--primary-text": readableTextTint(
      colors.primary,
      colors.background,
      colors.surface,
    ),
    "--accent": accent,
    "--accent-foreground": accentForeground,
    "--sidebar-accent": accent,
    "--sidebar-accent-foreground": accentForeground,
    // Every hairline in the product: card outlines, table rules, separators,
    // the seating grid's dot pattern. One value has to work on the page canvas
    // and on a card, so both are handed to it.
    "--border": separatorFor(colors.background, colors.surface),
    // Field outlines are the same line, and the design tokens give them the
    // same value in both themes.
    "--input": separatorFor(colors.background, colors.surface),
    // The sidebar is filled with the brand colour rather than a surface, so
    // its own divider is measured against that instead.
    "--sidebar-border": separatorFor(colors.primary),
    // A focus ring on the sidebar has to clear the brand fill it sits on, and
    // the foreground already contrasts with it by construction.
    "--sidebar-ring": primaryForeground,
  };
  for (const [property, value] of Object.entries(properties))
    root.style.setProperty(property, value);
}

function storageKey(accountId: number) {
  return STORAGE_KEY_PREFIX + ":" + accountId;
}

function loadColors(accountId?: number): InterfaceColors {
  if (!accountId) return DEFAULT_COLORS;
  try {
    const saved = localStorage.getItem(storageKey(accountId));
    return saved ? { ...DEFAULT_COLORS, ...JSON.parse(saved) } : DEFAULT_COLORS;
  } catch {
    return DEFAULT_COLORS;
  }
}

function saveColors(accountId: number, colors: InterfaceColors) {
  const json = JSON.stringify(colors);
  localStorage.setItem(storageKey(accountId), json);
  // Also save to the device-global key so colors can be restored before the
  // /me response arrives on the next page load.
  localStorage.setItem(LAST_COLORS_KEY, json);
  window.dispatchEvent(
    new CustomEvent<InterfaceColors>(THEME_CHANGE_EVENT, { detail: colors }),
  );
}

export default function ThemeCustomizer({
  accountId,
  showLabel = false,
  className = "",
}: {
  accountId?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<InterfaceColors>(DEFAULT_COLORS);
  const { data: accountPreferences } = useUserPreferences(Boolean(accountId));
  const updateAccountPreferences = useUpdateUserPreferences();

  useLayoutEffect(() => {
    const next = accountPreferences?.interfaceColors ?? loadColors(accountId);
    setColors(next);
    applyColors(next);
    if (accountId && accountPreferences?.interfaceColors) {
      saveColors(accountId, accountPreferences.interfaceColors);
    } else if (
      accountId &&
      accountPreferences &&
      JSON.stringify(next) !== JSON.stringify(DEFAULT_COLORS)
    ) {
      updateAccountPreferences.mutate({ interfaceColors: next });
    }
  }, [accountId, accountPreferences?.interfaceColors]);

  useLayoutEffect(() => {
    applyColors(colors);
  }, [colors]);

  // No cleanup-on-unmount reset: colors should stay applied during navigation.
  // Colors are only reset explicitly when the user clicks "Reset defaults".

  useEffect(() => {
    const syncFromTab = (event: StorageEvent) => {
      if (!accountId || event.key !== storageKey(accountId) || !event.newValue)
        return;
      try {
        setColors({ ...DEFAULT_COLORS, ...JSON.parse(event.newValue) });
      } catch {
        /* ignore invalid external values */
      }
    };
    const syncInPage = (event: Event) => {
      setColors((event as CustomEvent<InterfaceColors>).detail);
    };
    window.addEventListener("storage", syncFromTab);
    window.addEventListener(THEME_CHANGE_EVENT, syncInPage);
    return () => {
      window.removeEventListener("storage", syncFromTab);
      window.removeEventListener(THEME_CHANGE_EVENT, syncInPage);
    };
  }, [accountId]);

  function updateColors(next: InterfaceColors) {
    setColors(next);
    if (accountId) {
      saveColors(accountId, next);
      updateAccountPreferences.mutate({ interfaceColors: next });
    }
  }

  function resetColors() {
    updateColors(DEFAULT_COLORS);
  }

  if (!accountId) return null;

  return (
    <>
      <Button
        type="button"
        size={showLabel ? "sm" : "icon"}
        variant="ghost"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Customize interface colors"
        title="Customize interface colors"
      >
        <Palette className="size-4" />
        {showLabel && <span className="ml-2">Interface colors</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interface colors</DialogTitle>
            <DialogDescription>
              Choose your colors. Text contrast updates automatically for
              readability.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {COLOR_FIELDS.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div>
                  <Label htmlFor={`theme-${key}`}>{label}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {colors[key]}
                  </span>
                  <input
                    id={`theme-${key}`}
                    type="color"
                    value={colors[key]}
                    onChange={(event) =>
                      updateColors({ ...colors, [key]: event.target.value })
                    }
                    className="h-10 w-12 cursor-pointer rounded border bg-transparent p-1"
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetColors}>
              <RotateCcw className="mr-2 size-4" /> Reset defaults
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
