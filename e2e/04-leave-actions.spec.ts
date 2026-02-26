import { test, expect } from "@playwright/test";
import {
  loginAsStaff,
  loginAsAdmin,
  logout,
  futureDate,
  testId,
  cancelFirstPendingLeave,
} from "./helpers";

/** Submit a NPL leave request for a given future date offset */
async function submitNPLLeave(
  page: import("@playwright/test").Page,
  dayOffset: number,
  reason: string
) {
  await page.goto("/leave/request");
  await expect(page).toHaveURL(/\/leave\/request/);

  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(500);
  const option = page
    .locator('[role="option"]')
    .filter({ hasText: /No Pay/ });
  await expect(option).toBeVisible({ timeout: 5000 });
  await option.click();

  const dateStr = futureDate(dayOffset);
  await page.locator('input[type="date"]').first().fill(dateStr);
  await page.locator('input[type="date"]').nth(1).fill(dateStr);

  const reasonField = page.locator("textarea");
  if (await reasonField.isVisible().catch(() => false)) {
    await reasonField.fill(reason);
  }

  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

test.describe("Leave Actions", () => {
  test("Staff edits a PENDING leave request", async ({ page }) => {
    await loginAsStaff(page);

    // Create a leave to edit
    const marker = testId();
    await submitNPLLeave(page, 30, `${marker} original`);

    // Go to leave list → Pending tab
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Click Edit on first pending leave
    const editLink = page
      .locator('table a[href*="/leave/edit/"]')
      .first();
    await expect(editLink).toBeVisible({ timeout: 10000 });
    await editLink.click();

    await page.waitForURL(/\/leave\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit", {
      timeout: 15000,
    });

    // Update the reason
    const editReason = page.locator("textarea");
    if (await editReason.isVisible().catch(() => false)) {
      await editReason.fill(`${marker} edited`);
    }

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/leave$/, { timeout: 10000 });
    expect(page.url()).toContain("/leave");
    expect(page.url()).not.toContain("/edit");

    // Cleanup
    await cancelFirstPendingLeave(page);
  });

  test("Staff cancels a PENDING leave request", async ({ page }) => {
    await loginAsStaff(page);

    // Create a leave to cancel
    await submitNPLLeave(page, 35, `${testId()} cancel test`);

    // Go to leave list → Pending tab → Cancel
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
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

    await expect(page.locator("body")).toContainText("Cancel this leave?");
    await page.locator('table button:has-text("Yes, Cancel")').click();
    await page.waitForTimeout(2000);

    // Verify cancelled
    const bodyText = await page.locator("body").textContent();
    expect(
      bodyText?.includes("Cancelled") || bodyText?.includes("CANCELLED")
    ).toBeTruthy();
  });

  test("Admin approves then resets leave, staff cleans up", async ({
    page,
  }) => {
    // Staff creates leave with unique marker
    await loginAsStaff(page);
    const marker = testId();
    await submitNPLLeave(page, 40, `${marker} approve-reset`);
    await logout(page);

    // Admin approves — search by marker to target the exact leave
    await loginAsAdmin(page);
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search leaves..."]', marker);
    await page.waitForTimeout(1000);

    const approveBtn = page
      .locator('table button:has-text("Approve")')
      .first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();
    await page.waitForTimeout(2000);

    // Navigate to Approved tab, search again, and reset
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search leaves..."]', marker);
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

    // Staff cancels the reset leave
    await logout(page);
    await loginAsStaff(page);
    await cancelFirstPendingLeave(page);
  });

  test("Admin rejects then resets leave, staff cleans up", async ({
    page,
  }) => {
    // Staff creates leave with unique marker
    await loginAsStaff(page);
    const marker = testId();
    await submitNPLLeave(page, 45, `${marker} reject-reset`);
    await logout(page);

    // Admin rejects — search by marker to target the exact leave
    await loginAsAdmin(page);
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search leaves..."]', marker);
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
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search leaves..."]', marker);
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

    // Staff cancels the reset leave
    await logout(page);
    await loginAsStaff(page);
    await cancelFirstPendingLeave(page);
  });
});
