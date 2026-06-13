/**
 * Habitap (Woods Square) occupant-portal automation client.
 *
 * Drives https://wdsq-prod.myhabitap.com/offices/occupant via Playwright to send
 * building-access invites for staff. Runs SERVER-SIDE only.
 *
 * Flow: log in → create a "Staff Invite" event for the chosen date window → add
 * each staff member as a visitor and send the invite. Habitap then emails each
 * person a one-time PIN; that PIN is never exposed to the admin account, so the
 * HRMS records that the invite was sent rather than the PIN value itself.
 *
 * Requires a Chromium browser binary in the runtime: locally via
 * `npx playwright install chromium`; in production the Docker image installs the
 * system Chromium and points Playwright at it (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).
 */
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "@/lib/prisma";

export const HABITAP = {
  baseUrl: "https://wdsq-prod.myhabitap.com",
  loginPath: "/offices/occupant/login",
  homePath: "/offices/occupant/home",
  /** Stable IDs for the Tertiary Infotech account (discovered from the portal URLs). */
  condoId: "19",
  tenantId: "327",
} as const;

export interface HabitapCredentials {
  username: string;
  password: string;
}

/**
 * Reads the Habitap login from CompanyCredential (preferred) or env vars.
 * Stored under keys HABITAP_USERNAME / HABITAP_PASSWORD via Settings → Credentials.
 */
export async function getHabitapCredentials(): Promise<HabitapCredentials | null> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["HABITAP_USERNAME", "HABITAP_PASSWORD"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.keyName, r.keyValue]));
  const username = map.HABITAP_USERNAME || process.env.HABITAP_USERNAME || "";
  const password = map.HABITAP_PASSWORD || process.env.HABITAP_PASSWORD || "";
  if (!username || !password) return null;
  return { username, password };
}

/** Launches a headless Chromium browser configured for the Habitap portal. */
export async function launchHabitapBrowser(): Promise<Browser> {
  // In production (Docker/Alpine) we use the system Chromium via this env var;
  // locally it's unset, so Playwright uses its own installed browser.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  return chromium.launch({
    headless: true,
    executablePath,
    // --no-sandbox is required to run Chromium inside a container.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

/** Logs in and immediately closes — verifies the stored credentials work. Throws on failure. */
export async function testHabitapLogin(creds: HabitapCredentials): Promise<void> {
  const browser = await launchHabitapBrowser();
  try {
    const page = await browser.newContext().then((c) => c.newPage());
    await loginToHabitap(page, creds);
  } finally {
    await browser.close();
  }
}

/**
 * Logs into the occupant portal. Verified working against production.
 *
 * The login form uses <input name="username"> / <input name="password"> and an
 * <input type="submit" name="loginpass">. A static "Okay" notice overlay and JS
 * dialogs can intercept the submit, so we dismiss them and confirm we land on /home.
 */
export async function loginToHabitap(page: Page, creds: HabitapCredentials): Promise<void> {
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await page.goto(`${HABITAP.baseUrl}${HABITAP.loginPath}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1_000);

  // Dismiss any notice overlay that would intercept the submit click.
  for (const okay of await page.locator('a:has-text("Okay")').all()) {
    await okay.click({ timeout: 1_500 }).catch(() => {});
  }

  await page.locator("input[name=username]").fill(creds.username);
  await page.locator("input[name=password]").fill(creds.password);
  await Promise.all([
    page.waitForURL("**/occupant/home", { timeout: 60_000 }).catch(() => {}),
    page.locator("input[name=loginpass]").click(),
  ]);
  await page.waitForTimeout(1_500);

  if (!page.url().includes("/home")) {
    // Fallback: navigate directly; if we're still bounced to /login the creds failed.
    await page
      .goto(`${HABITAP.baseUrl}${HABITAP.homePath}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => {});
  }
  if (!page.url().includes("/home")) {
    throw new Error("Habitap login failed — check HABITAP_USERNAME / HABITAP_PASSWORD.");
  }
}

/* -------------------------------------------------------------------------- */
/* Visitor-invite ("Staff Invite") flow.                                       */
/*                                                                             */
/* Confirmed flow (Femina): Menu → Visitor Invites → Add New Event → fill the  */
/* event (Host/Contact/Venue are fixed) → Save → View the event → Add visitor  */
/* → fill name+email → Send Invites. Each staff member then receives their     */
/* Habitap building-access invite by email, so the "PIN" is delivered by       */
/* Habitap — there is no PIN string to read back into the HRMS; we record that  */
/* the invite was sent. See docs/habitap-automation.md.                        */
/* -------------------------------------------------------------------------- */

