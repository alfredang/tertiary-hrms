/**
 * App Store Screenshot Generator
 *
 * Takes 10 screenshots of the HRMS app for App Store listing.
 * Produces both raw screenshots and versions with marketing headers.
 *
 * The "with-headers" versions composite a solid gradient banner above the
 * app screenshot in a separate HTML page — no injection into the live app,
 * so the content stays clean and the final image is exactly 1290×2796.
 *
 * Usage:
 *   npx tsx scripts/take-app-store-screenshots.ts
 *
 * Output:
 *   screenshots/raw/          — Clean screenshots (1290×2796, iPhone 6.7")
 *   screenshots/with-headers/ — Screenshots with gradient text banners
 */

import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://hrms.tertiaryinfo.tech";
const TEST_PASSWORD = "123456";

// iPhone 14 Pro Max — App Store 6.7" display (1290×2796)
const VIEWPORT = { width: 430, height: 932 };
const DEVICE_SCALE_FACTOR = 3;
const HEADER_HEIGHT_CSS = 80; // CSS pixels for the header band

interface ScreenConfig {
  name: string;
  path: string;
  auth: "admin" | "staff" | null;
  header: string;
  subtitle: string;
  waitFor?: string;
}

const SCREENSHOTS: ScreenConfig[] = [
  // ── No auth ──
  {
    name: "01-login",
    path: "/login",
    auth: null,
    header: "Secure & Easy Login",
    subtitle: "Sign in with credentials or Google",
    waitFor: "Sign In",
  },

  // ── Admin screenshots ──
  {
    name: "02-dashboard-admin",
    path: "/dashboard",
    auth: "admin",
    header: "Complete HR Overview",
    subtitle: "Real-time workforce analytics",
    waitFor: "Welcome",
  },
  {
    name: "03-leave-admin",
    path: "/leave",
    auth: "admin",
    header: "Manage Leave Requests",
    subtitle: "Approve, reject & track all leave",
    waitFor: "Leave",
  },
  // ── Staff screenshots ──
  {
    name: "07-dashboard-staff",
    path: "/dashboard",
    auth: "staff",
    header: "Your HR at a Glance",
    subtitle: "Leave balances, quick actions & more",
    waitFor: "Welcome",
  },
  {
    name: "08-leave-staff",
    path: "/leave",
    auth: "staff",
    header: "Apply & Track Leave",
    subtitle: "Half-day, MC & annual leave support",
    waitFor: "Leave",
  },
  {
    name: "09-expenses",
    path: "/expenses",
    auth: "staff",
    header: "Track Expense Claims",
    subtitle: "Submit, track & get reimbursed",
    waitFor: "Expense",
  },
  {
    name: "10-calendar",
    path: "/calendar",
    auth: "staff",
    header: "Personal Calendar",
    subtitle: "Plan your schedule with ease",
    waitFor: "Calendar",
  },
];

// ── Auth helpers ──

async function login(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector("#email", { state: "visible", timeout: 15000 });
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(3000);
}

async function logout(page: Page) {
  await page.goto(`${BASE_URL}/api/auth/signout`);
  const signOutBtn = page.locator('button:has-text("Sign out")');
  if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutBtn.click();
  }
  await page.waitForURL(/\/login/, { timeout: 10000 });
}

// ── Composite header via separate HTML page ──

