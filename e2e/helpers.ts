import { Page, expect } from "@playwright/test";

const TEST_PASSWORD = process.env.TEST_PASSWORD || "123456";

// ── Viewport Helpers ──

/** Check if the current page is using a mobile viewport (<1024px) */
export function isMobile(page: Page): boolean {
  const viewport = page.viewportSize();
  return !!viewport && viewport.width < 1024;
}

/** Check if viewport is small (< 640px) — mobile card view instead of table */
export function isSmallScreen(page: Page): boolean {
  const viewport = page.viewportSize();
  return !!viewport && viewport.width < 640;
}

/**
 * Returns a scoped locator for the visible list view.
 * Leave/expense lists render two views: mobile cards (sm:hidden) and desktop table (hidden sm:block).
 * On viewports >= 640px the table is visible; on smaller viewports, the card view is.
 * Using an unscoped locator with .first() picks the first DOM element, which may be hidden.
 */
export function listScope(page: Page): import("@playwright/test").Locator {
  if (isSmallScreen(page)) {
    // Mobile card view is the visible container
    return page.locator("main");
  }
  // Desktop: table is the visible list container
  return page.locator("table").first();
}

/** Open mobile hamburger menu (Sheet sidebar). No-op on desktop. */
export async function openMobileMenu(page: Page) {
  if (!isMobile(page)) return;
  // The hamburger button is inside <header> with sr-only "Open menu" text
  const menuBtn = page.getByRole("button", { name: "Open menu" });
  await expect(menuBtn).toBeVisible({ timeout: 5000 });
  await menuBtn.click();
  // Wait for the Radix Sheet dialog to actually open
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/** Close mobile menu if open. No-op on desktop. */
export async function closeMobileMenu(page: Page) {
  if (!isMobile(page)) return;
  await page.keyboard.press("Escape");
  // Wait for Sheet dialog to close
  await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3000 }).catch(() => {});
}

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

// ── DatePicker Helper ──

/**
 * Fill a DatePicker component by its id.
 * DatePicker uses type="text" inputs (not native type="date").
 * Uses click → fill → verify to ensure React state updates on all viewports.
 */
export async function fillDatePicker(page: Page, id: string, value: string) {
  const input = page.locator(`#${id}`);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click();
  await input.fill(value);
  // Verify the value was set, retry with keyboard input if needed
  const actual = await input.inputValue();
  if (actual !== value) {
    await input.click({ clickCount: 3 });
    await input.pressSequentially(value, { delay: 50 });
  }
  await input.blur();
  await page.waitForTimeout(300);
}

// ── Unique ID Helper ──

/** Returns a short unique string for test data identification */
export function testId(): string {
  return `E2E-${Date.now()}`;
}

// ── Status Filter Helper ──

/**
 * Select a status filter tab on leave/expense list pages.
 * Desktop uses tab buttons; mobile uses a combobox/dropdown.
 */
export async function selectStatusFilter(page: Page, status: string) {
  if (isSmallScreen(page)) {
    // Mobile: click the combobox dropdown and select the option
    const combobox = page.locator('[role="combobox"]').first();
    if (await combobox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await combobox.click();
      await page.waitForTimeout(300);
      const option = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${status}$`, "i") });
      await option.first().click();
      await page.waitForTimeout(500);
      return;
    }
  }
  // Desktop: click the tab button
  await page.locator("button").filter({ hasText: new RegExp(`^${status}$`) }).click();
  await page.waitForTimeout(500);
}

// ── View Toggle Helpers ──

export async function switchToStaffView(page: Page) {
  // Scope to header/banner to avoid matching user nav buttons
  const staffBtn = page.locator('[role="banner"] button, header button')
    .filter({ hasText: /Show as Staff|^Staff$/ })
    .first();
  if (await staffBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await staffBtn.click();
    await page.waitForTimeout(1000);
  }
}

export async function switchToAdminView(page: Page) {
  // Scope to header/banner to avoid matching user nav buttons
  const adminBtn = page.locator('[role="banner"] button, header button')
    .filter({ hasText: /Show as Admin|^Admin$/ })
    .first();
  if (await adminBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }
}

// ── Navigation Helpers ──

/**
 * Check if a nav link is visible/present.
 * Desktop: checks visibility in the sidebar.
 * Mobile: checks DOM existence — the hidden desktop sidebar still renders links based on RBAC,
 * so a link in the DOM means RBAC allows it. Avoids flaky Sheet hamburger interactions.
 */
export async function isNavLinkVisible(page: Page, href: string): Promise<boolean> {
  if (isMobile(page)) {
    // Wait for sidebar to hydrate with correct view state (cookie polling every 500ms)
    await page.waitForTimeout(1000);
    const count = await page.locator(`a[href="${href}"]`).count();
    return count > 0;
  }
  try {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible({ timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Assert a nav link is NOT visible/present.
 * Desktop: checks the link is not visible in sidebar.
 * Mobile: checks link does NOT exist in DOM (RBAC hides it by not rendering).
 */
export async function isNavLinkHidden(page: Page, href: string): Promise<boolean> {
  if (isMobile(page)) {
    // Wait for sidebar to hydrate with correct view state (cookie polling every 500ms)
    await page.waitForTimeout(1000);
    const count = await page.locator(`a[href="${href}"]`).count();
    return count === 0;
  }
  try {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible({ timeout: 3000 });
    return false;
  } catch {
    return true;
  }
}

// ── Leave Cleanup ──

/** Cancel the first PENDING leave on the leave list (staff view) */
export async function cancelFirstPendingLeave(page: Page) {
  await page.goto("/leave");
  await expect(page.locator("body")).toContainText("Leave", { timeout: 15000 });
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
}

// ── Expense Cleanup ──

/** Cancel the first PENDING expense on the expense list (staff view) */
export async function cancelFirstPendingExpense(page: Page) {
  await page.goto("/expenses");
  await expect(page.locator("body")).toContainText("Expense", {
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
  await expect(page.locator("body")).toContainText("Cancel this expense?");
  await scope.locator('button:has-text("Yes, Cancel")').first().click();
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
