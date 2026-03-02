import { test, expect } from "@playwright/test";
import {
  loginAsStaff,
  loginAsAdmin,
  logout,
  futureDate,
  testId,
  fillDatePicker,
  cancelFirstPendingLeave,
  listScope,
  selectStatusFilter,
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
  await fillDatePicker(page, "startDate", dateStr);
  await fillDatePicker(page, "endDate", dateStr);

  const reasonField = page.locator("textarea");
  if (await reasonField.isVisible().catch(() => false)) {
    await reasonField.fill(reason);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/leave$/, { timeout: 15000 });
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
    await selectStatusFilter(page, "Pending");

    // Click Edit on first pending leave (scope to visible container)
    const scope = listScope(page);
    const editLink = scope
      .locator('a[href*="/leave/edit/"]')
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
    await selectStatusFilter(page, "Pending");

    const scope = listScope(page);
    const cancelBtn = scope
      .locator("button")
      .filter({ hasText: /^Cancel$/ })
      .first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    await expect(page.locator("body")).toContainText("Cancel this leave?");
    await scope.locator('button:has-text("Yes, Cancel")').first().click();
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

    const scope1 = listScope(page);
    const approveBtn = scope1
      .locator("button").filter({ hasText: /^Approve$/ })
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
    await selectStatusFilter(page, "Approved");

    const scope2 = listScope(page);
    const resetBtn = scope2
      .locator('button[title="Reset to Pending"]')
      .first();
    await expect(resetBtn).toBeVisible({ timeout: 15000 });
    await resetBtn.click();

    await expect(page.locator("body")).toContainText("Reset to pending?", {
      timeout: 5000,
    });
    await scope2.locator('button:has-text("Yes, Reset")').first().click();
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

    const scope1 = listScope(page);
    const rejectBtn = scope1
      .locator("button").filter({ hasText: /^Reject$/ })
      .first();
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });
    await rejectBtn.click();

    // Complete the two-step reject confirmation
    await expect(page.locator("body")).toContainText("Reject this leave?", {
      timeout: 5000,
    });
    await scope1.locator('button:has-text("Yes, Reject")').first().click();
    await page.waitForTimeout(2000);

    // Navigate to Rejected tab, search again, and reset
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });
    await page.fill('input[placeholder="Search leaves..."]', marker);
    await page.waitForTimeout(1000);
    await selectStatusFilter(page, "Rejected");

    const scope2 = listScope(page);
    const resetBtn = scope2
      .locator('button[title="Reset to Pending"]')
      .first();
    await expect(resetBtn).toBeVisible({ timeout: 15000 });
    await resetBtn.click();

    await expect(page.locator("body")).toContainText("Reset to pending?", {
      timeout: 5000,
    });
    await scope2.locator('button:has-text("Yes, Reset")').first().click();
    await page.waitForTimeout(2000);

    // Staff cancels the reset leave
    await logout(page);
    await loginAsStaff(page);
    await cancelFirstPendingLeave(page);
  });
});
