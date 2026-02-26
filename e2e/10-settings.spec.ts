import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Settings", () => {
  test("Admin can access settings page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator("body")).toContainText("Company Settings", {
      timeout: 15000,
    });
  });

  test("Staff is redirected from settings", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/settings");
    await page.waitForTimeout(2000);

    // Staff should be redirected to dashboard
    const url = page.url();
    const isBlocked =
      !url.includes("/settings") || url.includes("/dashboard");
    expect(isBlocked).toBeTruthy();
  });

  test("Settings page shows company name field", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await expect(page.locator("body")).toContainText("Company Settings", {
      timeout: 15000,
    });

    // Should have company name input or display
    const bodyText = await page.locator("body").textContent();
    const hasCompanyField =
      bodyText?.includes("Company Name") ||
      bodyText?.includes("Company Information") ||
      bodyText?.includes("UEN");
    expect(hasCompanyField).toBeTruthy();
  });
});