/** Fixed host details for the "Staff Invite" event (always the same). */
export const HABITAP_HOST = { name: "Alfred", mobile: "96983731" } as const;

/** Venue dropdown options (condoUnitId values) discovered from the portal. */
export const HABITAP_VENUES = {
  "#07-85, Tower 1": "141",
  "#07-86, Tower 1": "64",
  "#07-87, Tower 1": "142",
} as const;

export interface EventWindow {
  /** Event name, ≤18 chars. Defaults to "Staff Invite". */
  eventName?: string;
  /** condoUnitId value; defaults to #07-85, Tower 1 ("141"). */
  venueValue?: string;
  /** Date string in the picker's format, e.g. "09 Jun 2026". */
  fromDate: string;
  /** Time string, e.g. "8:00 AM". */
  fromTime: string;
  toDate: string;
  toTime: string;
  message?: string;
}

export interface StaffInvitee {
  /** Visitor Name. */
  name: string;
  /** Visitor Email. */
  email: string;
}

const tenantBase = `${HABITAP.baseUrl}/offices/occupant/condos/${HABITAP.condoId}/tenants/${HABITAP.tenantId}`;

/** Sets a datepicker/timepicker input value and fires the events its JS listens for. */
async function setPickerValue(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value).catch(() => {});
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector<HTMLInputElement>(selector);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    },
    { selector, value },
  );
}

/**
 * Reads the event-window pickers back and throws if any was rejected (left blank) —
 * the format-mismatch failure mode. The error echoes both what we sent and what the
 * picker kept, so the accepted format can be locked in. Exported so it can be tested
 * against a fixture page without driving the live portal.
 */
export async function assertEventWindowAccepted(page: Page, win: EventWindow): Promise<void> {
  const picker = (await page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((s) => [s, document.querySelector<HTMLInputElement>(s)?.value ?? ""]),
      ),
    ["#from", "#fromTime", "#to", "#toTime"],
  )) as Record<string, string>;
  const rejected = Object.entries(picker)
    .filter(([, v]) => !v.trim())
    .map(([s]) => s);
  if (rejected.length) {
    throw new Error(
      `Habitap rejected the event window — pickers left blank: ${rejected.join(", ")}. ` +
        `Sent from="${win.fromDate}" / "${win.fromTime}", to="${win.toDate}" / "${win.toTime}"; ` +
        `kept ${JSON.stringify(picker)}. The picker likely expects a different date/time format.`,
    );
  }
}

/**
 * Creates one "Staff Invite" event and returns its event id.
 * The add form loads in a modal (#modal-event-add) via the "Add New Event" link.
 */
