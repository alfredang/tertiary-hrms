# Trainer Admin rules (`/trainers`, formerly "Trainer Management")

Applies to `src/app/(dashboard)/trainers/**`, `src/app/api/trainers/**`, `src/app/api/agent/trainers/**`,
`src/lib/trainer*.ts`, `scripts/trainers/**`.

## Access
- Gated by the **TRAINER_ADMIN** role only (`hasTrainerAdminAccess(roles)` / `getTrainerAccess()`), held alongside the
  person's normal role, e.g. `["STAFF","TRAINER_ADMIN"]`. ADMIN alone does NOT grant it (NRIC/phone/email inside).
- Holders (9 Nov 2026): Alfred Ang (E0001), Tan Soik Ching (E0002), Deepa Arumugam (E10001), Ang See Siang (E0014).
- **Trainer Admin view (Alfred, 20 Nov 2026)**: an admin holding TRAINER_ADMIN can pick **View As → Trainer Admin**
  (view mode `trainer` in `src/lib/view-mode.ts` / `view-mode-context.tsx`). It lands on `/trainers`; the sidebar shows
  only Dashboard, My Stuff, People → Trainers and SOP (`TRAINER_VIEW_HREFS`); the dashboard shows the trainer row
  only. Non-admin holders have no View As menu and keep the sidebar link in their staff view.
- The sidebar link (People → Trainers; label renamed from "Trainer Admin" 21 Nov 2026, the role name is unchanged) shows, for an admin, in the admin view and the Trainer Admin view only (not staff, intern or accountant; Alfred, 21 Nov 2026, replaces the 20 Nov rule).
  The dashboard trainer row follows the same rule. A holder who is not an admin has no View As menu and keeps the link.
- TRAINER_ADMIN is deliberately absent from `ROLE_PRIORITY` in `src/lib/auth.ts`; it must never become a primary role.
- Never assign TRAINER_ADMIN (or any new enum value) to a row before the code that knows it is deployed — the old
  Prisma client throws on unknown enum values and those users' sessions break.

## Source of truth = Alfred's local drive
- `~/Documents/Supporting Document/Tertiary Infotech/ACTA Trainers /` (trailing space in the folder name), the LMS/TMS
  snapshot (`~/DigitalWorkforce/state/hr/trainers.json`), Vesta's notes, CVs, and email applications.
- Pipeline: `python3 scripts/trainers/export_planner_trainers.py` → `.trainers/*.json` (git-ignored, PII) →
  `npx tsx scripts/trainers/import-trainers.ts [--dry-run]` or the Mac agent's `POST /api/agent/trainers/import`
  (Bearer `AGENT_API_KEY`). The importer only fills blanks / unions lists from CV and email; it never overwrites TMS
  values, and keeps Trainer Admin edits (`editedAt` set) except activity fields.
- The export reuses `~/DigitalWorkforce/bin/trainers-dashboard.py` helpers so HRMS and the Planner Trainer Directory agree.

## Naming rule (Alfred, 9 Nov 2026)
- Trainer name = **FULL NAME IN CAPITALS**, honorifics removed, ` (DR)` appended for an earned doctorate:
  `ALFRED ANG CHEW HOE (DR)`. Same rule for the ACTA folder names (`scripts/trainers/rename_acta_folders.py`,
  dry-run by default, `--apply` writes an undo manifest, `--undo <manifest>`). Topic labels from old folder names are
  kept in `<ACTA>/_trainer-labels.json`. One implementation each: `canonicalTrainerName()` (TS) and `canonical()` (py) —
  keep them identical.

## Attributes a Trainer Admin filters on
- Training certs: ACLP, ACTA, DACE, DDDLP (users also write "DDDPL"; "ALCP" is a typo for ACLP) — `canonicalTrainingCert()`.
- Finance background (evidence list), IBF Fit and Proper declaration form on file (detected from the folder files),
  professional certifications (PMP, CCAR-F, CFA…), skills (Articulate, Python…), courses taught, last class.
- The directory opens on ACLP trainers, sorted A–Z; ACLP / Non-ACLP / All control (`?aclp=non|all`), also set by the three KPI tiles (Alfred, 20 Nov 2026).
- Applicants from email have status `Applicant`/`Contacted`; the directory hides them by default.

## Privacy
- `.trainers/` is git-ignored and must never be committed (the hook blocks it). Never log NRIC/phone; the audit log
  records changed field names only. The list API never returns NRIC; the detail page masks it behind "Show".
