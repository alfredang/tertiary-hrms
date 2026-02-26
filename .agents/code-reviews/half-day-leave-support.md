# Code Review: Half-Day Leave Support (AM/PM)

**Date:** 2026-02-25
**Branch:** dev
**Files Changed:** 10 (567 insertions, 129 deletions)

## Files Reviewed

| # | File | Verdict |
|---|------|---------|
| 1 | `prisma/schema.prisma` | PASS |
| 2 | `src/lib/utils.ts` | PASS (minor note) |
| 3 | `src/app/api/leave/route.ts` | PASS |
| 4 | `src/app/api/leave/[id]/route.ts` | PASS |
| 5 | `src/components/leave/leave-request-form.tsx` | PASS |
| 6 | `src/components/leave/leave-edit-form.tsx` | PASS |
| 7 | `src/app/(dashboard)/leave/edit/[id]/page.tsx` | PASS |
| 8 | `src/components/leave/leave-list.tsx` | PASS |
| 9 | `src/app/api/leave/[id]/approve/route.ts` | PASS |
| 10 | `src/__tests__/leave-api.test.ts` | PASS |

## Issues Found

### LOW Severity (informational, no action needed)

1. **Unused parameter `newDays` in `getLeaveConflictDates()`** (`src/lib/utils.ts:95`)
   - The `newDays` and `days` (in existing leaves) parameters are accepted but never used in the function body. The function determines conflicts purely by slot-per-date analysis.
   - **Decision:** Leave as-is. Removing would change the signature for all callers + tests. Parameter may be useful for future validation (e.g., sanity check that days matches date range).

2. **`leave/page.tsx` doesn't explicitly select `dayType`/`halfDayPosition`** (`src/app/(dashboard)/leave/page.tsx:59`)
   - The Prisma `findMany` with `include` returns all scalar fields by default, so `dayType` and `halfDayPosition` are included automatically.
   - **Decision:** Correct behavior, no change needed.

### No MEDIUM or HIGH severity issues found.

## Validation Results

- `tsc --noEmit`: 0 errors
- `npm run test`: 30/30 pass (23 existing + 7 new)
- `npx next build`: success (47 routes)

## Architecture Notes

- **Backward compatible**: `@default(FULL_DAY)` means all existing records are treated as full-day leaves
- **Slot-based overlap detection**: Clean algorithm that maps each leave date to AM/PM/FULL slots
- **Render functions**: All new UI follows the CLAUDE.md pattern (render functions, not sub-components)
- **Consistent data flow**: dayType stored as enum on single-day, halfDayPosition as nullable string on multi-day
- **Medical exception preserved**: Same-slot conflicts allowed when leave types differ and one is MC/SL
