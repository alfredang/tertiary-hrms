/**
 * Upscale raw screenshots to App Store resolution (1290×2796)
 * using Lanczos3 resampling, then add the gradient marketing header.
 *
 * Usage:
 *   npx tsx scripts/enhance-screenshots.ts
 *
 * Output:
 *   screenshots/raw/04-employees.png  — upscaled (overwrites)
 *   screenshots/raw/05-profile.png    — upscaled (overwrites)
 *   screenshots/raw/06-payroll.png    — upscaled (overwrites)
 *   screenshots/with-headers/04-employees.png  — composited (overwrites)
 *   screenshots/with-headers/05-profile.png    — composited (overwrites)
 *   screenshots/with-headers/06-payroll.png    — composited (overwrites)
 */

import sharp from "sharp";
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const TARGET_W = 1290;
const TARGET_H = 2796;

const VIEWPORT = { width: 430, height: 932 };
const DEVICE_SCALE_FACTOR = 3;
const HEADER_HEIGHT_CSS = 80;

const FILES = [
  {
    file: "04-employees.png",
    header: "Staff Directory",
    subtitle: "Browse your team at a glance",
  },
  {
    file: "05-profile.png",
    header: "Your Profile",
    subtitle: "Personal & employment details",
  },
  {
    file: "06-payroll.png",
    header: "Payroll & Payslips",
    subtitle: "CPF breakdown, net pay & more",
  },
];

// ── Step 1: Upscale raw images with sharp ─────────────────────────────────

async function upscaleRaw(rawDir: string) {
  console.log("Step 1 — Upscaling raw images (Lanczos3)…\n");
  for (const { file } of FILES) {
    const p = path.join(rawDir, file);
    const { width, height } = await sharp(p).metadata();
    if (width === TARGET_W && height === TARGET_H) {
      console.log(`   ⏭  ${file} already ${TARGET_W}×${TARGET_H}, skipping`);
      continue;
    }
    console.log(`   ${file}  ${width}×${height} → ${TARGET_W}×${TARGET_H}`);
    const tmp = p + ".tmp.png";
    await sharp(p)
      .resize(TARGET_W, TARGET_H, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.2 }) // gentle sharpening pass
      .png({ quality: 100, compressionLevel: 6 })
      .toFile(tmp);
    fs.renameSync(tmp, p);
    console.log(`   ✅ Done\n`);
  }
}

// ── Step 2: Composite with header ─────────────────────────────────────────

async function compositeHeaders(rawDir: string, headerDir: string) {
  console.log("Step 2 — Compositing header banners…\n");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  for (const { file, header, subtitle } of FILES) {
    const rawPath = path.join(rawDir, file);
    const outPath = path.join(headerDir, file);
    const base64 = fs.readFileSync(rawPath).toString("base64");
    const contentHeight = VIEWPORT.height - HEADER_HEIGHT_CSS;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;overflow:hidden;background:#09090b;">
  <div style="
    height:${HEADER_HEIGHT_CSS}px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#a855f7 100%);
    color:white;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;">
    <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;">${header}</div>
    <div style="font-size:15px;font-weight:400;opacity:0.85;margin-top:4px;">${subtitle}</div>
  </div>
  <div style="width:${VIEWPORT.width}px;height:${contentHeight}px;overflow:hidden;">
    <img src="data:image/png;base64,${base64}"
         style="width:${VIEWPORT.width}px;height:auto;display:block;image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;"/>
  </div>
</body>
</html>`;

    const page = await ctx.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: outPath, fullPage: false });
    await page.close();
    console.log(`   ✅ with-headers/${file}`);
  }

  await browser.close();
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const rawDir = path.join(process.cwd(), "screenshots", "raw");
  const headerDir = path.join(process.cwd(), "screenshots", "with-headers");
  fs.mkdirSync(headerDir, { recursive: true });

  await upscaleRaw(rawDir);
  console.log();
  await compositeHeaders(rawDir, headerDir);

  console.log(`\n📐 Output: ${TARGET_W}×${TARGET_H}px (iPhone 14 Pro Max)`);
  console.log("🎉 Done!\n");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
