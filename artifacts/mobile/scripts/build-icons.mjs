#!/usr/bin/env node
/**
 * Derives every platform icon Casparel ships from one drawing.
 *
 * `assets/images/icon-source.png` is the artwork as it was drawn: a blue
 * rounded square on a white page. That is a picture OF an app icon, not an app
 * icon, and shipping it as one is wrong on all three platforms:
 *
 *  • iOS applies its own rounded mask and rejects alpha. A baked-in rounded
 *    square leaves four white triangles inside Apple's corners, so the icon on
 *    the home screen is a rounded square framed by a second, lighter one.
 *  • Android masks the icon to whatever shape the launcher uses — circle,
 *    squircle, teardrop — and only guarantees the middle 66% survives. A
 *    full-bleed drawing loses the edges of the book.
 *  • macOS, Windows and Linux draw the icon over the user's wallpaper or a
 *    dark dock, where white corners read as a mistake rather than as a shape.
 *
 * So each platform gets what it actually asks for, from the same drawing:
 *
 *   icon.png          1024² opaque, full bleed, no corner radius   (iOS, web)
 *   adaptive-icon.png 1024² transparent, art inside the safe zone  (Android)
 *   splash-icon.png   1024² transparent, art with launch padding   (both)
 *   ../../desktop/build/icon.png
 *                     1024² rounded square on transparency         (desktop)
 *
 * The white page behind the drawing is removed by flooding inwards from the
 * four corners, which is what makes this safe to run on the artwork rather
 * than on a hand-cut cutout: the book's pages are white too, but they are
 * enclosed by the blue square, so the flood never reaches them.
 *
 * Usage:
 *   node artifacts/mobile/scripts/build-icons.mjs [--check]
 *
 * `--check` regenerates into memory and compares, so CI can prove the
 * committed icons still match the drawing they claim to come from.
 *
 * Requires a Chromium build for its canvas — the same one the web app's audit
 * scripts use (CHROMIUM_PATH overrides, /opt/pw-browsers/chromium is found
 * automatically, `npx playwright install chromium` is the fallback).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const IMAGES = path.join(MOBILE, "assets", "images");
const SOURCE = path.join(IMAGES, "icon-source.png");
const DESKTOP_ICON = path.resolve(
  MOBILE,
  "..",
  "desktop",
  "build",
  "icon.png",
);

const SIZE = 1024;

/**
 * The drawing's corner arcs meet its edges 224px in on a 1024px canvas. Scaled
 * about the centre by more than 1.147 those arcs pass outside the frame
 * entirely, so a full-bleed icon is the drawing's own pixels edge to edge
 * rather than the drawing composited onto a colour that has to match it. 1.16
 * clears that with room to spare and still leaves the book an 8% margin.
 */
const FULL_BLEED_SCALE = 1.16;

/**
 * Android guarantees only the centre 66% of an adaptive icon survives the
 * launcher's mask, and a drawing that exactly fills the safe circle touches
 * its edge on the diagonals. 0.68 of the square sits inside the guaranteed
 * region with a little air, which is what the platform's own icons do.
 */
const ADAPTIVE_SCALE = 0.68;
/** The launch screen is a logo on a page, not a full-bleed image. */
const SPLASH_SCALE = 0.62;
/** macOS reserves a margin around the icon so docked apps line up. */
const DESKTOP_SCALE = 0.92;

const outputs = [
  {
    file: path.join(IMAGES, "icon.png"),
    scale: FULL_BLEED_SCALE,
    background: "brand",
    // App Store Connect refuses an app icon that carries an alpha channel,
    // and it refuses it at upload — after the build, at the point where a
    // release is meant to be finished. A canvas always encodes RGBA, so this
    // one is re-encoded without the channel rather than left to whatever the
    // native build step decides to do with it.
    opaque: true,
    label: "iOS / web icon",
  },
  {
    file: path.join(IMAGES, "adaptive-icon.png"),
    scale: ADAPTIVE_SCALE,
    // Opaque rather than transparent, and the same colour the drawing's own
    // panel is: every launcher mask, and the parallax offset some of them
    // apply, then falls on one flat colour instead of on a seam between the
    // foreground's rounded corner and the background layer behind it.
    background: "brand",
    label: "Android adaptive foreground",
  },
  {
    file: path.join(IMAGES, "splash-icon.png"),
    scale: SPLASH_SCALE,
    background: null,
    label: "splash logo",
  },
  {
    file: DESKTOP_ICON,
    scale: DESKTOP_SCALE,
    background: null,
    label: "desktop icon",
  },
];