async function compositeWithHeader(
  context: BrowserContext,
  rawPngPath: string,
  outputPath: string,
  header: string,
  subtitle: string
) {
  const rawBuffer = fs.readFileSync(rawPngPath);
  const base64 = rawBuffer.toString("base64");

  // Content area = total height minus header
  const contentHeight = VIEWPORT.height - HEADER_HEIGHT_CSS;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; width:${VIEWPORT.width}px; height:${VIEWPORT.height}px; overflow:hidden; background:#09090b;">
  <div style="
    height: ${HEADER_HEIGHT_CSS}px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  ">
    <div style="font-size: 28px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.2;">
      ${header}
    </div>
    <div style="font-size: 15px; font-weight: 400; opacity: 0.85; margin-top: 4px;">
      ${subtitle}
    </div>
  </div>
  <div style="width:${VIEWPORT.width}px; height:${contentHeight}px; overflow:hidden;">
    <img
      src="data:image/png;base64,${base64}"
      style="width:${VIEWPORT.width}px; height:auto; display:block;"
    />
  </div>
</body>
</html>`;

  const compositePage = await context.newPage();
  await compositePage.setViewportSize(VIEWPORT);
  await compositePage.setContent(html, { waitUntil: "load" });
  await compositePage.waitForTimeout(500);
  await compositePage.screenshot({ path: outputPath, fullPage: false });
  await compositePage.close();
}

// ── Main ──

async function main() {
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  const rawDir = path.join(screenshotsDir, "raw");
  const headerDir = path.join(screenshotsDir, "with-headers");

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(headerDir, { recursive: true });

  console.log("🚀 Starting App Store screenshot capture...");
  console.log(`   Target: ${BASE_URL}`);
  console.log(
    `   Resolution: ${VIEWPORT.width * DEVICE_SCALE_FACTOR}×${VIEWPORT.height * DEVICE_SCALE_FACTOR} (iPhone 14 Pro Max, 6.7")\n`
  );

  const browser = await chromium.launch({ headless: true });

  // Main context for browsing the app
  const appContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  // Separate context for compositing (same viewport + scale)
  const compositeContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  const page = await appContext.newPage();
  let currentAuth: string | null = "__none__";
  let captured = 0;

  for (const screen of SCREENSHOTS) {
    console.log(`📸 [${screen.name}] Navigating to ${screen.path}...`);

    // ── Handle auth transitions ──
    if (screen.auth !== currentAuth) {
      if (currentAuth !== null && currentAuth !== "__none__") {
        await logout(page);
      }
      if (screen.auth === "admin") {
        console.log("   🔑 Logging in as admin...");
        await login(page, "admin@tertiaryinfotech.com");
      } else if (screen.auth === "staff") {
        console.log("   🔑 Logging in as staff...");
        await login(page, "staff@tertiaryinfotech.com");
      }
      currentAuth = screen.auth;
    }

    // ── Navigate ──
    await page.goto(`${BASE_URL}${screen.path}`);

    // Wait for content (avoids networkidle hang from chat widget)
    if (screen.waitFor) {
      await page
        .locator("body")
        .getByText(screen.waitFor, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
    }
    await page.waitForTimeout(2500);

    // Hide chat widget if present
    await page.evaluate(() => {
      const chat = document.querySelector(
        '[data-chat-widget], .fixed.bottom-4.right-4'
      );
      if (chat) (chat as HTMLElement).style.display = "none";
    });
    await page.waitForTimeout(300);

    // ── Raw screenshot ──
    const rawPath = path.join(rawDir, `${screen.name}.png`);
    await page.screenshot({ path: rawPath, fullPage: false });

    // ── Composite with-header screenshot ──
    const headerPath = path.join(headerDir, `${screen.name}.png`);
    await compositeWithHeader(
      compositeContext,
      rawPath,
      headerPath,
      screen.header,
      screen.subtitle
    );

    captured++;
    console.log(`   ✅ Done (${captured}/${SCREENSHOTS.length})\n`);
  }

  await browser.close();

  console.log("═══════════════════════════════════════════════════");
  console.log(`🎉 ${captured} screenshots captured successfully!`);
  console.log(`   📁 Raw:          screenshots/raw/`);
  console.log(`   📁 With headers: screenshots/with-headers/`);
  console.log(
    `   📐 Resolution:   ${VIEWPORT.width * DEVICE_SCALE_FACTOR}×${VIEWPORT.height * DEVICE_SCALE_FACTOR}px`
  );
  console.log("═══════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ Screenshot capture failed:", err);
  process.exit(1);
});
