import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff, logout } from "./helpers";

/** Today's date as YYYY-MM-DD (expense dates must not be in the future) */
function today(): string {
  return new Date().toISOString().split("T")[0];
}

test.describe("Expense Action Tests (Tests 43-45)", () => {
  test("Test 43: Staff edits a PENDING expense claim", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page).toHaveURL(/\/expenses\/submit/);

    // Wait for form to load
    await expect(page.locator("body")).toContainText("Expense Claim", { timeout: 15000 });

    // Select expense category — require it to be visible (not optional)
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[role="option"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    // Fill description using ID selector (controlled textarea)
    await page.fill("#description", `Playwright Edit Expense ${Date.now()}`);

    // Fill amount using ID selector
    await page.fill("#amount", "55.00");

    // Fill date using ID selector (today — server blocks future dates)
    await page.fill("#expenseDate", today());

    // Submit — if category/description/amount/date all filled, button is enabled
    await page.click('button[type="submit"]');

    // Wait for redirect to /expenses (router.push called on success)
    await page.waitForURL(/\/expenses$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Expense", { timeout: 15000 });

    // Staff defaults to "All" filter — click Pending tab
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Find and click the Edit link — scope to table (desktop view) to avoid hidden mobile cards
    const editLink = page.locator('table a[href*="/expenses/edit/"]').first();
    await expect(editLink).toBeVisible({ timeout: 10000 });
    await editLink.click();

    // Should navigate to expense edit page
    await page.waitForURL(/\/expenses\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit", { timeout: 15000 });

    // Change the description (fill textarea with new text)
    const editDescription = page.locator("textarea").first();
    await expect(editDescription).toBeVisible({ timeout: 5000 });
    await editDescription.fill(`Playwright Edited Expense ${Date.now()}`);

    // Submit the edit — should redirect back to /expenses on success
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/expenses$/, { timeout: 10000 });
    expect(page.url()).toContain("/expenses");
    expect(page.url()).not.toContain("/edit");
  });

  test("Test 44: Staff cancels a PENDING expense claim", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page).toHaveURL(/\/expenses\/submit/);

    // Wait for form to load
    await expect(page.locator("body")).toContainText("Expense Claim", { timeout: 15000 });

    // Select category — require it to be visible
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[role="option"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    // Fill description, amount, date using ID selectors
    await page.fill("#description", `Playwright Cancel Expense ${Date.now()}`);
    await page.fill("#amount", "30.00");
    await page.fill("#expenseDate", today());

    await page.click('button[type="submit"]');

    // Wait for redirect to /expenses
    await page.waitForURL(/\/expenses$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Expense", { timeout: 15000 });

    // Click Pending tab
    await page.locator("button").filter({ hasText: /^Pending$/ }).click();
    await page.waitForTimeout(500);

    // Click Cancel on first PENDING expense — scope to table; exact match avoids "Cancelled" pill
    const cancelBtn = page.locator("table button").filter({ hasText: /^Cancel$/ }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Verify the inline confirm prompt appears
    await expect(page.locator("body")).toContainText("Cancel this expense?", { timeout: 5000 });

    // Confirm cancellation — scope to table
    await page.locator('table button:has-text("Yes, Cancel")').click();
    await page.waitForTimeout(2000);

    // Verify cancelled (toast or status badge)
    const bodyText = await page.locator("body").textContent();
    const cancelled =
      bodyText?.includes("Cancelled") ||
      bodyText?.includes("cancelled") ||
      bodyText?.includes("CANCELLED");
    expect(cancelled).toBeTruthy();
  });

  test("Test 45: Admin resets an APPROVED expense to PENDING", async ({ page }) => {
    // --- Staff: submit an expense claim ---
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page).toHaveURL(/\/expenses\/submit/);

    // Wait for form to load
    await expect(page.locator("body")).toContainText("Expense Claim", { timeout: 15000 });

    // Select category — require it to be visible
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[role="option"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    // Fill description, amount, date using ID selectors
    await page.fill("#description", `Playwright Reset Expense ${Date.now()}`);
    await page.fill("#amount", "75.00");
    await page.fill("#expenseDate", today());

    await page.click('button[type="submit"]');

    // Wait for redirect to /expenses
    await page.waitForURL(/\/expenses$/, { timeout: 15000 });

    // --- Switch to admin ---
    await logout(page);
    await loginAsAdmin(page);

    // Admin expense list defaults to "PENDING" — should show newly submitted expense
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Approve the first pending expense — require it to be visible (not optional)
    // window.location.reload() is called after approve
    const approveBtn = page.locator('table button:has-text("Approve")').first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();

    // After approve, window.location.reload() fires — re-navigate explicitly for reliability
    await page.waitForTimeout(3000);
    await page.goto("/expenses");
    await expect(page.locator("body")).toContainText("Expense", { timeout: 10000 });

    // Click the "Approved" filter tab to see approved expenses
    await page.locator("button").filter({ hasText: /^Approved$/ }).click();
    await page.waitForTimeout(500);

    // Find the Reset to Pending icon button — scope to table
    const resetBtn = page.locator('table button[title="Reset to Pending"]').first();
    await expect(resetBtn).toBeVisible({ timeout: 10000 });
    await resetBtn.click();

    // Verify "Confirm Reset" button appears
    await expect(page.locator("body")).toContainText("Confirm Reset", { timeout: 5000 });

    // Click Confirm Reset — scope to table
    await page.locator('table button:has-text("Confirm Reset")').click();

    // Wait for window.location.reload() + re-render; admin defaults to PENDING filter after reload
    await expect(page.locator("body")).toContainText("PENDING", { timeout: 10000 });
  });
});
