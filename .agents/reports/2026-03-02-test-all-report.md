# Test-All Report

**Project**: Tertiary HRMS
**Date**: 2 March 2026
**Branch**: `main` at `d588ec4` (post-security hardening)
**Trigger**: Full test sweep after 15 security fixes

---

## Inventory

| Type | Files | Cases | Viewports | Total Runs |
|------|-------|-------|-----------|------------|
| Unit (Vitest) | 1 | 31 | -- | 31 |
| E2E (Playwright) | 10 | 48 | 3 (Chromium, iPhone 14, Pixel 7) | 144 |
| Integration | 0 | 0 | -- | 0 |
| **Total** | **11** | **79** | -- | **175** |

## Results

| Suite | Passed | Failed | Skipped | Duration |
|-------|--------|--------|---------|----------|
| Unit | 31 | 0 | 0 | 1.1s |
| E2E | 144 | 0 | 0 | 11.9m |
| **Total** | **175** | **0** | **0** | **~12m** |

### Failures

None. All 175 test runs pass.

---

## Coverage

No coverage tool configured. Manual gap analysis below.

---

## Gap Analysis

### Critical Priority (test ASAP)

| Source File | What It Does | Risk if Untested |
|-------------|-------------|------------------|
| `src/lib/cpf-calculator.ts` | CPF rates (age-based tiers), wage ceilings, ROUND_HALF_UP/ROUND_DOWN | Wrong payroll for every employee |
| `src/app/api/payroll/generate/route.ts` | Payslip generation, duplicate skip logic | Double payslips, wrong amounts |
| `src/lib/auth.ts` (callbacks) | NextAuth signIn/jwt/session, INACTIVE blocking, salt encoding | Auth bypass, wrong roles |
| `src/app/api/auth/google-mobile/route.ts` | Mobile token verification, audience check, user creation | Unauthorized access via mobile |
| `src/app/api/leave/[id]/route.ts` (PATCH) | Edit pending leave: overlap re-check, prorated balance calc | Overlapping leaves, wrong balances |
| `src/app/api/payroll/upload/route.ts` | Excel parsing, salary data import | Corrupt salary data |
| `src/app/api/leave/rollover/route.ts` | Year-end carry-over, maxCarryOver capping | Wrong balances next year |

**Estimated effort**: ~40 tests, ~4-6 hours

### High Priority (test this sprint)

| Source File | What It Does | Risk if Untested |
|-------------|-------------|------------------|
| `src/app/api/expenses/[id]/approve/route.ts` | Expense status transition | Wrong expense states |
| `src/app/api/expenses/[id]/reject/route.ts` | Expense rejection | Same |
| `src/app/api/expenses/[id]/reset/route.ts` | Admin reset APPROVED->PENDING | Same |
| `src/app/api/employees/route.ts` (POST) | Create employee transaction (user+employee+salary+leave) | Orphaned records |
| `src/middleware.ts` | Route protection, RBAC, secure cookie detection | Auth bypass at route level |
| `src/lib/validations/employee.ts` | 7 Zod schemas for employee CRUD | Bad data in DB |

**Estimated effort**: ~40 tests, ~5-7 hours

### Medium Priority (test next sprint)

| Category | Files | What |
|----------|-------|------|
| Form components | 9 files | leave-request-form, expense-submit-form, salary-info-form, etc. |
| List components | 4 files | leave-list, expense-list, payroll-list, employee-list |
| Calendar components | 3 files | calendar-view, calendar-event-form, calendar-event-card |
| Utilities | 3 files | pdf-generator, view-mode, uploadthing |

**Estimated effort**: ~40 tests, ~6-8 hours

### Low Priority (skip or defer)

| Category | Files | Why Skip |
|----------|-------|----------|
| UI primitives (shadcn) | 17 files | Wrapped Radix UI -- testing library, not our code |
| Layout components | 5 files | Header, sidebar, nav -- E2E covers navigation |
| Config/constants | 3 files | constants.ts, prisma.ts, dev-auth.ts -- minimal logic |
| Dashboard display | 4 files | stats-cards, quick-actions, recent-activity -- display only |

---

## Summary Statistics

| Category | Total Files | Unit Tested | E2E Covered | Untested |
|----------|-------------|-------------|-------------|----------|
| API Routes | 28 | 0 | ~18 (partial) | 28 (unit) |
| Libraries | 11 | 1 (utils) | -- | 10 |
| Components | 47 | 0 | ~20 (partial) | 47 |
| **Total** | **86** | **1** | **~38** | **85 (unit)** |

**Unit test coverage**: ~2% of source files have dedicated unit tests.
**E2E coverage**: ~44% of source files are exercised through E2E flows (but without edge case or error path coverage).

---

## Recommended Test Roadmap

### Phase 1: Financial Accuracy (Week 1)
- CPF calculator: 15 tests (all age tiers, wage ceilings, rounding)
- Payroll generation API: 8 tests (mocked CPF, skip detection)
- Leave proration gaps: 6 tests (mid-year hire, carry-over edge cases)

### Phase 2: Auth & Security (Week 2)
- Auth callbacks: 8 tests (signIn, jwt, session)
- Mobile auth: 6 tests (token verify, audience, inactive)
- Middleware RBAC: 4 tests (public routes, role paths)

### Phase 3: CRUD Operations (Week 3)
- Leave edit/cancel/reset APIs: 12 tests
- Expense approve/reject/reset APIs: 8 tests
- Employee creation API: 8 tests

### Target
- Current: 31 unit tests
- After Phase 1: ~60 unit tests
- After Phase 3: ~100 unit tests
- Recommended minimum for production: 80+ (covering all financial calculations and auth flows)

---

## Build Health (at time of test run)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `eslint src/` | 0 errors, 1 warning |
| `vitest run` | 31/31 pass |
| `next build` | Success |
| E2E (production) | 144/144 pass |

---

*Generated after security hardening commit `d588ec4` -- 2 March 2026*
