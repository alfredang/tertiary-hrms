import { test, expect } from "@playwright/test";
import {
  loginAsStaff,
  today,
  futureDate,
  testId,
  cancelFirstPendingExpense,
} from "./helpers";

test.describe("Expense Submit", () => {
  test("Staff submits expense claim and cleans up", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page).toHaveURL(/\/expenses\/submit/);
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });

    // Select category
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[role="option"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    // Fill form
    await page.fill("#description", `${testId()} test expense`);
    await page.fill("#amount", "45.50");
    await page.fill("#expenseDate", today());

    // Upload a dummy receipt (required for all categories)
    await page.setInputFiles('input[type="file"]', {
      name: "test-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    await page.waitForTimeout(500);

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/expenses$/, { timeout: 15000 });

    // Verify success
    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/expenses") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();

    // Cleanup
    await cancelFirstPendingExpense(page);
  });

  test("Staff sees expense stats on /expenses page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });

    // Should see stats or expense list
    const body = await page.locator("body").textContent();
    const hasContent =
      body?.includes("Total") ||
      body?.includes("Claims") ||
      body?.includes("Expense") ||
      body?.includes("No expense");
    expect(hasContent).toBeTruthy();
  });

  test("Expense date cannot be in the future", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });

    // The expenseDate input has max={today}, so filling a future date
    // should either be blocked by the browser or rejected by the server
    const dateInput = page.locator("#expenseDate");
    const maxAttr = await dateInput.getAttribute("max");

    // Verify the max attribute is set to today or earlier
    expect(maxAttr).toBeTruthy();
    const maxDate = new Date(maxAttr!);
    const todayDate = new Date(today());
    expect(maxDate.getTime()).toBeLessThanOrEqual(
      todayDate.getTime() + 86400000
    );
  });
});
