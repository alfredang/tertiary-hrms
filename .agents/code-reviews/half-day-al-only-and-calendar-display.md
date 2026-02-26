# Code Review: Half-Day AL-Only Restriction + Calendar Leave Display

**Date:** 2026-02-25
**Branch:** dev (incremental on top of half-day implementation)
**Files Changed:** 6 (this session)

## Files Reviewed

| # | File | Verdict |
|---|------|---------|
| 1 | `src/components/leave/leave-request-form.tsx` | PASS |
| 2 | `src/components/leave/leave-edit-form.tsx` | PASS |
| 3 | `src/app/(dashboard)/leave/edit/[id]/page.tsx` | PASS |
| 4 | `src/app/api/leave/route.ts` | PASS |
| 5 | `src/app/api/leave/[id]/route.ts` | PASS |
| 6 | `src/app/(dashboard)/calendar/day/[date]/page.tsx` | PASS |
| 7 | `src/__tests__/leave-api.test.ts` | PASS |

## Changes Summary

### AL-Only Half-Day (Steps 1-3)
- **Request form**: `isAL` derived from `selectedLeaveType?.code`, useEffect resets dayType/halfDayPosition when switching to non-AL, selector only renders when `isAL`
- **Edit form**: New `leaveTypeCode` prop, same `isAL` conditional logic
- **Edit page**: Passes `leaveTypeCode` from Prisma query (added `code: true` to select)
- **API POST/PATCH**: `effectiveDayType`/`effectiveHalfDayPosition` computed from `isAL`, non-AL forced to FULL_DAY with full-day recalculation

### Calendar Display (Step 4)
- Day detail page shows `(AM)`, `(PM)`, or `(half on first/last day)` in amber text next to day count

### Tests (Step 5)
- New test: "should force FULL_DAY for non-AL leave type even if AM_HALF is sent" — verifies MC with AM_HALF gets stored as FULL_DAY with days=1

## Issues Found

No issues found. All changes are minimal, targeted, and consistent.

## Validation Results

- `tsc --noEmit`: 0 errors
- `npm run test`: 31/31 pass (30 existing + 1 new)
- `npx next build`: success
