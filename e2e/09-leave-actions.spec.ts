import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff, logout } from "./helpers";

/** Returns a date string (YYYY-MM-DD) N days from today */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

test.describe("Leave Action Tests (Tests 40-42)", () => {
  test("Test 40: Staff edits a PENDING leave request", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");
    await expect(page).toHaveURL(/\/leave\/request/);

    // Select No Pay Leave (NPL) — 14 days, not prorated, so balance doesn't exhaust across runs
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const leaveTypeOption = page.locator('[role="option"]').filter({ hasText: /No Pay/ });
    if (await leaveTypeOption.isVisible().catch(() => false)) {
      await leaveTypeOption.click();
    }

    // Set dates (30 days out to avoid conflicts)
    const dateStr = futureDate(30);
    await page.locator('input[type="date"]').first().fill(dateStr);
    await page.locator('input[type="date"]').nth(1).fill(dateStr);

    // Fill reason
    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill("Playwright edit test - original reason");
    }

    // Submit leave
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Go to leave list
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", { timeout: 15000 });

    // Staff defaults to "All" filter — click Pending tab to filter
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Find the Edit link — scope to table (desktop view) to avoid the hidden mobile card
    const editLink = page.locator('table a[href*="/leave/edit/"]').first();
    await expect(editLink).toBeVisible({ timeout: 10000 });
    await editLink.click();

    // Should navigate to leave edit page
    await page.waitForURL(/\/leave\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit", { timeout: 15000 });

    // Update the reason
    const editReason = page.locator("textarea");
    if (await editReason.isVisible().catch(() => false)) {
      await editReason.fill(`Playwright edit test - updated reason ${Date.now()}`);
    }

    // Submit the edit — should redirect back to /leave on success
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/leave$/, { timeout: 10000 });
    expect(page.url()).toContain("/leave");
    expect(page.url()).not.toContain("/edit");
  });

  test("Test 41: Staff cancels a PENDING leave request", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");
    await expect(page).toHaveURL(/\/leave\/request/);

    // Select No Pay Leave (NPL) — not prorated, won't exhaust balance across runs
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const leaveTypeOption41 = page.locator('[role="option"]').filter({ hasText: /No Pay/ });
    if (await leaveTypeOption41.isVisible().catch(() => false)) {
      await leaveTypeOption41.click();
    }

    // Different future date (+40 days) to avoid overlap with test 40
    const dateStr = futureDate(40);
    await page.locator('input[type="date"]').first().fill(dateStr);
    await page.locator('input[type="date"]').nth(1).fill(dateStr);

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill("Playwright cancel test");
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Go to leave list → filter to Pending tab
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", { timeout: 15000 });
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Click Cancel on the first PENDING leave row
    // Scope to table (desktop view) to avoid hidden mobile cards; exact match avoids "Cancelled" pill
    const cancelBtn = page.locator("table button").filter({ hasText: /^Cancel$/ }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Verify the inline confirm prompt appears
    await expect(page.locator("body")).toContainText("Cancel this leave?", { timeout: 5000 });

    // Confirm cancellation — also scope to table
    await page.locator('table button:has-text("Yes, Cancel")').click();
    await page.waitForTimeout(2000);

    // Verify cancelled (toast or status badge shows "Cancelled" or "CANCELLED")
    const bodyText = await page.locator("body").textContent();
    const cancelled =
      bodyText?.includes("Cancelled") ||
      bodyText?.includes("cancelled") ||
      bodyText?.includes("CANCELLED");
    expect(cancelled).toBeTruthy();
  });

  test("Test 42: Admin resets an APPROVED leave to PENDING", async ({ page }) => {
    // --- Staff: submit a leave request ---
    await loginAsStaff(page);
    await page.goto("/leave/request");
    await expect(page).toHaveURL(/\/leave\/request/);

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const leaveTypeOption42 = page.locator('[role="option"]').filter({ hasText: /No Pay/ });
    if (await leaveTypeOption42.isVisible().catch(() => false)) {
      await leaveTypeOption42.click();
    }

    const dateStr = futureDate(50);
    await page.locator('input[type="date"]').first().fill(dateStr);
    await page.locator('input[type="date"]').nth(1).fill(dateStr);

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill("Playwright reset test");
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // --- Switch to admin ---
    await logout(page);
    await loginAsAdmin(page);

    // Admin leave list defaults to "PENDING" filter — should show the leave just submitted
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Approve the first pending leave — require it to be visible (not optional)
    // window.location.reload() is called after approve
    const approveBtn = page.locator('table button:has-text("Approve")').first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();

    // After approve, window.location.reload() fires — re-navigate explicitly for reliability
    await page.waitForTimeout(3000);
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", { timeout: 10000 });

    // Click the "Approved" filter tab to see approved leaves
    await page.locator("button").filter({ hasText: /^Approved$/ }).click();
    await page.waitForTimeout(500);

    // Find the Reset to Pending icon button — scope to table
    const resetBtn = page.locator('table button[title="Reset to Pending"]').first();
    await expect(resetBtn).toBeVisible({ timeout: 10000 });
    await resetBtn.click();

    // Verify "Confirm Reset" button appears (the reset confirm panel)
    await expect(page.locator("body")).toContainText("Confirm Reset", { timeout: 5000 });

    // Click Confirm Reset — scope to table; wait for reload + re-render
    await page.locator('table button:has-text("Confirm Reset")').click();
    await expect(page.locator("body")).toContainText("PENDING", { timeout: 10000 });
  });
});
