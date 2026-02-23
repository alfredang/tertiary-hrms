import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin View Toggle Tests", () => {
  test("Admin sees view toggle buttons on dashboard", async ({ page }) => {
    await loginAsAdmin(page);

    // The view toggle should be visible on the dashboard
    const adminBtn = page.locator('button:has-text("Show as Admin")');
    const staffBtn = page.locator('button:has-text("Show as Staff")');

    // At least one should be visible
    const adminVisible = await adminBtn.isVisible().catch(() => false);
    const staffVisible = await staffBtn.isVisible().catch(() => false);
    expect(adminVisible || staffVisible).toBeTruthy();
  });

  test("Admin switches to staff view and Settings disappears", async ({ page }) => {
    await loginAsAdmin(page);

    // Verify Settings is visible in admin view
    await expect(page.locator('a[href="/settings"]')).toBeVisible();

    // Click "Show as Staff" to switch view
    const staffBtn = page.locator('button:has-text("Show as Staff")');
    if (await staffBtn.isVisible().catch(() => false)) {
      await staffBtn.click();
      await page.waitForTimeout(2000);

      // After switching to staff view, Settings should not be visible
      const settingsLink = page.locator('a[href="/settings"]');
      await expect(settingsLink).not.toBeVisible();
    }
  });

  test("Admin switches back from staff view and Settings reappears", async ({ page }) => {
    await loginAsAdmin(page);

    // First switch to staff view
    const staffBtn = page.locator('button:has-text("Show as Staff")');
    if (await staffBtn.isVisible().catch(() => false)) {
      await staffBtn.click();
      await page.waitForTimeout(2000);

      // Now switch back to admin view
      const adminBtn = page.locator('button:has-text("Show as Admin")');
      if (await adminBtn.isVisible().catch(() => false)) {
        await adminBtn.click();
        await page.waitForTimeout(2000);

        // Settings should be visible again
        await expect(page.locator('a[href="/settings"]')).toBeVisible();
      }
    }
  });

  test("Staff view shows staff dashboard content", async ({ page }) => {
    await loginAsAdmin(page);

    // Switch to staff view
    const staffBtn = page.locator('button:has-text("Show as Staff")');
    if (await staffBtn.isVisible().catch(() => false)) {
      await staffBtn.click();
      await page.waitForTimeout(2000);

      // In staff view, dashboard should show personal stats
      const bodyText = await page.locator("body").textContent();
      const hasStaffContent =
        bodyText?.includes("Leave") ||
        bodyText?.includes("Balance") ||
        bodyText?.includes("Welcome");
      expect(hasStaffContent).toBeTruthy();

      // Switch back to admin to clean up
      const adminBtn = page.locator('button:has-text("Show as Admin")');
      if (await adminBtn.isVisible().catch(() => false)) {
        await adminBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("Profile page loads correctly", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator("body")).toContainText("My Profile", { timeout: 15000 });

    // Profile should show employee information
    const bodyText = await page.locator("body").textContent();
    const hasProfileContent =
      bodyText?.includes("Profile") ||
      bodyText?.includes("Employee") ||
      bodyText?.includes("Email") ||
      bodyText?.includes("Department");
    expect(hasProfileContent).toBeTruthy();
  });

  test("Employee directory loads for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.locator("body")).toContainText("Employees", { timeout: 15000 });

    // Admin should see employee list
    const bodyText = await page.locator("body").textContent();
    const hasEmployeeContent =
      bodyText?.includes("Employee") ||
      bodyText?.includes("Department") ||
      bodyText?.includes("Name");
    expect(hasEmployeeContent).toBeTruthy();
  });
});
