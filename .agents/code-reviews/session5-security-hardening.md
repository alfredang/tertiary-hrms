# Code Review: Session 5 — Security Hardening & Quality Improvements

**Date**: 2026-02-26
**Reviewer**: Claude Code (automated)
**Scope**: 5-phase plan (security, null safety, OAuth, DatePicker, test scripts)

## Stats

- Files Modified: 45
- Files Added: 6 (`dev-auth.ts`, `popover.tsx`, `calendar.tsx`, `date-picker.tsx`, `deactivate-test-accounts.ts`, `reactivate-test-accounts.ts`)
- Files Deleted: 0
- New lines: ~208
- Deleted lines: ~130

## Validation Results

- `tsc --noEmit`: 0 errors
- `npm run test` (Vitest): 31/31 passing (validated in earlier pipeline step)
- `npm run build`: clean (validated in earlier pipeline step)

## Auto-Fixed Issues

```
severity: low
file: src/app/globals.css
line: 94-110
issue: Dead CSS for input[type="date"] — no native date inputs remain after DatePicker migration
fix-applied: Removed 17-line block (input[type="date"] styles + webkit picker indicator overrides)
```

## Issues Requiring Decision

None found.

## Detailed Review

### Phase 1: Security Hardening — isDevAuthSkipped()

**Assessment: Clean**

- `src/lib/dev-auth.ts` — Correctly gates on both `SKIP_AUTH === "true"` AND `NODE_ENV !== "production"`. Dual condition prevents production bypass.
- All 28 source files properly import and use `isDevAuthSkipped()` instead of raw `process.env.SKIP_AUTH`.
- Grep confirms only `dev-auth.ts` (definition) and `leave-api.test.ts` (test mock) still reference `process.env.SKIP_AUTH`.
- `renderTabSaveButton` correctly converted from `<TabSaveButton>` sub-component to render function pattern — all 3 call sites use `{renderTabSaveButton("...")}`.

### Phase 1: Upload MIME Validation

**Assessment: Clean**

- `src/app/api/upload/route.ts` — MIME_TO_EXT map covers all 5 allowed types. Falls back to `.bin` for unknown (which can't actually happen since unknown MIME types are rejected above).
- Eliminates user-controlled filename extension injection.

### Phase 1: Cron Secret Guard

**Assessment: Clean**

- `src/app/api/cron/payroll/route.ts` — Returns 500 if CRON_SECRET not configured in production. Non-production environments still work without it (dev convenience).

### Phase 1: Chat System Prompt

**Assessment: Clean**

- Leave types and policies now match actual system (AL 14d, MC 14d, CL 3d, NPL, half-day AL-only).

### Phase 2: Null Safety

**Assessment: Clean**

- Employee detail page: `employee.position ?? "—"` in 2 locations (header + card).
- Profile page: `emp.position ?? "—"` in 2 locations (header + card).
- Payroll generate + cron: DOB guard skips employees without dateOfBirth instead of using `new Date()` fallback. Prevents incorrect CPF age calculation.

### Phase 3: Google OAuth

**Assessment: Clean**

- `prompt: "select_account"` instead of `consent` — better UX for returning users.
- INACTIVE employee check at lines 80 and 108 of auth.ts — blocks both credentials and OAuth login.
- Login page OAUTH_ERROR_MESSAGES includes `AccessDenied` key for inactive employees.

### Phase 4: DatePicker Component

**Assessment: Clean**

- `popover.tsx` — Standard shadcn Popover wrapper with dark theme. Animation classes correct.
- `calendar.tsx` — react-day-picker v9 wrapper. All v9-specific classNames correct (month_caption, day_button, button_previous, button_next). Custom Chevron component works.
- `date-picker.tsx`:
  - Text input + calendar popup with proper two-way sync via `useEffect`.
  - Multi-format parsing on blur (YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY) — good for Singapore users.
  - Min/max date constraints applied to both calendar view (`disabled` function) and handled on the caller side.
  - `type="button"` on calendar trigger prevents form submission.
- All 15 native date inputs replaced across 9 files:
  - leave-request-form, leave-edit-form (2 each)
  - expense-submit-form, expense-edit-form (1 each)
  - calendar-event-form (2)
  - personal-info-form, employment-info-form (1, 2 — using watch/setValue for react-hook-form)
  - leave-list, expense-list (2 each — date range filters)
- react-hook-form integration in personal-info-form.tsx and employment-info-form.tsx correctly uses `form.watch()` for value and `form.setValue()` for onChange — proper pattern for controlled components with RHF.

### Phase 5: Test Account Scripts

**Assessment: Clean**

- Both scripts follow identical safe pattern: findUnique + null check + status guard + dry-run support.
- `prisma.$disconnect()` in `.finally()` block.
- No destructive operations (only status update on specific known test accounts).

### Capacitor Config

**Assessment: Clean**

- appName updated to "Tertiary HRMS".
- Server URL points to production: `https://hrms.tertiaryinfo.tech`.
- iOS scheme matches appName.

## Pre-existing Issues (not introduced by this session)

- `src/app/api/employees/route.ts` — 5 nullable field type mismatches (lines 76, 79, 85, 86, 88). Pre-existing, not caused by SKIP_AUTH migration.
- `isAdmin` definition varies across files (some include MANAGER/HR). Known issue, documented in CLAUDE.md.

## Summary

Code review passed. One low-severity auto-fix applied (dead CSS removal). No medium/high/critical issues found. All changes are consistent, well-structured, and follow established codebase patterns.
