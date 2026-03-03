/**
 * Add gradient marketing headers to raw screenshots.
 * Matches the style used by take-app-store-screenshots.ts.
 *
 * Usage:
 *   npx tsx scripts/add-screenshot-headers.ts
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const VIEWPORT = { width: 430, height: 932 };
const DEVICE_SCALE_FACTOR = 3;
const HEADER_HEIGHT_CSS = 80;

const TARGETS = [
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

async function main() {
  const rawDir = path.join(process.cwd(), "screenshots", "raw");
  const headerDir = path.join(process.cwd(), "screenshots", "with-headers");
  fs.mkdirSync(headerDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  for (const t of TARGETS) {
    const rawPath = path.join(rawDir, t.file);
    const outPath = path.join(headerDir, t.file);

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
    <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;">${t.header}</div>
    <div style="font-size:15px;font-weight:400;opacity:0.85;margin-top:4px;">${t.subtitle}</div>
  </div>
  <div style="width:${VIEWPORT.width}px;height:${contentHeight}px;overflow:hidden;">
    <img src="data:image/png;base64,${base64}"
         style="width:${VIEWPORT.width}px;height:auto;display:block;"/>
  </div>
</body>
</html>`;

    const page = await ctx.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: outPath, fullPage: false });
    await page.close();

    console.log(`✅ ${t.file}  →  with-headers/${t.file}`);
  }

  await browser.close();
  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
