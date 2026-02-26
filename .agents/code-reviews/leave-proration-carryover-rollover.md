# Code Review: Leave Proration + Carry-Over Rollover + Leave Page Polish

**Date**: 25 Feb 2026
**Plan**: `.agents/plans/leave-proration-carryover-rollover.md`

## Files Changed (6 modified, 2 new)

| File | Change | Severity |
|------|--------|----------|
| `src/lib/utils.ts` | Fixed `prorateLeave()` — completed months for new hires | — |
| `src/__tests__/leave-api.test.ts` | Updated proration tests + added 5 new tests | — |
| `src/app/(dashboard)/leave/page.tsx` | Rearranged balance boxes, renamed labels, added expiring notice | — |
| `src/components/leave/leave-list.tsx` | Filter breakpoint sm→lg | — |
| `src/components/expenses/expense-list.tsx` | Filter breakpoint sm→lg | — |
| `src/components/settings/company-settings-form.tsx` | Added rollover UI section | — |
| `src/app/api/leave/rollover/route.ts` | **New** — POST rollover API endpoint | — |
| `scripts/year-end-rollover.ts` | **New** — CLI rollover script | — |

## Findings

### No Issues Found

All changes follow existing codebase conventions:
- API route follows Zod → auth → Prisma → response pattern
- Settings form uses render function pattern (not sub-components)
- Dark theme classes consistent
- Decimal fields cast with `Number()`
- SKIP_AUTH support in rollover API
- Input validation on `fromYear` (2020-2100 range)
- Upsert includes both create and update data

### Pre-existing Fix
- Fixed `scripts/cleanup-payslips.ts` — `grossPay`/`netPay` → `grossSalary`/`netSalary` (matched schema)

## Validation Results
- `tsc --noEmit`: 0 errors
- `vitest run`: 23/23 pass
- `next build`: success (47 routes including new `/api/leave/rollover`)
