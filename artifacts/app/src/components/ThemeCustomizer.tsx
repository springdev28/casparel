import { useLayoutEffect, useState } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/edu-ds/components/ui/dialog';
import { Label } from '@workspace/edu-ds/components/ui/label';

const STORAGE_KEY = 'schoolar_interface_colors';

type InterfaceColors = {
  background: string;
  surface: string;
  primary: string;
  accent: string;
};

const DEFAULT_COLORS: InterfaceColors = {
  background: '#f8f7f3',
  surface: '#ffffff',
  primary: '#1e429f',
  accent: '#dff7f1',
};

const COLOR_FIELDS: Array<{ key: keyof InterfaceColors; label: string; description: string }> = [
  { key: 'background', label: 'Page background', description: 'The main workspace canvas.' },
  { key: 'surface', label: 'Cards and panels', description: 'Cards, dialogs, and menus.' },
  { key: 'primary', label: 'Brand color', description: 'Sidebar, buttons, and focus rings.' },
  { key: 'accent', label: 'Accent color', description: 'Selected and highlighted items.' },
];

function hexToRgb(hex: string) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
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
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
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
  return whiteContrast >= darkContrast ? '0 0% 100%' : '225 21.1% 7.5%';
}

function applyColors(colors: InterfaceColors) {
  const root = document.documentElement;
  const background = hexToHsl(colors.background);
  const backgroundForeground = contrastingForeground(colors.background);
  const surface = hexToHsl(colors.surface);
  const surfaceForeground = contrastingForeground(colors.surface);
  const primary = hexToHsl(colors.primary);
  const primaryForeground = contrastingForeground(colors.primary);
  const accent = hexToHsl(colors.accent);
  const accentForeground = contrastingForeground(colors.accent);

  const properties: Record<string, string> = {
    '--background': background,
    '--foreground': backgroundForeground,
    '--card': surface,
    '--card-foreground': surfaceForeground,
    '--popover': surface,
    '--popover-foreground': surfaceForeground,
    '--secondary': surface,
    '--secondary-foreground': surfaceForeground,
    '--muted': surface,
    '--muted-foreground': surfaceForeground,
    '--primary': primary,
    '--primary-foreground': primaryForeground,
    '--ring': primary,
    '--sidebar': primary,
    '--sidebar-foreground': primaryForeground,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': primaryForeground,
    '--accent': accent,
    '--accent-foreground': accentForeground,
    '--sidebar-accent': accent,
    '--sidebar-accent-foreground': accentForeground,
  };
  for (const [property, value] of Object.entries(properties)) root.style.setProperty(property, value);
}

function loadColors(): InterfaceColors {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_COLORS, ...JSON.parse(saved) } : DEFAULT_COLORS;
  } catch {
    return DEFAULT_COLORS;
  }
}

export default function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<InterfaceColors>(loadColors);

  useLayoutEffect(() => {
    applyColors(colors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  }, [colors]);

  function resetColors() {
    localStorage.removeItem(STORAGE_KEY);
    setColors(DEFAULT_COLORS);
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        className="fixed bottom-5 right-5 z-50 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Customize interface colors"
        title="Customize interface colors"
      >
        <Palette className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interface colors</DialogTitle>
            <DialogDescription>
              Choose your colors. Text contrast updates automatically for readability.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {COLOR_FIELDS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor={`theme-${key}`}>{label}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground uppercase">{colors[key]}</span>
                  <input
                    id={`theme-${key}`}
                    type="color"
                    value={colors[key]}
                    onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))}
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
            <Button type="button" onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
