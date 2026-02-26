# Code Review: QA Bug Fix Batch + E2E Tests + Utility Scripts

**Date:** 2026-02-23
**Reviewer:** Claude Code
**Scope:** 7 QA bug fixes, 4 new e2e test files, 2 utility scripts, test/config updates

## Stats

- Files Modified: 16
- Files Added: 7
- Files Deleted: 0
- New lines: ~215
- Deleted lines: ~73

---

## Issues Found

### Issue 1

```
severity: medium
file: e2e/04-payroll.spec.ts
line: 82
issue: Staff payroll/generate access test always passes — assertion is trivially true
detail: The test "Staff cannot access payroll generate page" ends with `expect(true).toBeTruthy()`
  which always passes regardless of the actual redirect behavior. The `isBlocked` variable is
  computed but never asserted. This means the middleware RBAC fix (Task 1) is NOT actually
  validated by this e2e test. The test gives a false sense of coverage.
suggestion: Replace `expect(true).toBeTruthy()` with `expect(isBlocked).toBeTruthy()` or,
  better yet, assert directly on the URL: `expect(page.url()).not.toContain("/payroll/generate")`
```

### Issue 2

```
severity: low
file: src/app/api/expenses/route.ts
line: 53-56
issue: Future date check is timezone-sensitive and may fail near midnight
detail: `new Date(expenseDate)` parses "2026-02-23" as UTC midnight, while `todayEnd` uses local
  server time. If the server timezone is UTC+8 (Singapore), a valid same-day expense submitted
  late could theoretically be rejected if the parsed UTC date is "tomorrow" in UTC. In practice,
  since `todayEnd` is set to 23:59:59.999 local time, this is unlikely to cause real issues —
  the expenseDate parsed at UTC midnight will almost always be <= todayEnd in UTC+8. However,
  the asymmetry is worth noting for maintainability.
suggestion: No immediate fix needed. If this ever causes issues, normalize both dates to the
  same timezone. The current implementation is safe for Singapore (UTC+8).
```

### Issue 3

```
severity: low
file: src/app/(dashboard)/dashboard/page.tsx
line: 59-62
issue: Employee startDate query is sequential, could be parallelized
detail: The employee startDate fetch at line 59 runs after the Promise.all at line 37 resolves.
  It could be added to the existing Promise.all for slightly better performance. This adds ~1
  extra DB roundtrip per dashboard load. For the current scale (16 employees), this is negligible.
suggestion: No fix needed at current scale. If performance becomes a concern, add the employee
  fetch to the existing Promise.all block.
```

---

## Files Reviewed — No Issues

### Bug Fix Files (all clean)

- **`src/middleware.ts`** (lines 56-63) — HR management routes block. Correct pattern, correct roles, placed after existing admin check. No issues.
- **`src/app/api/leave/route.ts`** (lines 63-80, 115-119) — Weekend validation and MC proration. Logic is correct: iterates dates to find business days, breaks early. MC proration condition correctly mirrors AL. No issues.
- **`src/components/leave/leave-request-form.tsx`** (line 181) — `min={startDate}` on end date input. Correctly prevents end < start. No issues.
- **`src/components/expenses/expense-submit-form.tsx`** (line 190) — `max` attribute on date. Correct ISO format. No issues.
- **`src/components/payroll/payroll-list.tsx`** (lines 99-109) — Conditional search render with `{isHR && (...)}`. Clean. The `search` state still defaults to `""` which matches everything, so filtering works correctly when hidden. No issues.

### Test Updates (all clean)

- **`src/__tests__/leave-api.test.ts`** — Mock updates from `"MC"` to `"CL"` are correct. The tests now use a non-prorated leave type so the balance arithmetic (14 - used - pending = available) holds without proration affecting results. `carriedOver: 0` added to all mocks for completeness. Proration utility tests updated to use dynamic current-month calculations instead of hardcoded 2026 values, making them time-independent. No issues.
- **`e2e/helpers.ts`** — Replaced `waitForLoadState("networkidle")` with targeted `toContainText("Welcome")` waits. Added `loginAsStaff2` helper. Good fix for the known networkidle hang issue. No issues.
- **`playwright.config.ts`** — Production/local split with conditional webServer. Clean implementation using spread operator. No issues.
- **`vitest.config.ts`** — Added `exclude: ["e2e/**"]` to prevent Vitest from picking up Playwright test files. Correct. No issues.

### New E2E Test Files

- **`e2e/05-calendar.spec.ts`** — Clean, follows established patterns. No issues.
- **`e2e/06-multi-staff.spec.ts`** — Properly tests multi-user isolation. Date arithmetic for future weekday is correct. No issues.
- **`e2e/07-view-toggle.spec.ts`** — Clean admin view toggle tests with proper cleanup (switches back to admin). No issues.

### New Utility Scripts

- **`scripts/verify-db.ts`** — Read-only, safe for production. No issues.
- **`scripts/setup-test-salary.ts`** — Only touches test employee IDs, has skip-if-exists logic. No issues.

### Other Modified Files

- **`.gitignore`** — Added `CLAUDE.md` and `.agents/` to gitignore. Correct (keeps local-only files out of repo).
- **`README.md`** — Updated testing docs with e2e test table and utility script docs. Accurate and helpful.
- **`src/components/employees/*.tsx`** — Removed 3 `eslint-disable` comments. These were previously needed but are no longer required (likely `.eslintrc.json` addition). Clean.
- **`.eslintrc.json`** — Simple `extends: "next/core-web-vitals"`. Standard Next.js config. No issues.

---

## Summary

**1 medium issue** (trivially true test assertion), **2 low observations** (timezone note, sequential query). No critical or high severity issues. All bug fixes are correct, targeted, and follow existing codebase patterns. The medium issue (e2e test assertion) should be fixed before committing to ensure the RBAC middleware change is actually tested.
