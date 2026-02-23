import { Page, expect } from "@playwright/test";

const TEST_PASSWORD = process.env.TEST_PASSWORD || "123456";

/** Login as a specific user via the credentials form */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForSelector('input[id="email"]', { state: "visible", timeout: 15000 });
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]');

  // The login uses fetch() internally then does window.location.href = "/dashboard"
  // This is a slow multi-step process: CSRF fetch → credentials POST → JS redirect
  // Wait up to 30s for the redirect to complete
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}

/** Login as admin */
export async function loginAsAdmin(page: Page) {
  await loginAs(page, "admin@tertiaryinfotech.com", TEST_PASSWORD);
  // Wait for dashboard content to actually render (not networkidle which can hang in dev)
  await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
}

/** Login as staff */
export async function loginAsStaff(page: Page) {
  await loginAs(page, "staff@tertiaryinfotech.com", TEST_PASSWORD);
  await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
}

/** Login as staff2 */
export async function loginAsStaff2(page: Page) {
  await loginAs(page, "staff2@tertiaryinfotech.com", TEST_PASSWORD);
  await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
}

/** Logout by navigating directly (clears session) */
export async function logout(page: Page) {
  await page.goto("/api/auth/signout");
  const signOutBtn = page.locator('button:has-text("Sign out")');
  if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutBtn.click();
  }
  await page.waitForURL(/\/login/, { timeout: 10000 });
}
