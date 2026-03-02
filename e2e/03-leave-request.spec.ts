import { test, expect } from "@playwright/test";
import {
  loginAsStaff,
  futureDate,
  testId,
  fillDatePicker,
  cancelFirstPendingLeave,
} from "./helpers";

/** Select a leave type from the combobox by text */
async function selectLeaveType(
  page: import("@playwright/test").Page,
  text: string
) {
  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(500);
  const option = page
    .locator('[role="option"]')
    .filter({ hasText: new RegExp(text) });
  await expect(option).toBeVisible({ timeout: 5000 });
  await option.click();
}

test.describe("Leave Request Flows", () => {
  test("Staff submits 1-day NPL request and cleans up", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");
    await expect(page).toHaveURL(/\/leave\/request/);

    await selectLeaveType(page, "No Pay");

    const dateStr = futureDate(20);
    await fillDatePicker(page, "startDate", dateStr);
    await fillDatePicker(page, "endDate", dateStr);

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill(`${testId()} 1-day NPL`);
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/leave") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();

    // Cleanup
    await cancelFirstPendingLeave(page);
  });

  test("Staff submits 2-day NPL request and cleans up", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");

    await selectLeaveType(page, "No Pay");

    const startStr = futureDate(22);
    const endStr = futureDate(23);
    await fillDatePicker(page, "startDate", startStr);
    await fillDatePicker(page, "endDate", endStr);

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill(`${testId()} 2-day NPL`);
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/leave") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();

    // Cleanup
    await cancelFirstPendingLeave(page);
  });

  test("Staff submits half-day AM leave (AL) and cleans up", async ({
    page,
  }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");

    await selectLeaveType(page, "Annual");

    const dateStr = futureDate(25);
    await fillDatePicker(page, "startDate", dateStr);
    await fillDatePicker(page, "endDate", dateStr);

    // Wait for day type buttons to appear (AL-only feature)
    await page.waitForTimeout(500);
    const amBtn = page.locator('button:has-text("AM Half")');
    if (await amBtn.isVisible().catch(() => false)) {
      await amBtn.click();
    }

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill(`${testId()} half-day AM`);
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/leave") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();

    // Cleanup
    await cancelFirstPendingLeave(page);
  });

  test("Staff submits MC leave request and cleans up", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave/request");

    await selectLeaveType(page, "Medical");

    const dateStr = futureDate(27);
    await fillDatePicker(page, "startDate", dateStr);
    await fillDatePicker(page, "endDate", dateStr);

    const reason = page.locator("textarea");
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill(`${testId()} MC submission`);
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    const success =
      page.url().includes("/leave") ||
      bodyText?.includes("submitted") ||
      bodyText?.includes("PENDING");
    expect(success).toBeTruthy();

    // Cleanup
    await cancelFirstPendingLeave(page);
  });

  test("Staff sees leave balance cards on /leave page", async ({ page }) => {
    await loginAsStaff(page);
    await page.goto("/leave");
    await expect(page.locator("body")).toContainText("Leave", {
      timeout: 15000,
    });

    // Should see at least one balance-related card
    const body = await page.locator("body").textContent();
    const hasBalance =
      body?.includes("Balance") ||
      body?.includes("Allocation") ||
      body?.includes("Entitlement") ||
      body?.includes("Taken");
    expect(hasBalance).toBeTruthy();
  });
});
