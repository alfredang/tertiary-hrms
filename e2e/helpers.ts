import { Page, expect } from "@playwright/test";

const TEST_PASSWORD = process.env.TEST_PASSWORD || "123456";

// ── Login Helpers ──

export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForSelector("#email", { state: "visible", timeout: 15000 });
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await expect(page.locator("body")).toContainText("Welcome", { timeout: 15000 });
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, "admin@tertiaryinfotech.com");
}

export async function loginAsStaff(page: Page) {
  await loginAs(page, "staff@tertiaryinfotech.com");
}

export async function loginAsStaff2(page: Page) {
  await loginAs(page, "staff2@tertiaryinfotech.com");
}

export async function logout(page: Page) {
  await page.goto("/api/auth/signout");
  const signOutBtn = page.locator('button:has-text("Sign out")');
  if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutBtn.click();
  }
  await page.waitForURL(/\/login/, { timeout: 10000 });
}

// ── Date Helpers ──

/** Returns YYYY-MM-DD string N days from today */
export function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Returns today's date as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Unique ID Helper ──

/** Returns a short unique string for test data identification */
export function testId(): string {
  return `E2E-${Date.now()}`;
}

// ── View Toggle Helpers ──

export async function switchToStaffView(page: Page) {
  const staffBtn = page.locator(
    'button:has-text("Show as Staff"), button:has-text("Staff")'
  );
  if (await staffBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await staffBtn.first().click();
    await page.waitForTimeout(1000);
  }
}

export async function switchToAdminView(page: Page) {
  const adminBtn = page.locator(
    'button:has-text("Show as Admin"), button:has-text("Admin")'
  );
  if (await adminBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await adminBtn.first().click();
    await page.waitForTimeout(1000);
  }
}

// ── Leave Cleanup ──

/** Cancel the first PENDING leave on the leave list (staff view) */
export async function cancelFirstPendingLeave(page: Page) {
  await page.goto("/leave");
  await expect(page.locator("body")).toContainText("Leave", { timeout: 15000 });
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
}

// ── Expense Cleanup ──

/** Cancel the first PENDING expense on the expense list (staff view) */
export async function cancelFirstPendingExpense(page: Page) {
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
}

// ── Calendar Cleanup ──

/** Delete a calendar event by its unique title on a given day */
export async function deleteCalendarEvent(
  page: Page,
  date: string,
  title: string
) {
  await page.goto(`/calendar/day/${date}`);
  await expect(page.locator("body")).toContainText("Back", { timeout: 15000 });
  await page.waitForTimeout(1000);

  const card = page
    .locator("div.rounded-lg.p-4")
    .filter({ has: page.getByText(title, { exact: true }) });

  const deleteBtn = card.locator('button:has-text("Delete")');
  await expect(deleteBtn).toBeVisible({ timeout: 10000 });
  await deleteBtn.click();

  await expect(page.locator("body")).toContainText("Delete this event?", {
    timeout: 5000,
  });
  await page.locator('button:has-text("Yes, Delete")').click();
  await expect(page.locator("body")).not.toContainText(title, {
    timeout: 10000,
  });
}
