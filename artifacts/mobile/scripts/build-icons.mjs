#!/usr/bin/env node
/**
 * Generate every shipped icon from Casparel's canonical geometric mark.
 *
 * The web app's public brand asset is the single vector source. Generating
 * mobile and desktop artwork directly from it prevents platform branding from
 * drifting to an unrelated illustration and keeps every size crisp.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const REPO = path.resolve(MOBILE, "..", "..");
const IMAGES = path.join(MOBILE, "assets", "images");
const SOURCE = path.resolve(MOBILE, "..", "app", "public", "brand", "casparel-mark.svg");
const DESKTOP_BUILD = path.resolve(MOBILE, "..", "desktop", "build");
const DESKTOP_ICON_SET = path.join(DESKTOP_BUILD, "icons");
const SIZE = 1024;
const ICON_BACKGROUND = "#f8f7f4";
const LINUX_ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

const outputs = [
  {
    file: path.join(IMAGES, "brand-mark.png"),
    markScale: 1,
    label: "transparent in-app brand mark",
  },
  {
    file: path.join(IMAGES, "icon.png"),
    markScale: 0.7,
    background: ICON_BACKGROUND,
    opaque: true,
    label: "iOS / web icon",
  },
  {
    file: path.join(IMAGES, "adaptive-icon.png"),
    markScale: 0.58,
    label: "Android adaptive foreground",
  },
  {
    file: path.join(IMAGES, "splash-icon.png"),
    markScale: 0.54,
    label: "splash logo",
  },
  {
    file: path.join(DESKTOP_BUILD, "icon.png"),
    markScale: 0.7,
    background: ICON_BACKGROUND,
    cornerRadius: 0.2,
    label: "desktop icon",
  },
  ...LINUX_ICON_SIZES.map((size) => ({
    file: path.join(DESKTOP_ICON_SET, `${size}x${size}.png`),
    markScale: 0.7,
    background: ICON_BACKGROUND,
    cornerRadius: 0.2,
    size,
    label: `Linux ${size}px icon`,
  })),
];

function roundedBackground(edge, colour, radiusRatio) {
  const radius = Math.round(edge * radiusRatio);
  return Buffer.from(
    `<svg width="${edge}" height="${edge}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${edge}" height="${edge}" rx="${radius}" fill="${colour}"/>` +
      `</svg>`,
  );
}

async function render(output) {
  const edge = output.size ?? SIZE;
  const markEdge = Math.round(edge * output.markScale);
  const offset = Math.round((edge - markEdge) / 2);
  const mark = await sharp(SOURCE, { density: 384 })
    .resize(markEdge, markEdge, { fit: "contain" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const canvas = output.cornerRadius
    ? sharp(roundedBackground(edge, output.background, output.cornerRadius), { density: 96 })
        .resize(edge, edge)
    : sharp({
        create: {
          width: edge,
          height: edge,
          channels: 4,
          background: output.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
      });

  let pipeline = canvas.composite([{ input: mark, left: offset, top: offset }]);
  if (output.opaque) {
    pipeline = pipeline
      .flatten({ background: output.background })
      .removeAlpha();
  }
  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function samePixels(left, right) {
  try {
    const [a, b] = await Promise.all([
      sharp(left).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(right).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    return (
      a.info.width === b.info.width &&
      a.info.height === b.info.height &&
      a.info.channels === b.info.channels &&
      a.data.equals(b.data)
    );
  } catch {
    return false;
  }
}

async function main() {
  const check = process.argv.includes("--check");
  if (!fs.existsSync(SOURCE)) throw new Error(`Source mark missing: ${SOURCE}`);

  let changed = 0;
  for (const output of outputs) {
    const bytes = await render(output);
    const existing = fs.existsSync(output.file) ? fs.readFileSync(output.file) : null;
    const relative = path.relative(REPO, output.file);
    // libvips/zlib can encode the same PNG pixels into different compressed
    // bytes on macOS and Ubuntu. CI protects the artwork, so check decoded
    // dimensions and RGBA pixels; normal generation still avoids rewrites
    // only when the file bytes are already identical on the current host.
    const matches = existing && (check
      ? await samePixels(existing, bytes)
      : existing.equals(bytes));
    if (matches) {
      console.log(`  unchanged  ${relative}  (${output.label})`);
      continue;
    }
    changed += 1;
    if (check) {
      console.error(`  STALE      ${relative}  (${output.label})`);
      continue;
    }
    fs.mkdirSync(path.dirname(output.file), { recursive: true });
    fs.writeFileSync(output.file, bytes);
    console.log(`  wrote      ${relative}  (${output.label})`);
  }

  if (check && changed > 0) {
    throw new Error(`${changed} icon(s) no longer match the canonical Casparel mark`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
