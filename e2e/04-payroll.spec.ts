import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Payroll Tests", () => {
  test("Admin can access payroll generate page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/payroll/generate");
    await expect(page).toHaveURL(/\/payroll\/generate/);
    await expect(page.locator("body")).toContainText("Process Payroll");
  });

  test("Admin auto-generates payroll for current month", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/payroll/generate");
    await expect(page.locator("body")).toContainText("Process Payroll", { timeout: 15000 });

    // Click the "Auto-Generate Payroll" button
    const generateBtn = page.locator('button:has-text("Auto-Generate")');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Wait for the result to appear
    await page.waitForTimeout(5000);

    // Should show result stats (Created / Skipped / Errors)
    const bodyText = await page.locator("body").textContent();
    const hasResult =
      bodyText?.includes("Created") ||
      bodyText?.includes("Skipped") ||
      bodyText?.includes("generated") ||
      bodyText?.includes("success");
    expect(hasResult).toBeTruthy();
  });

  test("Admin sees payroll list with payslips", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/payroll");
    await expect(page).toHaveURL(/\/payroll/);
    await expect(page.locator("body")).toContainText("Payroll", { timeout: 15000 });

    // Admin should see a table with employee payslips
    const bodyText = await page.locator("body").textContent();
    // Should have either payslip data or the search field
    const hasPayrollContent =
      bodyText?.includes("Gross Pay") ||
      bodyText?.includes("Take Home") ||
      bodyText?.includes("Search") ||
      bodyText?.includes("No payslips");
    expect(hasPayrollContent).toBeTruthy();
  });

  test("Staff can view own payroll page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/payroll");
    await expect(page).toHaveURL(/\/payroll/);
    await expect(page.locator("body")).toContainText("Payroll", { timeout: 15000 });

    // Staff should see their own payslips (or empty state)
    const bodyText = await page.locator("body").textContent();
    const hasPayrollContent =
      bodyText?.includes("Gross Pay") ||
      bodyText?.includes("Take Home") ||
      bodyText?.includes("No payslips");
    expect(hasPayrollContent).toBeTruthy();
  });

  test("Staff cannot access payroll generate page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/payroll/generate");
    await page.waitForTimeout(3000);

    // Staff should be redirected away or see an error
    const url = page.url();
    const bodyText = await page.locator("body").textContent();
    const isBlocked =
      !url.includes("/payroll/generate") ||
      bodyText?.includes("Access Denied") ||
      bodyText?.includes("Unauthorized") ||
      bodyText?.includes("not authorized");
    expect(isBlocked).toBeTruthy();
  });
});
