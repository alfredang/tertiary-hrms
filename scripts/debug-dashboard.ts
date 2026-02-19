import { chromium } from "playwright";

async function debugDashboard() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages: string[] = [];
  const networkErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleMessages.push(msg.text());
  });

  page.on("pageerror", (err) => {
    consoleMessages.push("PAGE ERROR: " + err.message);
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      networkErrors.push(res.status() + " " + res.url());
    }
  });

  console.log("--- Step 1: Login as Admin ---");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });

  const btn = page.getByRole("button", { name: "Login as Admin" });
  await btn.click();

  await page.waitForURL("**/dashboard**", { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(5000);
  await page.waitForLoadState("networkidle").catch(() => null);

  console.log("  URL: " + page.url());

  console.log("\n--- Step 2: Check page content ---");
  const bodyText = await page.textContent("body").catch(() => "");
  if (bodyText && bodyText.includes("Something went wrong")) {
    console.log("FAIL: Found error on page!");
  } else if (bodyText && bodyText.includes("Welcome Back")) {
    console.log("PASS: Dashboard loaded successfully");
  } else {
    console.log("UNKNOWN: Page state unclear");
    console.log("  Body preview: " + (bodyText || "").substring(0, 500));
  }

  console.log("\n--- Console Errors ---");
  if (consoleMessages.length === 0) {
    console.log("  (none)");
  } else {
    consoleMessages.forEach((m) => console.log("  " + m));
  }

  console.log("\n--- Network Errors ---");
  if (networkErrors.length === 0) {
    console.log("  (none)");
  } else {
    networkErrors.forEach((e) => console.log("  " + e));
  }

  // Check for Next.js error data
  const nextData = await page.evaluate(() => {
    const el = document.getElementById("__NEXT_DATA__");
    return el ? el.textContent : null;
  });
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData);
      if (parsed.err) {
        console.log("\n--- Next.js Error Data ---");
        console.log("  " + JSON.stringify(parsed.err));
      }
    } catch {}
  }

  await page.screenshot({ path: "scripts/screenshot-debug-dashboard.png", fullPage: true });
  console.log("\nScreenshot saved to scripts/screenshot-debug-dashboard.png");

  // Now test: login with the user's Google account by checking if it exists
  // Also test: what happens when we login as the Google user
  console.log("\n--- Step 3: Test with Google user (angch@tertiaryinfotech.com) ---");
  const page2 = await context.newPage();

  const consoleMessages2: string[] = [];
  page2.on("console", (msg) => {
    if (msg.type() === "error") consoleMessages2.push(msg.text());
  });
  page2.on("pageerror", (err) => {
    consoleMessages2.push("PAGE ERROR: " + err.message);
  });

  await page2.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page2.fill('input[id="email"]', "angch@tertiaryinfotech.com");
  await page2.fill('input[id="password"]', "123456");
  await page2.click('button[type="submit"]');

  await page2.waitForURL("**/*", { timeout: 15000 }).catch(() => null);
  await page2.waitForTimeout(5000);

  console.log("  URL: " + page2.url());
  const bodyText2 = await page2.textContent("body").catch(() => "");
  if (bodyText2 && bodyText2.includes("Something went wrong")) {
    console.log("  FAIL: Error on dashboard for Google user");
  } else if (bodyText2 && bodyText2.includes("Welcome Back")) {
    console.log("  PASS: Dashboard loaded for Google user");
  } else if (page2.url().includes("/login")) {
    console.log("  INFO: Still on login page (credentials may not work for Google user)");
    if (bodyText2 && bodyText2.includes("Invalid")) {
      console.log("  (Invalid credentials - expected for Google-only user)");
    }
  } else {
    console.log("  Body preview: " + (bodyText2 || "").substring(0, 300));
  }

  if (consoleMessages2.length > 0) {
    console.log("  Console errors:");
    consoleMessages2.forEach((m) => console.log("    " + m));
  }

  await page2.screenshot({ path: "scripts/screenshot-debug-google-user.png", fullPage: true });

  await browser.close();
}

debugDashboard().catch(console.error);
