import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Employees & Profile", () => {
  test("Admin sees employee directory", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.locator("body")).toContainText("Employees", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasContent =
      bodyText?.includes("Employee") ||
      bodyText?.includes("Department") ||
      bodyText?.includes("Name") ||
      bodyText?.includes("ACTIVE");
    expect(hasContent).toBeTruthy();
  });

  test("Admin can view employee detail page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/employees");
    await expect(page.locator("body")).toContainText("Employees", {
      timeout: 15000,
    });

    // Click the first employee link
    const employeeLink = page.locator('a[href*="/employees/"]').first();
    await expect(employeeLink).toBeVisible({ timeout: 10000 });
    await employeeLink.click();

    await page.waitForURL(/\/employees\//, { timeout: 15000 });

    // Should show employee details
    const bodyText = await page.locator("body").textContent();
    const hasDetail =
      bodyText?.includes("Personal") ||
      bodyText?.includes("Employment") ||
      bodyText?.includes("Email") ||
      bodyText?.includes("Department");
    expect(hasDetail).toBeTruthy();
  });

  test("Profile page loads for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator("body")).toContainText("My Profile", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasProfile =
      bodyText?.includes("Email") ||
      bodyText?.includes("Department") ||
      bodyText?.includes("Position");
    expect(hasProfile).toBeTruthy();
  });

  test("Profile page loads for staff", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator("body")).toContainText("My Profile", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasProfile =
      bodyText?.includes("Email") ||
      bodyText?.includes("Department") ||
      bodyText?.includes("Position");
    expect(hasProfile).toBeTruthy();
  });
});
