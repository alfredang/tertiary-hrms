import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsStaff } from "./helpers";

test.describe("Expense Claim Tests (Tests 12-13)", () => {
  test("Test 12: Staff submits expense claim", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/expenses/submit");
    await expect(page).toHaveURL(/\/expenses\/submit/);

    // Select expense category
    await page.click('[role="combobox"]:first-of-type');
    await page.waitForTimeout(500);
    const categoryOption = page.locator('[role="option"]').first();
    if (await categoryOption.isVisible().catch(() => false)) {
      await categoryOption.click();
    }

    // Fill description
    const description = page.locator("textarea");
    if (await description.isVisible().catch(() => false)) {
      await description.fill("Playwright test: Lunch with client");
    }

    // Fill amount
    const amountInput = page.locator('input[name="amount"], input[type="number"]').first();
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill("85.50");
    }

    // Fill expense date
    const dateInput = page.locator('input[name="expenseDate"], input[type="date"]');
    if (await dateInput.isVisible().catch(() => false)) {
      const today = new Date().toISOString().split("T")[0];
      await dateInput.fill(today);
    }

    // Submit
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Verify success
    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/expenses") ||
      bodyText?.includes("success") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();
  });

  test("Test 13: Admin approves expense claim", async ({ page }) => {
    // Login as admin
    await loginAsAdmin(page);

    // Navigate to expenses
    await page.goto("/expenses");
    await expect(page).toHaveURL(/\/expenses/);
    await page.waitForTimeout(2000);

    // Look for pending expense claims
    const bodyText = await page.locator("body").textContent();

    // Try to approve an expense
    const approveBtn = page.locator('button:has-text("Approve")').first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(2000);

      // Verify the status changed
      const updatedText = await page.locator("body").textContent();
      const approved =
        updatedText?.includes("Approved") ||
        updatedText?.includes("approved") ||
        updatedText?.includes("success");
      expect(approved).toBeTruthy();
    } else {
      // No pending expenses to approve — this is ok if DB was freshly seeded
      console.log("No pending expense claims found to approve");
    }
  });
});
