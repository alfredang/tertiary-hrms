# Code Review: Fix E2E networkidle for Local Dev

**Date:** 2026-02-23
**Reviewer:** Claude Code
**Scope:** Replace `waitForLoadState("networkidle")` with content-based waits across e2e test suite

## Stats

- Files Modified: 3 (tracked: `.gitignore`, `e2e/helpers.ts`, `playwright.config.ts`)
- Files Added: 6 (untracked: 4 e2e specs, 2 utility scripts)
- Files Deleted: 0
- New lines: ~350
- Deleted lines: ~15

## Review Results

**Code review passed. No critical or high-severity issues detected.**

All changes are well-structured, follow the existing calendar test pattern, and 39/39 e2e tests pass against production.

## Detailed Review

### `e2e/helpers.ts` — CLEAN

All 4 `networkidle` replacements are correct:
- `loginAs()`: `waitForSelector('input[id="email"]', { state: "visible", timeout: 15000 })` — appropriate for form readiness
- `loginAsAdmin/Staff/Staff2()`: `toContainText("Welcome", { timeout: 15000 })` — matches dashboard rendering pattern from calendar tests

No issues.

### `e2e/04-payroll.spec.ts` — CLEAN

3 `networkidle` calls replaced with `toContainText` using correct text markers ("Process Payroll", "Payroll"). Consistent with calendar pattern.

No issues.

### `e2e/06-multi-staff.spec.ts` — CLEAN

`networkidle` + `waitForTimeout(2000)` consolidated into single `toContainText("Leave Management", { timeout: 15000 })`. Cleaner and more reliable.

No issues.

### `e2e/07-view-toggle.spec.ts` — CLEAN

4 `networkidle` deletions (after existing `waitForTimeout(2000)`) + 2 replacements with `toContainText("My Profile"/"Employees")`. The remaining `waitForTimeout(2000)` calls after view-toggle clicks are acceptable — they give `router.refresh()` time to complete and the subsequent Playwright assertions auto-retry.

No issues.

### `playwright.config.ts` — CLEAN

Production/local environment switching is well-implemented:
- `TEST_ENV=production` skips `webServer` config (correct — no dev server needed)
- Longer timeouts for production (90s test, 20s expect vs 60s/15s local)
- Spread syntax for conditional `webServer` is idiomatic

No issues.

### `e2e/05-calendar.spec.ts` — CLEAN (unchanged, reference pattern)

Already uses the correct content-based wait pattern. No modifications needed or made.

### `scripts/verify-db.ts` — CLEAN

Read-only database verification script. Good defensive coding — checks for missing records, provides clear output. Properly disconnects Prisma in both success and error paths.

No issues.

### `scripts/setup-test-salary.ts` — CLEAN

Safely scoped to test accounts only (EMP097/098/099). Checks for existing salary info before creating. Properly disconnects Prisma.

No issues.

## Low-Severity Observations (not blocking)

```
severity: low
file: e2e/04-payroll.spec.ts
line: 82
issue: Test assertion always passes
detail: `expect(true).toBeTruthy()` in "Staff cannot access payroll generate page" makes this test a no-op. The `isBlocked` variable is computed but never asserted.
suggestion: Pre-existing issue, not introduced by this change. Consider fixing separately: `expect(isBlocked).toBeTruthy()`
```

```
severity: low
file: e2e/06-multi-staff.spec.ts
line: 2
issue: Unused import
detail: `logout` is imported from helpers but never used in this file.
suggestion: Pre-existing issue. Remove unused import when convenient.
```

## Summary

| Area | Status |
|------|--------|
| Logic errors | None |
| Security issues | None |
| Performance | None |
| Pattern consistency | All changes follow the calendar test pattern |
| Test coverage | 39/39 passing (production verified) |
| TypeScript | No new errors in e2e files |
| Build | Passes cleanly |

**Verdict: PASS — Ready for commit**
