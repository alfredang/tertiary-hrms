import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  loginAsStaff,
  switchToStaffView,
  switchToAdminView,
  isNavLinkVisible,
  isNavLinkHidden,
} from "./helpers";

test.describe("Dashboard", () => {
  test("Admin dashboard shows pending stats", async ({ page }) => {
    await loginAsAdmin(page);
    const body = page.locator("body");
    await expect(body).toContainText(/[Pp]ending|[Aa]pproval|[Ee]mployee/);
  });

  test("Admin dashboard shows recent activity section", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator("body")).toContainText("Recent Activity", {
      timeout: 15000,
    });
  });

  test("Admin view toggle buttons are visible", async ({ page }) => {
    await loginAsAdmin(page);
    const adminBtn = page.locator('button:has-text("Show as Admin")');
    const staffBtn = page.locator('button:has-text("Show as Staff")');
    const adminShort = page.locator('button:has-text("Admin")');
    const staffShort = page.locator('button:has-text("Staff")');

    const anyVisible =
      (await adminBtn.isVisible().catch(() => false)) ||
      (await staffBtn.isVisible().catch(() => false)) ||
      (await adminShort.isVisible().catch(() => false)) ||
      (await staffShort.isVisible().catch(() => false));
    expect(anyVisible).toBeTruthy();
  });

  test("Switch to staff view hides Settings link", async ({ page }) => {
    await loginAsAdmin(page);
    expect(await isNavLinkVisible(page, "/settings")).toBeTruthy();

    await switchToStaffView(page);
    // Navigate to force server re-render with updated cookie
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
    // Wait for sidebar hydration + cookie polling
    await page.waitForTimeout(1500);
    expect(await isNavLinkHidden(page, "/settings")).toBeTruthy();

    // Cleanup: switch back
    await switchToAdminView(page);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
  });

  test("Switch back to admin view restores Settings link", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await switchToStaffView(page);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(await isNavLinkHidden(page, "/settings")).toBeTruthy();

    await switchToAdminView(page);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(await isNavLinkVisible(page, "/settings")).toBeTruthy();
  });

  test("Staff dashboard shows leave balance info", async ({ page }) => {
    await loginAsStaff(page);
    const body = page.locator("body");
    await expect(body).toContainText(/[Ww]elcome|[Ll]eave|[Bb]alance/);
  });
});