/** PNG chunk checksum. Written out rather than taken from zlib, which only
 * grew a crc32 late in Node 20 and this repo supports the whole line. */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let at = 0; at < bytes.length; at += 1) {
    crc = CRC_TABLE[(crc ^ bytes[at]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Re-encode an RGBA PNG as truecolour RGB, dropping the alpha channel.
 *
 * Only correct for an image that is already fully opaque — which is checked,
 * not assumed, because silently flattening a transparent icon onto black is a
 * worse outcome than failing.
 */
function stripAlpha(rgba, width, height) {
  const raw = Buffer.allocUnsafe(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    // Filter 0 (None). The icon is large flat colour, which deflate handles
    // well on its own; picking per-row filters would save a little space for
    // a lot of code in a file that runs four times a year.
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      if (rgba[from + 3] !== 255) {
        throw new Error(
          `pixel ${x},${y} is not opaque (alpha ${rgba[from + 3]}); ` +
            "this image cannot be flattened without changing it",
        );
      }
      const to = rowStart + 1 + x * 3;
      raw[to] = rgba[from];
      raw[to + 1] = rgba[from + 1];
      raw[to + 2] = rgba[from + 2];
    }
  }

  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: truecolour, no alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chromiumExecutable() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")
      : null,
    "/opt/pw-browsers/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * playwright-core is a tool here, not something the app depends on, so it is
 * resolved rather than declared — installed out of tree in CI exactly as the
 * web app's audits do it.
 */
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of ["playwright-core", "playwright"]) {
    try {
      return require(id);
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    "playwright-core is not installed. Install it out of tree:\n" +
      "  npm i --prefix /tmp/pw --no-save playwright\n" +
      "  NODE_PATH=/tmp/pw/node_modules node artifacts/mobile/scripts/build-icons.mjs",
  );
}

/**
 * The work itself, run inside the page: decode the drawing, flood the white
 * page away from the four corners, then redraw at the requested scale.
 *
 * Every step comes back as a base64 PNG. A step that has to end up opaque
 * also comes back as raw RGBA, because a canvas can only encode with an alpha
 * channel and dropping it has to happen in Node.
 */
/* c8 ignore start — runs in the browser, not in Node */
async function renderInPage({ sourceDataUrl, plan, size }) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("could not decode the source icon"));
    image.src = sourceDataUrl;
  });

  const base = document.createElement("canvas");
  base.width = image.width;
  base.height = image.height;
  const baseCtx = base.getContext("2d", { willReadFrequently: true });
  baseCtx.drawImage(image, 0, 0);

  const { width: w, height: h } = base;
  const pixels = baseCtx.getImageData(0, 0, w, h);
  const data = pixels.data;

  // "Page white", not "any light pixel": the book's pages are near-white too,
  // and the only thing keeping them is that the flood cannot reach them.
  const isPage = (i) =>
    data[i + 3] > 0 &&
    data[i] >= 236 &&
    data[i + 1] >= 236 &&
    data[i + 2] >= 236;

  const seen = new Uint8Array(w * h);
  const stack = [0, w - 1, (h - 1) * w, h * w - 1];
  while (stack.length) {
    const at = stack.pop();
    if (seen[at]) continue;
    seen[at] = 1;
    const i = at * 4;
    if (!isPage(i)) continue;
    data[i + 3] = 0;
    const x = at % w;
    const y = (at - x) / w;
    if (x > 0) stack.push(at - 1);
    if (x < w - 1) stack.push(at + 1);
    if (y > 0) stack.push(at - w);
    if (y < h - 1) stack.push(at + w);
  }

  // The flood stops on the first pixel that is not page white, which leaves
  // the drawing's own antialiased rim half white. Anything still touching a
  // cleared pixel is faded in proportion to how close to white it is, so the
  // edge reads as a clean curve rather than a light halo.
  const cleared = new Uint8Array(w * h);
  for (let at = 0; at < w * h; at += 1) cleared[at] = data[at * 4 + 3] === 0 ? 1 : 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = y * w + x;
      if (cleared[at]) continue;
      const touchesCleared =
        (x > 0 && cleared[at - 1]) ||
        (x < w - 1 && cleared[at + 1]) ||
        (y > 0 && cleared[at - w]) ||
        (y < h - 1 && cleared[at + w]);
      if (!touchesCleared) continue;
      const i = at * 4;
      const lightness = Math.min(data[i], data[i + 1], data[i + 2]);
      if (lightness < 200) continue;
      data[i + 3] = Math.round(data[i + 3] * (1 - (lightness - 200) / 55));
    }
  }
  baseCtx.putImageData(pixels, 0, 0);

  // The brand colour, read from the drawing rather than written down twice:
  // the most common fully opaque colour left after the page is gone.
  const counts = new Map();
  for (let at = 0; at < w * h; at += 1) {
    const i = at * 4;
    if (data[i + 3] < 255) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let brandKey = 0;
  let best = -1;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      brandKey = key;
    }
  }
  const brand =
    "#" + brandKey.toString(16).padStart(6, "0");

  const results = [];
  for (const step of plan) {
    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingQuality = "high";

    if (step.background === "brand") {
      ctx.fillStyle = brand;
      ctx.fillRect(0, 0, size, size);
    }

    // Scaling about the centre. At scale 1 with a brand background this is a
    // full-bleed square: the drawing's rounded corners fall onto the same
    // colour behind them, so the corner radius simply disappears.
    const drawn = size * step.scale;
    const offset = (size - drawn) / 2;
    ctx.drawImage(base, offset, offset, drawn, drawn);

    const png = out.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");

    let rgba = null;
    if (step.opaque) {
      const bytes = ctx.getImageData(0, 0, size, size).data;
      // btoa on a 4 MB string at once overflows the argument list, so the
      // binary string is built in chunks first.
      let binary = "";
      const CHUNK = 0x8000;
      for (let at = 0; at < bytes.length; at += CHUNK) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(at, at + CHUNK),
        );
      }
      rgba = btoa(binary);
    }

    results.push({ png, rgba });
  }

  return { brand, images: results };
}
/* c8 ignore stop */