export async function createStaffInviteEvent(page: Page, win: EventWindow): Promise<string> {
  const eventName = (win.eventName ?? "Staff Invite").slice(0, 18);
  const venueValue = win.venueValue ?? HABITAP_VENUES["#07-85, Tower 1"];

  await page.goto(`${tenantBase}/front-eventInfos`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('a:has-text("Add New Event")').first().click({ timeout: 15_000 });
  await page.locator("#name").waitFor({ state: "visible", timeout: 15_000 });

  await page.locator("#name").fill(eventName);
  // Host / Contact come pre-filled and fixed — re-assert in case they are blank.
  await page.locator("#hostName").fill(HABITAP_HOST.name);
  await page.locator("#hostMobileNumber").fill(HABITAP_HOST.mobile);
  await page.locator("#condoUnitId").selectOption(venueValue);
  await setPickerValue(page, "#from", win.fromDate);
  await setPickerValue(page, "#fromTime", win.fromTime);
  await setPickerValue(page, "#to", win.toDate);
  await setPickerValue(page, "#toTime", win.toTime);

  // The pickers run their own validation/formatting on blur, so confirm they kept
  // the window before we save — otherwise a bad date/time format would silently
  // create an event with no window.
  await page.waitForTimeout(300);
  await assertEventWindowAccepted(page, win);

  if (win.message) await page.locator("#message").fill(win.message);

  await page.locator("#pts_event_submit_btn").click({ timeout: 15_000 });
  // After save the modal closes and the list refreshes; wait for it to settle.
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_500);

  // The newest event is the first row — read its View link to get the event id.
  const href = await page
    .locator('a[href*="/front-eventInfos/"][href$="/detail"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  const id = href?.match(/front-eventInfos\/(\d+)\/detail/)?.[1];
  if (!id) throw new Error("Could not determine the new Habitap event id after saving.");
  return id;
}

/**
 * Adds one visitor to an event and sends their invite.
 * Form: /events/{eventId}/front-invitationInfos/add
 *  - input[name=firstName]  → Visitor Name
 *  - input[name=emailAddress] → Visitor Email
 *  - a#send_invites_and_complete_btn → commit + email the invite
 */
export async function addVisitorToEvent(page: Page, eventId: string, invitee: StaffInvitee): Promise<void> {
  await page.goto(`${tenantBase}/events/${eventId}/front-invitationInfos/add`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.locator('input[name="firstName"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('input[name="firstName"]').fill(invitee.name);
  await page.locator('input[name="emailAddress"]').fill(invitee.email);
  await page.locator("#send_invites_and_complete_btn").click({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/** Batches of this size or larger use the CSV "Import Visitor" upload instead of
 *  adding people one-by-one. Anything above 1 (i.e. 2+) goes through the bulk
 *  import; a single invite still uses the one-by-one path. */
export const BULK_IMPORT_MIN = 2;

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the portal's import CSV: header "Invitee Name,Invitee's Email" + one row each. */
function buildVisitorCsv(invitees: StaffInvitee[]): string {
  const rows = invitees.map((i) => `${csvCell(i.name)},${csvCell(i.email)}`);
  return ["Invitee Name,Invitee's Email", ...rows].join("\r\n") + "\r\n";
}

/**
 * Adds all visitors at once via the portal's "Import Visitor" CSV upload.
 * Event detail → "Import Visitor" modal → upload #uploadfile (.csv) → click "Import".
 * The portal processes the list and sends every invite in one go.
 */
export async function addVisitorsViaImport(
  page: Page,
  eventId: string,
  invitees: StaffInvitee[],
): Promise<void> {
  await page.goto(`${tenantBase}/front-eventInfos/${eventId}/detail`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.locator('a:has-text("Import Visitor")').first().click({ timeout: 15_000 });

  const fileInput = page.locator("#uploadfile");
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles({
    name: "visitors.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(buildVisitorCsv(invitees), "utf-8"),
  });
  await page.locator('input[type=submit][value="Import"]').click({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
}

export interface GenerateResult {
  eventId: string;
  invited: StaffInvitee[];
  failed: { invitee: StaffInvitee; error: string }[];
}

/** Adds visitors one at a time, collecting precise per-person Sent/Failed results. */
async function addVisitorsOneByOne(
  page: Page,
  eventId: string,
  staff: StaffInvitee[],
): Promise<{ invited: StaffInvitee[]; failed: GenerateResult["failed"] }> {
  const invited: StaffInvitee[] = [];
  const failed: GenerateResult["failed"] = [];
  for (const invitee of staff) {
    try {
      await addVisitorToEvent(page, eventId, invitee);
      invited.push(invitee);
    } catch (err) {
      failed.push({ invitee, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { invited, failed };
}

/**
 * End-to-end: log in, create one "Staff Invite" event, add every staff member as
 * a visitor, and send their invites. Caller owns the staff list and date window.
 */
export async function generateStaffInvites(
  creds: HabitapCredentials,
  staff: StaffInvitee[],
  win: EventWindow,
): Promise<GenerateResult> {
  const browser = await launchHabitapBrowser();
  try {
    const page = await browser.newContext().then((c) => c.newPage());
    await loginToHabitap(page, creds);
    const eventId = await createStaffInviteEvent(page, win);

    // Large batch → one CSV upload (fast, no per-visitor timeout). The bulk import
    // gives no per-person results, so on success we count the whole batch as sent.
    // If it throws, it failed before any invite went out (the post-submit waits are
    // swallowed, so a throw means upload/submit never completed) — fall back to the
    // one-by-one path to salvage the people who succeed and pinpoint who actually
    // fails, instead of marking the entire batch failed.
    if (staff.length >= BULK_IMPORT_MIN) {
      try {
        await addVisitorsViaImport(page, eventId, staff);
        return { eventId, invited: staff, failed: [] };
      } catch {
        const { invited, failed } = await addVisitorsOneByOne(page, eventId, staff);
        return { eventId, invited, failed };
      }
    }

    // Small batch → add one-by-one for precise per-person Sent/Failed results.
    const { invited, failed } = await addVisitorsOneByOne(page, eventId, staff);
    return { eventId, invited, failed };
  } finally {
    await browser.close();
  }
}
