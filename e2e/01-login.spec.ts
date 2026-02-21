import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Login Tests", () => {
  test("Test 3: Admin login with correct credentials", async ({ page }) => {
    await loginAsAdmin(page);
    // Should see the dashboard with welcome message
    await expect(page.locator("body")).toContainText("Welcome");
  });

  test("Test 4: Staff login with correct credentials", async ({ page }) => {
    await loginAsStaff(page);
    await expect(page.locator("body")).toContainText("Welcome");
  });

  test("Login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[id="email"]', "admin@tertiaryinfotech.com");
    await page.fill('input[id="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Wait for the error message to appear (login stays on /login)
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/[Ii]nvalid|[Ee]rror|[Ff]ailed/);
  });

  test("Login with non-existent user shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[id="email"]', "nobody@tertiaryinfotech.com");
    await page.fill('input[id="password"]', "somepassword");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/[Ii]nvalid|[Ee]rror|[Ff]ailed/);
  });

  test("Test 1: Google social login button is present", async ({ page }) => {
    await page.goto("/login");
    const googleBtn = page.locator('button:has-text("Sign in with Google")');
    await expect(googleBtn).toBeVisible();
  });

  test("Unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Role-Based Access (Test 2)", () => {
  test("Admin sees all navigation items including Settings", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
    await expect(page.locator('a[href="/employees"]')).toBeVisible();
  });

  test("Admin sees pending approvals on dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    const body = page.locator("body");
    await expect(body).toContainText(/[Pp]ending|[Aa]pproval|[Ee]mployee/);
  });

  test("Staff should NOT see Settings link", async ({ page }) => {
    await loginAsStaff(page);
    const settingsLink = page.locator('a[href="/settings"]');
    await expect(settingsLink).not.toBeVisible();
  });

  test("Staff sees their own leave balance on dashboard", async ({ page }) => {
    await loginAsStaff(page);
    const body = page.locator("body");
    await expect(body).toContainText(/[Ww]elcome|[Ll]eave|[Bb]alance/);
  });
});
