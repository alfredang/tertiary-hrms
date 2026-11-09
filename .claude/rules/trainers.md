# Trainer Management rules

Applies to `src/app/(dashboard)/trainers/**`, `src/app/api/trainers/**`, `src/app/api/agent/trainers/**`,
`src/lib/trainer*.ts`, `scripts/trainers/**`.

## Access
- Gated by the **TRAINER_ADMIN** role only (`hasTrainerAdminAccess(roles)` / `getTrainerAccess()`), held alongside the
  person's normal role, e.g. `["STAFF","TRAINER_ADMIN"]`. ADMIN alone does NOT grant it (NRIC/phone/email inside).
- Holders (9 Nov 2026): Alfred Ang (E0001), Tan Soik Ching (E0002), Deepa Arumugam (E10001), Ang See Siang (E0014).
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
- Applicants from email have status `Applicant`/`Contacted`; the directory hides them by default.

## Privacy
- `.trainers/` is git-ignored and must never be committed (the hook blocks it). Never log NRIC/phone; the audit log
  records changed field names only. The list API never returns NRIC; the detail page masks it behind "Show".
