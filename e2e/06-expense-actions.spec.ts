import { test, expect } from "@playwright/test";
import {
  loginAsStaff,
  loginAsAdmin,
  logout,
  today,
  testId,
  cancelFirstPendingExpense,
} from "./helpers";

/** Submit an expense claim with given description */
async function submitExpense(
  page: import("@playwright/test").Page,
  description: string
) {
  await page.goto("/expenses/submit");
  await expect(page).toHaveURL(/\/expenses\/submit/);
  await expect(page.locator("body")).toContainText("Expense", {
    timeout: 15000,
  });

  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(500);
  const firstOption = page.locator('[role="option"]').first();
  await expect(firstOption).toBeVisible({ timeout: 5000 });
  await firstOption.click();

  await page.fill("#description", description);
  await page.fill("#amount", "50.00");
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
}

test.describe("Expense Actions", () => {
  test("Staff edits a PENDING expense claim", async ({ page }) => {
    await loginAsStaff(page);
    const marker = testId();
    await submitExpense(page, `${marker} original`);

    // Go to expenses → Pending tab
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Click Edit on first pending
    const editLink = page
      .locator('table a[href*="/expenses/edit/"]')
      .first();
    await expect(editLink).toBeVisible({ timeout: 10000 });
    await editLink.click();

    await page.waitForURL(/\/expenses\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit", {
      timeout: 15000,
    });

    // Change description
    const editDesc = page.locator("textarea").first();
    await expect(editDesc).toBeVisible({ timeout: 5000 });
    await editDesc.fill(`${marker} edited`);

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/expenses$/, { timeout: 10000 });
    expect(page.url()).toContain("/expenses");
    expect(page.url()).not.toContain("/edit");

    // Cleanup
    await cancelFirstPendingExpense(page);
  });

  test("Staff cancels a PENDING expense claim", async ({ page }) => {
    await loginAsStaff(page);
    await submitExpense(page, `${testId()} cancel test`);

    // Go to expenses → Pending tab → Cancel
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    const cancelBtn = page
      .locator("table button")
      .filter({ hasText: /^Cancel$/ })
      .first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    await expect(page.locator("body")).toContainText("Cancel this expense?");
    await page.locator('table button:has-text("Yes, Cancel")').click();
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    expect(
      bodyText?.includes("Cancelled") || bodyText?.includes("CANCELLED")
    ).toBeTruthy();
  });

  test("Admin approves then resets expense, staff cleans up", async ({
    page,
  }) => {
    // Staff creates expense with unique marker
    await loginAsStaff(page);
    const marker = testId();
    await submitExpense(page, `${marker} approve-reset`);
    await logout(page);

    // Admin approves — search by marker to target the exact expense
    await loginAsAdmin(page);
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search expenses..."]', marker);
    await page.waitForTimeout(1000);

    const approveBtn = page
      .locator('table button:has-text("Approve")')
      .first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();
    await page.waitForTimeout(2000);

    // Navigate to Approved tab, search again, and reset
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search expenses..."]', marker);
    await page.waitForTimeout(1000);
    await page.locator("button").filter({ hasText: /^Approved$/ }).click();
    await page.waitForTimeout(500);

    const resetBtn = page
      .locator('table button[title="Reset to Pending"]')
      .first();
    await expect(resetBtn).toBeVisible({ timeout: 10000 });
    await resetBtn.click();

    await expect(page.locator("body")).toContainText("Confirm Reset", {
      timeout: 5000,
    });
    await page.locator('table button:has-text("Confirm Reset")').click();
    await page.waitForTimeout(2000);

    // Staff cancels the reset expense
    await logout(page);
    await loginAsStaff(page);
    await cancelFirstPendingExpense(page);
  });

  test("Admin rejects then resets expense, staff cleans up", async ({
    page,
  }) => {
    // Staff creates expense with unique marker
    await loginAsStaff(page);
    const marker = testId();
    await submitExpense(page, `${marker} reject-reset`);
    await logout(page);

    // Admin rejects — search by marker to target the exact expense
    await loginAsAdmin(page);
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search expenses..."]', marker);
    await page.waitForTimeout(1000);

    const rejectBtn = page
      .locator('table button:has-text("Reject")')
      .first();
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });
    await rejectBtn.click();

    // Complete the two-step reject confirmation
    await expect(page.locator("body")).toContainText("Confirm Reject", {
      timeout: 5000,
    });
    await page.locator('table button:has-text("Confirm Reject")').click();
    await page.waitForTimeout(2000);

    // Navigate to Rejected tab, search again, and reset
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search expenses..."]', marker);
    await page.waitForTimeout(1000);
    await page.locator("button").filter({ hasText: /^Rejected$/ }).click();
    await page.waitForTimeout(500);

    const resetBtn = page
      .locator('table button[title="Reset to Pending"]')
      .first();
    await expect(resetBtn).toBeVisible({ timeout: 10000 });
    await resetBtn.click();

    await expect(page.locator("body")).toContainText("Confirm Reset", {
      timeout: 5000,
    });
    await page.locator('table button:has-text("Confirm Reset")').click();
    await page.waitForTimeout(2000);

    // Staff cancels the reset expense
    await logout(page);
    await loginAsStaff(page);
    await cancelFirstPendingExpense(page);
  });
});
