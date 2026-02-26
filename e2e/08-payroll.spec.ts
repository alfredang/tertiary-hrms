import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Payroll", () => {
  test("Admin can access payroll generate page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/payroll/generate");
    await expect(page).toHaveURL(/\/payroll\/generate/);
    await expect(page.locator("body")).toContainText("Process Payroll", {
      timeout: 15000,
    });
  });

  test("Admin sees payroll list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/payroll");
    await expect(page).toHaveURL(/\/payroll/);
    await expect(page.locator("body")).toContainText("Payroll", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasContent =
      bodyText?.includes("Gross") ||
      bodyText?.includes("Net") ||
      bodyText?.includes("Search") ||
      bodyText?.includes("No payslips");
    expect(hasContent).toBeTruthy();
  });

  test("Staff can view own payroll page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/payroll");
    await expect(page).toHaveURL(/\/payroll/);
    await expect(page.locator("body")).toContainText("Payroll", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasContent =
      bodyText?.includes("Gross") ||
      bodyText?.includes("Net") ||
      bodyText?.includes("No payslips");
    expect(hasContent).toBeTruthy();
  });

  test("Staff cannot access payroll generate page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/payroll/generate");
    await page.waitForTimeout(2000);

    // Staff should be redirected away
    const url = page.url();
    const bodyText = await page.locator("body").textContent();
    const isBlocked =
      !url.includes("/payroll/generate") ||
      bodyText?.includes("Access Denied") ||
      bodyText?.includes("Unauthorized") ||
      bodyText?.includes("Dashboard");
    expect(isBlocked).toBeTruthy();
  });
});
