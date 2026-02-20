import { chromium } from "playwright";

const PROD_URL = "https://hrms.tertiaryinfo.tech";
const LOCAL_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

async function testLoginPage(baseUrl: string, label: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext().then((c) => c.newPage());

  log(`\n--- [${label}] Login Page Check ---`);
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });

    const hasEmailInput = await page.locator('input[id="email"]').isVisible();
    const hasPasswordInput = await page.locator('input[id="password"]').isVisible();
    const hasSignInButton = await page.locator('button[type="submit"]').isVisible();
    const bodyText = await page.textContent("body").catch(() => "");
    const hasWelcome = bodyText?.includes("Welcome back") ?? false;

    // Check dark theme
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector("div.min-h-screen");
      return el ? getComputedStyle(el).backgroundColor : "unknown";
    });
    const isDarkTheme = bgColor.includes("3") && bgColor.includes("7"); // rgb(3, 7, 18) for gray-950

    log(`  Welcome text: ${hasWelcome ? "YES" : "NO"}`);
    log(`  Email input: ${hasEmailInput ? "YES" : "NO"}`);
    log(`  Password input: ${hasPasswordInput ? "YES" : "NO"}`);
    log(`  Sign-in button: ${hasSignInButton ? "YES" : "NO"}`);
    log(`  Background: ${bgColor} (${isDarkTheme ? "dark" : "light"} theme)`);

    const allGood = hasEmailInput && hasPasswordInput && hasSignInButton && hasWelcome;
    results.push({
      name: `[${label}] Login page elements`,
      passed: allGood,
      details: allGood
        ? `All elements present, ${isDarkTheme ? "dark" : "LIGHT (old build?)"} theme`
        : "Missing elements",
    });

    await page.screenshot({ path: `scripts/screenshot-prod-${label.toLowerCase()}-login.png` });
  } catch (err: any) {
    log(`  ERROR: ${err.message}`);
    results.push({ name: `[${label}] Login page`, passed: false, details: err.message });
  } finally {
    await browser.close();
  }
}

async function testCredentialsLogin(
  baseUrl: string,
  label: string,
  email: string,
  password: string,
  expectSuccess: boolean
) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext().then((c) => c.newPage());
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => consoleErrors.push("PAGE ERROR: " + err.message));

  const shortEmail = email.split("@")[0];
  const testName = expectSuccess ? `${shortEmail} login` : "wrong password";
  log(`\n--- [${label}] ${testName} ---`);

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await page.fill('input[id="email"]', email);
    await page.fill('input[id="password"]', password);

    if (expectSuccess) {
      await Promise.all([
        page.waitForURL("**/dashboard**", { timeout: 20000 }).catch(() => null),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForTimeout(5000);
      await page.waitForLoadState("networkidle").catch(() => null);

      const url = page.url();
      const bodyText = await page.textContent("body").catch(() => "");
      const hasError = bodyText?.includes("Something went wrong") ?? false;
      const hasWelcome = bodyText?.includes("Welcome Back") ?? false;
      const onDashboard = url.includes("/dashboard");

      log(`  URL: ${url}`);

      if (onDashboard && !hasError) {
        log(`  PASS${hasWelcome ? " (welcome message found)" : ""}`);
        results.push({ name: `[${label}] ${testName}`, passed: true, details: "Dashboard OK" });
      } else if (onDashboard && hasError) {
        log(`  FAIL: Dashboard error`);
        results.push({ name: `[${label}] ${testName}`, passed: false, details: "Dashboard error" });
      } else {
        log(`  FAIL: Not on dashboard`);
        results.push({ name: `[${label}] ${testName}`, passed: false, details: `URL: ${url}` });
      }
    } else {
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      const url = page.url();
      const bodyText = await page.textContent("body").catch(() => "");
      const hasErrorMsg = bodyText?.includes("Invalid") ?? false;
      const onLogin = url.includes("/login");

      log(`  URL: ${url}`);

      if (onLogin && hasErrorMsg) {
        log(`  PASS: Error message shown`);
        results.push({ name: `[${label}] ${testName}`, passed: true, details: "Error shown" });
      } else {
        log(`  FAIL`);
        results.push({ name: `[${label}] ${testName}`, passed: false, details: `URL: ${url}` });
      }
    }

    if (consoleErrors.length > 0) {
      log(`  Console errors:`);
      consoleErrors.forEach((e) => log(`    ${e.substring(0, 150)}`));
    }

    await page.screenshot({
      path: `scripts/screenshot-prod-${label.toLowerCase()}-${testName.replace(/\s/g, "-")}.png`,
      fullPage: true,
    });
  } catch (err: any) {
    log(`  ERROR: ${err.message}`);
    results.push({ name: `[${label}] ${testName}`, passed: false, details: err.message });
  } finally {
    await browser.close();
  }
}

