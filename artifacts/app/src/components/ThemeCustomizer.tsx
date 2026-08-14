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

const DEFAULT_COLORS: InterfaceColors = {
  background: "#f4f6fb",
  surface: "#ffffff",
  primary: "#163a8a",
  accent: "#dbeafe",
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

function contrastingMutedForeground(hex: string) {
  return relativeLuminance(hex) <= 0.179 ? "0 0% 82%" : "225 10% 36%";
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
  const surfaceMutedForeground = contrastingMutedForeground(colors.surface);
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
    // Unframed secondary text sits on the page canvas, so its contrast follows
    // the page background. Cards and other surfaces provide their own text
    // colors locally.
    "--muted-foreground": backgroundForeground,
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
