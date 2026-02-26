import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  loginAsStaff,
  futureDate,
  testId,
  deleteCalendarEvent,
} from "./helpers";

test.describe("Calendar View", () => {
  test("Calendar shows current month and year", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.locator("body")).toContainText("Calendar", {
      timeout: 15000,
    });

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const now = new Date();
    await expect(page.locator("body")).toContainText(monthNames[now.getMonth()]);
    await expect(page.locator("body")).toContainText(
      now.getFullYear().toString()
    );
  });

  test("Calendar shows day headers", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page.locator("body")).toContainText("Calendar", {
      timeout: 15000,
    });

    await expect(page.locator("body")).toContainText("Mon");
    await expect(page.locator("body")).toContainText("Tue");
    await expect(page.locator("body")).toContainText("Wed");
  });

  test("Calendar has Today button and navigation", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page.locator("body")).toContainText("Calendar", {
      timeout: 15000,
    });

    await expect(page.locator('button:has-text("Today")')).toBeVisible();
  });

  test("Calendar shows event type legend", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page.locator("body")).toContainText("Calendar", {
      timeout: 15000,
    });

    const bodyText = await page.locator("body").textContent();
    const hasLegend =
      bodyText?.includes("Holiday") ||
      bodyText?.includes("Leave") ||
      bodyText?.includes("Meeting") ||
      bodyText?.includes("Event");
    expect(hasLegend).toBeTruthy();
  });
});

test.describe("Calendar CRUD", () => {
  test("Admin creates event, views on day detail, deletes it", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const eventDate = futureDate(14);
    const title = `${testId()} Meeting`;

    // Create event
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", {
      timeout: 15000,
    });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page
      .locator('[role="option"]')
      .filter({ hasText: /Meeting/ });
    await expect(meetingOption).toBeVisible({ timeout: 5000 });
    await meetingOption.click();

    await page.fill("#title", title);
    await page.fill("#startDate", eventDate);

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Verify redirect to calendar
    const url = page.url();
    expect(url.includes("/calendar") && !url.includes("/new")).toBeTruthy();

    // Verify on day view
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText(title, {
      timeout: 15000,
    });

    // Cleanup: delete event
    await deleteCalendarEvent(page, eventDate, title);
  });

  test("Admin edits a calendar event title, then deletes it", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const eventDate = futureDate(15);
    const originalTitle = `${testId()} Edit Source`;
    const editedTitle = `${testId()} Edited`;

    // Create event
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", {
      timeout: 15000,
    });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page
      .locator('[role="option"]')
      .filter({ hasText: /Meeting/ });
    await expect(meetingOption).toBeVisible({ timeout: 5000 });
    await meetingOption.click();

    await page.fill("#title", originalTitle);
    await page.fill("#startDate", eventDate);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Go to day view and click Edit
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText(originalTitle, {
      timeout: 15000,
    });

    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Edit button navigates directly to the edit page
    await page.waitForURL(/\/calendar\/edit\//, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Edit Calendar Event", {
      timeout: 15000,
    });

    // Change title
    await page.fill("#title", editedTitle);
    await page.locator('button:has-text("Save Changes")').click();

    // Edit mode has a two-step save: "Save changes?" → "Confirm"
    await expect(page.locator("body")).toContainText("Save changes?", {
      timeout: 5000,
    });
    await page.locator('button:has-text("Confirm")').click();
    await page.waitForTimeout(2000);

    // Verify the title was changed
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText(editedTitle, {
      timeout: 15000,
    });

    // Cleanup: delete the edited event
    await deleteCalendarEvent(page, eventDate, editedTitle);
  });

  test("Staff can create and delete own calendar event", async ({ page }) => {
    await loginAsStaff(page);
    const eventDate = futureDate(16);
    const title = `${testId()} Staff Event`;

    // Create event
    await page.goto("/calendar/new");
    await expect(page.locator("body")).toContainText("New Calendar Event", {
      timeout: 15000,
    });

    await page.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const meetingOption = page
      .locator('[role="option"]')
      .filter({ hasText: /Meeting/ });
    await expect(meetingOption).toBeVisible({ timeout: 5000 });
    await meetingOption.click();

    await page.fill("#title", title);
    await page.fill("#startDate", eventDate);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Verify on day view
    await page.goto(`/calendar/day/${eventDate}`);
    await expect(page.locator("body")).toContainText(title, {
      timeout: 15000,
    });

    // Cleanup: delete event
    await deleteCalendarEvent(page, eventDate, title);
  });
});