async function testDashboardPages(baseUrl: string, label: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log(`\n--- [${label}] Dashboard Pages ---`);
  try {
    // Login first
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await page.fill('input[id="email"]', "admin@tertiaryinfotech.com");
    await page.fill('input[id="password"]', "123456");
    await Promise.all([
      page.waitForURL("**/dashboard**", { timeout: 20000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(3000);

    if (!page.url().includes("/dashboard")) {
      log(`  Could not login (URL: ${page.url()})`);
      results.push({ name: `[${label}] Dashboard pages`, passed: false, details: "Login failed" });
      return;
    }

    const pages = [
      "/dashboard",
      "/employees",
      "/leave",
      "/expenses",
      "/payroll",
      "/calendar",
    ];

    for (const path of pages) {
      const name = path.replace("/", "");
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);
        const bodyText = await page.textContent("body").catch(() => "");
        const hasError = bodyText?.includes("Something went wrong") ?? false;
        const icon = hasError ? "FAIL" : "PASS";
        log(`  ${icon}: ${name}`);
        results.push({
          name: `[${label}] /${name}`,
          passed: !hasError,
          details: hasError ? "Error on page" : "OK",
        });
      } catch (err: any) {
        log(`  FAIL: ${name} - ${err.message}`);
        results.push({ name: `[${label}] /${name}`, passed: false, details: err.message });
      }
    }
  } catch (err: any) {
    log(`  ERROR: ${err.message}`);
    results.push({ name: `[${label}] Dashboard pages`, passed: false, details: err.message });
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("  Production vs Localhost Test Suite");
  console.log("=".repeat(50));

  // Login page
  await testLoginPage(PROD_URL, "PROD");
  await testLoginPage(LOCAL_URL, "LOCAL");

  // Admin login
  await testCredentialsLogin(PROD_URL, "PROD", "admin@tertiaryinfotech.com", "123456", true);
  await testCredentialsLogin(LOCAL_URL, "LOCAL", "admin@tertiaryinfotech.com", "123456", true);

  // Staff login
  await testCredentialsLogin(PROD_URL, "PROD", "staff@tertiaryinfotech.com", "123456", true);
  await testCredentialsLogin(LOCAL_URL, "LOCAL", "staff@tertiaryinfotech.com", "123456", true);

  // Wrong password
  await testCredentialsLogin(PROD_URL, "PROD", "admin@tertiaryinfotech.com", "wrongpass", false);
  await testCredentialsLogin(LOCAL_URL, "LOCAL", "admin@tertiaryinfotech.com", "wrongpass", false);

  // Dashboard pages
  await testDashboardPages(PROD_URL, "PROD");
  await testDashboardPages(LOCAL_URL, "LOCAL");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("  RESULTS SUMMARY");
  console.log("=".repeat(50) + "\n");

  const maxLen = Math.max(...results.map((r) => r.name.length));
  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    const pad = " ".repeat(maxLen - r.name.length);
    console.log(`  ${icon}  ${r.name}${pad}  ${r.details}`);
    if (r.passed) passed++;
    else failed++;
  }

  console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(50) + "\n");

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
