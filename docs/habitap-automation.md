# Habitap PIN automation

Automates the Habitap occupant portal to generate building-access credentials
("PINs") for staff, triggered from the HRMS. In the UI this feature is branded
**Woods Square** (the building) — admin page `/woods-square`, plus a staff
self-service request flow on the profile page.

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
| `Employee.habitapInviteAt` / `habitapEventId` columns | ✅ In schema (this project uses `prisma db push`, not migration files) |
| `src/lib/habitap.ts` — create event + add visitors + orchestrator | ✅ Implemented |
| `POST /api/habitap/generate-pin` (admin-only, batch) | ✅ Implemented |
| Admin invite UI (`/woods-square`: Send / Requests / Log) | ✅ Built |
| Staff request flow (request access + admin approve/decline) | ✅ Built |
| Date-picker string format | ⚠️ Guarded (see below) — still needs one live run to lock the exact format |

### Date-picker guard

`createStaffInviteEvent` sets the window then calls `assertEventWindowAccepted`,
which reads the pickers back and **throws** if any came back blank (the
format-rejection failure mode) — so a wrong format fails loudly instead of saving
an empty window. The thrown error echoes what we sent and what the picker kept, so
the accepted format is visible from a single run. Covered by
`src/lib/habitap.picker.test.ts` (Vitest + a fixture form, no portal/creds needed).

The guard cannot prove the format is _right_ — only that a rejected one won't pass
silently. One live invitee is still needed to confirm `"09 Jun 2026"` / `"8:00 AM"`
is what the portal accepts (or to read the correct format off the error).

## Remaining work

1. **Live-validate** the date/time picker format (`#from`/`#fromTime`/`#to`/`#toTime`)
   with a single test invitee. If it's wrong, the guard's error names the rejected
   fields — switch `createStaffInviteEvent` to the format the picker kept.
2. Optional: after save, read the window back off the event detail page for a full
   end-to-end check (needs the detail-page DOM mapped first).

## Deployment note

Server-side Playwright needs the Chromium binary. The production Docker image now
bundles Chromium + its OS deps (`chore(deploy): bundle Chromium in Docker image for
Playwright`), with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pointing at it. The image
is heap-constrained, so keep the headless browser's memory use in mind when running
batches.

## Local exploration

The portal was mapped with throwaway scripts that have since been removed (their
output contained other tenants' PII). To re-explore, drive `src/lib/habitap.ts`'s
`loginToHabitap` from a local script with creds in env — never commit credentials
or portal screenshots.
