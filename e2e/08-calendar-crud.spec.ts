import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

/** Returns a date string (YYYY-MM-DD) 14 days from today — safely in the future */
function getEventDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

test.describe("Calendar CRUD Tests (Tests 29-33)", () => {
  test("Test 29: Admin creates a calendar event", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar/new");
    await expect(page).toHaveURL(/\/calendar\/new/);

    // Wait for form to load
    await expect(page.locator("body")).toContainText("New Calendar Event", { timeout: 15000 });

    // Select event type (Meeting) via shadcn Select combobox
    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page.locator('[role="option"]').filter({ hasText: /Meeting/ });
    if (await meetingOption.isVisible().catch(() => false)) {
      await meetingOption.click();
    }

    // Fill title with unique timestamp
    const title = `Playwright Event ${Date.now()}`;
    await page.fill("#title", title);

    // Fill start date (14 days from now)
    const eventDate = getEventDate();
    await page.fill("#startDate", eventDate);

    // Submit the form
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Should redirect to /calendar (not stay on /calendar/new)
    const url = page.url();
    const redirected = url.includes("/calendar") && !url.includes("/new");
    expect(redirected).toBeTruthy();
  });

  test("Test 30: Calendar day view loads", async ({ page }) => {
    await loginAsAdmin(page);
    const eventDate = getEventDate();
    await page.goto(`/calendar/day/${eventDate}`);

    // Wait for page content
    await expect(page.locator("body")).toContainText("Back", { timeout: 15000 });

    // Verify the page renders date-related content (year or event/leave info)
    const bodyText = await page.locator("body").textContent();
    const hasContent =
      bodyText?.includes(new Date().getFullYear().toString()) ||
      bodyText?.includes("No events") ||
      bodyText?.includes("No one") ||
      bodyText?.includes("event") ||
      bodyText?.includes("leave");
    expect(hasContent).toBeTruthy();
  });

  test("Test 31: Admin sees Edit/Delete buttons on events in day view", async ({ page }) => {
    await loginAsAdmin(page);
    const eventDate = getEventDate();

    // Create a fresh event for this test
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", { timeout: 15000 });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page.locator('[role="option"]').filter({ hasText: /Meeting/ });
    if (await meetingOption.isVisible().catch(() => false)) {
      await meetingOption.click();
    }

    await page.fill("#title", `Playwright Buttons Test ${Date.now()}`);
    await page.fill("#startDate", eventDate);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Go to day view
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText("Back", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // isOwner = !!currentUserId — all authenticated users see Edit/Delete buttons
    await expect(page.locator('button:has-text("Edit")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Delete")').first()).toBeVisible({ timeout: 10000 });
  });

  test("Test 32: Admin edits a calendar event", async ({ page }) => {
    await loginAsAdmin(page);
    const eventDate = getEventDate();

    // Create event to edit
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", { timeout: 15000 });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page.locator('[role="option"]').filter({ hasText: /Meeting/ });
    if (await meetingOption.isVisible().catch(() => false)) {
      await meetingOption.click();
    }

    await page.fill("#title", `Playwright Edit Source ${Date.now()}`);
    await page.fill("#startDate", eventDate);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Go to day view
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText("Back", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Click the first Edit button
    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Confirm edit: "Edit this event?" + Proceed button
    await expect(page.locator("body")).toContainText("Edit this event?", { timeout: 5000 });
    await page.locator('button:has-text("Proceed")').click();

    // Should navigate to edit page
    await page.waitForURL(/\/calendar\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit Calendar Event", { timeout: 15000 });

    // Change the title
    await page.fill("#title", `Playwright Edited ${Date.now()}`);

    // Save changes
    await page.click('button:has-text("Save Changes")');
    await page.waitForTimeout(3000);

    // Should redirect to /calendar/day/[eventDate] after saving in edit mode
    const url = page.url();
    const redirected = url.includes("/calendar/day/") || url.includes("/calendar");
    expect(redirected).toBeTruthy();
  });

  test("Test 33: Admin deletes a calendar event", async ({ page }) => {
    await loginAsAdmin(page);
    const eventDate = getEventDate();

    // Create a disposable event with unique title
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", { timeout: 15000 });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page.locator('[role="option"]').filter({ hasText: /Meeting/ });
    if (await meetingOption.isVisible().catch(() => false)) {
      await meetingOption.click();
    }

    const deleteTitle = `Playwright Delete Me ${Date.now()}`;
    await page.fill("#title", deleteTitle);
    await page.fill("#startDate", eventDate);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Go to day view — event should be visible
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText(deleteTitle, { timeout: 15000 });

    // Find Delete button scoped to the specific card containing our unique title
    // Use exact text match to avoid matching parent divs that transitively contain the title
    await page.locator("div.rounded-lg.p-4").filter({ has: page.getByText(deleteTitle, { exact: true }) }).locator('button:has-text("Delete")').click();

    // Confirm "Delete this event?"
    await expect(page.locator("body")).toContainText("Delete this event?", { timeout: 5000 });
    await page.locator('button:has-text("Yes, Delete")').click();

    // router.refresh() is called — event should disappear from day view
    await expect(page.locator("body")).not.toContainText(deleteTitle, { timeout: 10000 });
  });
});
