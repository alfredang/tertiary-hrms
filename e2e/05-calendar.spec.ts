import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Calendar Tests", () => {
  test("Calendar page loads for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);

    // Wait for calendar content to appear (not networkidle which can hang)
    await expect(page.locator("body")).toContainText("Calendar", { timeout: 15000 });

    // Should show day headers (Mon, Tue, etc.)
    await expect(page.locator("body")).toContainText("Mon");
    await expect(page.locator("body")).toContainText("Tue");
    await expect(page.locator("body")).toContainText("Wed");
  });

  test("Calendar shows current month and year", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");

    const now = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const currentMonth = monthNames[now.getMonth()];
    const currentYear = now.getFullYear().toString();

    await expect(page.locator("body")).toContainText(currentMonth, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(currentYear);
  });

  test("Calendar has navigation buttons", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");

    // Wait for calendar to load
    await expect(page.locator("body")).toContainText("Calendar", { timeout: 15000 });

    // Should have a Today button
    const todayBtn = page.locator('button:has-text("Today")');
    await expect(todayBtn).toBeVisible();
  });

  test("Calendar page loads for staff", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);

    await expect(page.locator("body")).toContainText("Calendar", { timeout: 15000 });
  });

  test("Calendar shows event legend", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page.locator("body")).toContainText("Calendar", { timeout: 15000 });

    // The calendar should have a legend with event types
    const bodyText = await page.locator("body").textContent();
    const hasLegend =
      bodyText?.includes("Holiday") ||
      bodyText?.includes("Leave") ||
      bodyText?.includes("Meeting") ||
      bodyText?.includes("Event");
    expect(hasLegend).toBeTruthy();
  });
});
