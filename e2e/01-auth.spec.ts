import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff, isNavLinkVisible } from "./helpers";

test.describe("Authentication", () => {
  test("Admin login with correct credentials", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator("body")).toContainText("Welcome");
  });

  test("Staff login with correct credentials", async ({ page }) => {
    await loginAsStaff(page);
    await expect(page.locator("body")).toContainText("Welcome");
  });

  test("Login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "admin@tertiaryinfotech.com");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/[Ii]nvalid|[Ee]rror|[Ff]ailed/);
  });

  test("Login with non-existent user shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@tertiaryinfotech.com");
    await page.fill("#password", "somepassword");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/[Ii]nvalid|[Ee]rror|[Ff]ailed/);
  });

  test("Google OAuth button is present", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator('button:has-text("Sign in with Google")')
    ).toBeVisible();
  });

  test("Unauthenticated user redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("RBAC Navigation", () => {
  test("Admin sees Settings and Employees nav links", async ({ page }) => {
    await loginAsAdmin(page);
    expect(await isNavLinkVisible(page, "/settings")).toBeTruthy();
    expect(await isNavLinkVisible(page, "/employees")).toBeTruthy();
  });

  test("Staff does NOT see Settings nav link", async ({ page }) => {
    await loginAsStaff(page);
    expect(await isNavLinkVisible(page, "/settings")).toBeFalsy();
  });
});