async function main() {
  const check = process.argv.includes("--check");

  if (!fs.existsSync(SOURCE)) {
    console.error(`Source drawing missing: ${SOURCE}`);
    process.exit(1);
  }

  const { chromium } = loadPlaywright();
  const executablePath = chromiumExecutable();
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {},
  );

  let rendered;
  try {
    const page = await browser.newPage();
    const sourceDataUrl =
      "data:image/png;base64," + fs.readFileSync(SOURCE).toString("base64");
    rendered = await page.evaluate(renderInPage, {
      sourceDataUrl,
      plan: outputs.map(({ scale, background, opaque }) => ({
        scale,
        background,
        opaque: opaque === true,
      })),
      size: SIZE,
    });
  } finally {
    await browser.close();
  }

  let changed = 0;
  outputs.forEach((output, index) => {
    const step = rendered.images[index];
    const bytes = output.opaque
      ? stripAlpha(Buffer.from(step.rgba, "base64"), SIZE, SIZE)
      : Buffer.from(step.png, "base64");
    const relative = path.relative(path.resolve(MOBILE, "..", ".."), output.file);
    const existing = fs.existsSync(output.file)
      ? fs.readFileSync(output.file)
      : null;

    if (existing && existing.equals(bytes)) {
      console.log(`  unchanged  ${relative}  (${output.label})`);
      return;
    }

    changed += 1;
    if (check) {
      console.error(
        `  STALE      ${relative}  (${output.label}) — run: node artifacts/mobile/scripts/build-icons.mjs`,
      );
      return;
    }
    fs.writeFileSync(output.file, bytes);
    console.log(
      `  wrote      ${relative}  (${output.label}, ${(bytes.length / 1024).toFixed(0)} KB)`,
    );
  });

  console.log(`\nBrand colour read from the drawing: ${rendered.brand}`);

  // The Android background layer sits behind a foreground whose own panel is
  // this colour, so a mismatch shows as a ring around the icon on every
  // launcher that masks to a circle. Reading it from the drawing rather than
  // trusting the two to be kept in step by hand is the whole point.
  const appJsonPath = path.join(MOBILE, "app.json");
  const configured = JSON.parse(fs.readFileSync(appJsonPath, "utf8"))?.expo
    ?.android?.adaptiveIcon?.backgroundColor;
  if (configured && configured.toLowerCase() !== rendered.brand) {
    console.error(
      `\nandroid.adaptiveIcon.backgroundColor in app.json is ${configured}, ` +
        `but the drawing's panel is ${rendered.brand}.`,
    );
    process.exit(1);
  }

  if (check && changed > 0) {
    console.error(
      `\n${changed} icon(s) no longer match ${path.basename(SOURCE)}.`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
