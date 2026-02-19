import { chromium } from "playwright";

async function testLogin(email: string, password: string, role: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\n--- Testing ${role} login (${email}) ---`);

  try {
    // Go to login page
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    console.log("✓ Login page loaded");

    // Fill in credentials
    await page.fill('input[id="email"]', email);
    await page.fill('input[id="password"]', password);
    console.log("✓ Credentials filled");

    // Click sign in and wait for navigation
    await Promise.all([
      page.waitForURL("**/dashboard**", { timeout: 15000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);

    // Give the page time to fully load
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    if (currentUrl.includes("/dashboard")) {
      console.log("✓ Successfully redirected to dashboard!");

      // Wait for page content
      await page.waitForLoadState("domcontentloaded");
      const bodyText = await page.textContent("body").catch(() => "");

      if (bodyText?.includes("Welcome Back")) {
        console.log("✓ Dashboard welcome message found");
      }
      if (bodyText?.includes("Something went wrong")) {
        console.log("✗ Dashboard shows 'Something went wrong' error!");
        await page.screenshot({ path: `scripts/screenshot-${role}-error.png` });
      } else {
        console.log("✓ No errors on dashboard");
        await page.screenshot({ path: `scripts/screenshot-${role}-success.png` });
      }
    } else if (currentUrl.includes("/login")) {
      console.log("✗ Still on login page after sign in attempt");
      await page.screenshot({ path: `scripts/screenshot-${role}-login-fail.png` });
    } else {
      console.log(`  Redirected to: ${currentUrl}`);
      await page.screenshot({ path: `scripts/screenshot-${role}-redirect.png` });
    }
  } catch (error: any) {
    console.log(`✗ Test error: ${error.message}`);
    await page.screenshot({ path: `scripts/screenshot-${role}-exception.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

async function testWrongPassword() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("\n--- Testing wrong password ---");

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[id="email"]', "staff@tertiaryinfotech.com");
    await page.fill('input[id="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Wait for error to appear or navigation
    await page.waitForTimeout(5000);
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    if (currentUrl.includes("/login")) {
      console.log("✓ Stayed on login page (correct behavior)");

      // Check for error message
      const bodyText = await page.textContent("body").catch(() => "");
      if (bodyText?.includes("Invalid email or password")) {
        console.log("✓ Error message displayed: 'Invalid email or password'");
      } else if (bodyText?.includes("credentials")) {
        console.log("✓ Error message displayed about credentials");
      } else {
        console.log("✗ No error message found on page");
      }
    } else {
      console.log(`✗ Unexpected redirect to: ${currentUrl}`);
    }

    await page.screenshot({ path: "scripts/screenshot-wrong-password.png" });
    console.log("  Screenshot saved");
  } catch (error: any) {
    console.log(`✗ Test error: ${error.message}`);
  } finally {
    await browser.close();
  }
}

async function testSkipLogin(role: "admin" | "staff") {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\n--- Testing Skip Login (${role}) ---`);

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    console.log("✓ Login page loaded");

    // Look for the dev quick login button
    const buttonText = role === "admin" ? "Login as Admin" : "Login as Staff";
    const button = page.getByRole("button", { name: buttonText });
    const isVisible = await button.isVisible().catch(() => false);

    if (!isVisible) {
      console.log(`✗ "${buttonText}" button not found on page`);
      await page.screenshot({ path: `scripts/screenshot-skip-${role}-notfound.png` });
      return;
    }

    console.log(`✓ "${buttonText}" button found`);
    await button.click();

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    if (currentUrl.includes("/dashboard")) {
      console.log("✓ Successfully redirected to dashboard!");
      const bodyText = await page.textContent("body").catch(() => "");
      if (bodyText?.includes("Something went wrong")) {
        console.log("✗ Dashboard shows error!");
        await page.screenshot({ path: `scripts/screenshot-skip-${role}-error.png` });
      } else {
        console.log("✓ No errors on dashboard");
        await page.screenshot({ path: `scripts/screenshot-skip-${role}-success.png` });
      }
    } else if (currentUrl.includes("/login")) {
      console.log("✗ Still on login page");
      const bodyText = await page.textContent("body").catch(() => "");
      const errorMatch = bodyText?.match(/Skip login failed[^.]*/);
      if (errorMatch) console.log(`  Error: ${errorMatch[0]}`);
      await page.screenshot({ path: `scripts/screenshot-skip-${role}-fail.png` });
    } else {
      console.log(`  Redirected to: ${currentUrl}`);
      await page.screenshot({ path: `scripts/screenshot-skip-${role}-redirect.png` });
    }
  } catch (error: any) {
    console.log(`✗ Test error: ${error.message}`);
    await page.screenshot({ path: `scripts/screenshot-skip-${role}-exception.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("=== Login Test Suite ===");

  await testSkipLogin("admin");
  await testSkipLogin("staff");
  await testLogin("admin@tertiaryinfotech.com", "123456", "admin");
  await testLogin("staff@tertiaryinfotech.com", "123456", "staff");
  await testWrongPassword();

  console.log("\n=== Tests Complete ===");
}

main().catch(console.error);
