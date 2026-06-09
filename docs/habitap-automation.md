# Habitap PIN automation

Automates the Habitap occupant portal to generate building-access credentials
("PINs") for staff, triggered from the HRMS.

- **Portal:** https://wdsq-prod.myhabitap.com/offices/occupant/login
- **Account:** Tertiary Infotech (building `WDSQ`). Stable URL IDs: condo `19`, tenant `327`.
- **Tooling:** Playwright (already a project dependency). No Computer Use / MCP needed.

## Confirmed flow (from Femina, via Amanda)

The "PIN" is delivered as a **Visitor Invite** ("Staff Invite" event). Steps:

1. Log in → **Menu → Visitor Invites → Add New Event**.
2. Fill the event. Fixed fields: Host `Alfred`, Contact `96983731`, Venue
   `#07-85, Tower 1`, Event Name `Staff Invite`, hours `8:00 AM`–`11:00 PM`.
   Variable: the date window.
3. **Save** → back on the list, click **View** on the event.
4. **Add visitor** → fill Visitor Name + Visitor Email → **Send Invites and complete**.

Each staff member then receives a Habitap building-access invite **by email** — so
there is **no PIN string to read back** into the HRMS. We record that the invite
was sent (`Employee.habitapInviteAt` + `habitapEventId`).

HRMS-side trigger is **ADMIN-only**. Habitap-side uses the single company occupant
login (`angch@tertiaryinfotech.com`).

## Discovered selectors

**Add Event modal** (`a:has-text("Add New Event")` → `#modal-event-add`):
`#name` (≤18), `#hostName`, `#hostMobileNumber`, `#condoUnitId` (select), `#from`,
`#fromTime`, `#to`, `#toTime`, `#message`, Save = `a#pts_event_submit_btn`.
Venue values: `#07-85, Tower 1` = `141`, `#07-86` = `64`, `#07-87` = `142`.

**Add Visitor form** (`/events/{eventId}/front-invitationInfos/add`):
`input[name=firstName]` (Visitor Name), `input[name=emailAddress]` (Visitor Email),
`a#send_invites_and_complete_btn`, `a#send_invites_and_new_btn`. A bulk **Import
Visitor** path also exists (`…/front-invitationInfos/schedule-import`).

## Status

| Piece | State |
|---|---|
| Login (`loginToHabitap`) | ✅ Verified against production |
| Credential storage (`HABITAP_USERNAME`/`HABITAP_PASSWORD`) | ✅ In `CompanyCredential` via Settings → Credentials |
| `Employee.habitapInviteAt` / `habitapEventId` columns | ✅ In schema (migration **not** run yet) |
| `src/lib/habitap.ts` — create event + add visitors + orchestrator | ✅ Implemented |
| `POST /api/habitap/generate-pin` (admin-only, batch) | ✅ Implemented |
| Date-picker string format | ⚠️ Needs one live test to confirm |
| Employees-page "Generate Habitap PINs" button | ⛔ Not built yet |

## Remaining work

1. **Live-validate** the date/time picker format (`#from`/`#fromTime`/`#to`/`#toTime`)
   with a single test invitee, then lock it into `createStaffInviteEvent`.
2. Build the **admin button + date-window dialog** on the employees page.
3. Run a migration for the two new columns when ready (`prisma db push` / migrate).

## Deployment note

Server-side Playwright needs the Chromium binary (`npx playwright install chromium`).
The production Docker image is heap-constrained and does not currently bundle a
browser — installing Chromium + its OS deps in the image (and the extra memory a
headless browser needs) is a prerequisite for running this in production.

## Local exploration

The portal was mapped with throwaway scripts that have since been removed (their
output contained other tenants' PII). To re-explore, drive `src/lib/habitap.ts`'s
`loginToHabitap` from a local script with creds in env — never commit credentials
or portal screenshots.
