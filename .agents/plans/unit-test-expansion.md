# Feature: Unit Test Expansion — CPF Calculator, Leave Proration, Payroll Generation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Add comprehensive unit tests for the three highest-risk untested areas of the codebase:
1. **CPF Calculator** — Financial math that determines every employee's payslip. One bug = wrong pay for everyone.
2. **Leave Proration** — Date-sensitive proration logic with time-dependent existing tests that skip cases conditionally.
3. **Payroll Generation API** — Route handler that orchestrates CPF calculation + Prisma transactions with zero unit tests.

## User Story

As a developer maintaining the HRMS
I want comprehensive unit tests for financial and payroll logic
So that regressions in CPF math, leave proration, or payroll generation are caught before reaching production

## Problem Statement

- CPF calculator has zero tests — highest-risk untested code (financial calculations)
- Leave proration has 8 tests but they're time-dependent (`new Date()`) with `if (currentMonth >= X)` guards that skip assertions in early months
- Payroll generation API has zero tests — combines auth, validation, DB queries, and CPF calculation
- `calculateDaysBetween`, `formatCurrency`, `getInitials` in utils.ts have zero tests

## Solution Statement

Create 3 test files:
1. `src/__tests__/cpf-calculator.test.ts` — **Already written** (32 tests from earlier session). Verify it passes.
2. `src/__tests__/utils.test.ts` — New file with deterministic proration tests (fake timers) + utility function tests
3. `src/__tests__/payroll-generate.test.ts` — New file with mocked Prisma/auth, covering all route branches

## Feature Metadata

**Feature Type**: Enhancement (test coverage)
**Estimated Complexity**: Medium
**Primary Systems Affected**: Test suite only — no production code changes
**Dependencies**: vitest, vi.useFakeTimers, vi.mock (all already available)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `src/lib/cpf-calculator.ts` (all) — Source: 4 exported functions (getCPFRates, calculateAge, calculateCPF, calculatePayroll)
- `src/lib/utils.ts` (all) — Source: 7 exported functions (cn, formatCurrency, formatDate, formatDateRange, getInitials, calculateDaysBetween, roundToHalf, getLeaveConflictDates, prorateLeave)
- `src/app/api/payroll/generate/route.ts` (all) — Source: POST handler with auth, validation, employee loop, payslip creation
- `src/lib/dev-auth.ts` (all) — Source: isDevAuthSkipped() — needs mocking in payroll tests
- `src/__tests__/leave-api.test.ts` (lines 1-50) — Pattern: vi.hoisted mocks, makeRequest helper, mock setup
- `src/__tests__/leave-api.test.ts` (lines 646-754) — Existing proration tests (to be superseded by deterministic versions)
- `src/__tests__/cpf-calculator.test.ts` (all) — Already written, 32 tests — VERIFY it passes before proceeding
- `vitest.config.ts` (all) — Config: node environment, globals, @ alias

### New Files to Create

- `src/__tests__/utils.test.ts` — Deterministic proration + utility function tests (~20 tests)
- `src/__tests__/payroll-generate.test.ts` — Payroll generation API tests (~12 tests)

### Applicable Skills & Reference Docs

| Resource | Type | When to Use |
|----------|------|-------------|
| `.claude/reference/leave-proration-rules.md` | Reference Doc | When writing proration edge cases |
| `CLAUDE.md` "Testing Strategy" section | Reference Doc | For test organization conventions |

### Applicable Subagents

| Subagent | When to Invoke |
|----------|----------------|
| code-reviewer | After all tests written, review test quality |
| rca-agent | If any test unexpectedly fails |

### Patterns to Follow

**Mock setup pattern** (from `leave-api.test.ts:6-29`):
```ts
const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: { /* mock methods */ },
  mockAuth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
```

**Request helper** (from `leave-api.test.ts:42-48`):
```ts
function makeRequest(body, url) {
  return new NextRequest(url, { method: "POST", headers: {...}, body: JSON.stringify(body) });
}
```

**Fake timers for time-dependent code**:
```ts
vi.useFakeTimers();
vi.setSystemTime(new Date(2026, 5, 15)); // Pin to specific date
// ... tests ...
vi.useRealTimers(); // in afterEach
```

**Naming**: `describe('FunctionName — what it does', () => { it('should X when Y') })`

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: VERIFY `src/__tests__/cpf-calculator.test.ts`

- **ACTION**: Run the already-written CPF calculator test file to confirm all 32 tests pass
- **VALIDATE**: `npx vitest run src/__tests__/cpf-calculator.test.ts`
- **GOTCHA**: If any test fails, fix the expected value — the source code is the source of truth, not the test comment. Re-derive the math using Decimal.js rounding rules.

### Task 2: CREATE `src/__tests__/utils.test.ts`

- **IMPLEMENT**: Deterministic tests for all utility functions, with fake timers for prorateLeave
- **PATTERN**: Use `vi.useFakeTimers()` + `vi.setSystemTime()` to pin dates (no conditional `if (currentMonth >= X)` guards)
- **IMPORTS**: `import { describe, it, expect, vi, afterEach } from "vitest"` + direct imports from `@/lib/utils`
- **GOTCHA**: `prorateLeave` uses `new Date()` internally — MUST use `vi.setSystemTime()` to control it
- **GOTCHA**: `formatDate` and `formatCurrency` use `Intl.DateTimeFormat`/`Intl.NumberFormat` — output may vary by locale in CI. Use `.toContain()` for currency symbol if needed.

**Tests to include (~20 tests):**

```
describe("roundToHalf")
  ✓ already covered in leave-api.test.ts — skip (don't duplicate)

describe("calculateDaysBetween")
  - same day → 1
  - consecutive days → 2
  - week span (Mon–Fri) → 5
  - reversed dates (end before start) → same result (uses Math.abs)

describe("formatCurrency")
  - formats positive number with SGD symbol
  - formats zero as $0.00
  - formats negative number
  - formats large number with commas

describe("getInitials")
  - two words → first letters ("John Doe" → "JD")
  - single word → first letter ("Admin" → "A")
  - three words → first two letters ("John Michael Doe" → "JM")
  - empty string → "" (edge case)

describe("prorateLeave — deterministic with fake timers")
  PIN TIME: vi.setSystemTime(new Date(2026, 2, 15)) — March 15, 2026

  Existing employees (started before 2026):
  - existing employee, 14 AL → 14 * 3/12 = 3.5 (inclusive: Jan, Feb, Mar)
  - existing employee, 7 MC → 7 * 3/12 = 1.75 → 1.5 (round down to 0.5)
  - existing employee, 0 NPL → 0

  New hires (started in 2026):
  - hired Feb 1 → 1 completed month → 14 * 1/12 = 1.17 → 1.0
  - hired Mar 1 → 0 completed months → 0
  - hired Mar 15 (today) → 0 completed months → 0
  - hired Jan 2 (just after yearStart) → 2 completed months → 14 * 2/12 = 2.33 → 2.0

  Edge cases:
  - no start date provided → uses yearStart → same as existing employee
  - future start (2027) → 0
  - string date input → parses correctly

  PIN TIME: vi.setSystemTime(new Date(2026, 11, 15)) — December 15, 2026
  - existing employee, 14 AL → 14 * 12/12 = 14.0 (full year)
  - new hire Jan 2 → 11 completed months → 14 * 11/12 = 12.83 → 12.5

  PIN TIME: vi.setSystemTime(new Date(2026, 0, 15)) — January 15, 2026
  - existing employee → 14 * 1/12 = 1.17 → 1.0
  - new hire Jan 2 → 0 completed months → 0 (join month doesn't count)
```

- **VALIDATE**: `npx vitest run src/__tests__/utils.test.ts`

### Task 3: CREATE `src/__tests__/payroll-generate.test.ts`

- **IMPLEMENT**: Mock-based tests for the payroll generation POST route handler
- **PATTERN**: Follow `leave-api.test.ts` mock setup pattern (vi.hoisted, mockPrisma, mockAuth)
- **IMPORTS**: `NextRequest` from `next/server`, route handler via `import { POST } from "@/app/api/payroll/generate/route"`
- **GOTCHA**: Also mock `@/lib/dev-auth` to return `false` (auth not skipped) — otherwise SKIP_AUTH bypass will skip auth checks
- **GOTCHA**: `calculatePayroll` is a real import (not mocked) — it needs `vi.setSystemTime()` because it calls `calculateAge(dateOfBirth)` internally
- **GOTCHA**: The route uses `prisma.employee.findMany` (not findUnique) — mock must match

**Mocks needed:**
```ts
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/dev-auth", () => ({ isDevAuthSkipped: () => false }));
```

**mockPrisma shape:**
```ts
mockPrisma: {
  employee: { findMany: vi.fn() },
  payslip: { findUnique: vi.fn(), create: vi.fn() },
}
```

**Tests to include (~12 tests):**

```
describe("POST /api/payroll/generate — Auth")
  - 401 when unauthenticated (no session)
  - 403 when STAFF role
  - allows ADMIN role (test with valid payload returning employees)
  - allows HR role

describe("POST /api/payroll/generate — Validation")
  - 400 when month missing
  - 400 when year missing
  - 400 when no active employees found

describe("POST /api/payroll/generate — Generation")
  - creates payslip for one active employee with salary info + DOB
  - skips employee when payslip already exists for period (duplicate)
  - skips employee without dateOfBirth
  - handles mixed: 2 employees, 1 new + 1 existing → created=1, skipped=1
  - increments errors count when payslip.create throws (use mockRejectedValueOnce)
```

**Employee fixture:**
```ts
const EMPLOYEE = {
  id: "emp_001",
  status: "ACTIVE",
  dateOfBirth: new Date(1990, 2, 10), // age 36 in June 2026
  salaryInfo: {
    basicSalary: 5000,
    allowances: 500,
  },
};
```

- **VALIDATE**: `npx vitest run src/__tests__/payroll-generate.test.ts`

### Task 4: REMOVE duplicated proration tests from `leave-api.test.ts`

- **ACTION**: Remove the `describe("Proration & Rounding")` block (lines 646-754) from `leave-api.test.ts` since `utils.test.ts` now has deterministic versions
- **KEEP**: The `describe("Overlap Detection with AM/PM slots")` block (lines 756-848) — these are fine where they are
- **GOTCHA**: Don't accidentally remove overlap tests. Only remove lines 646-754.
- **VALIDATE**: `npx vitest run src/__tests__/leave-api.test.ts` — should still pass with fewer tests (leave submission + approval + rejection + balance + overlap = ~20 tests remaining)

### Task 5: RUN full test suite

- **ACTION**: Run all unit tests together to verify no conflicts
- **VALIDATE**: `npx vitest run`
- **EXPECTED**: ~65+ total tests (previous 31 minus ~8 proration + 32 CPF + ~20 utils + ~12 payroll)
- **GOTCHA**: If any test fails, check for mock leakage between files. Vitest isolates by file by default, so this should not happen.

---

## TESTING STRATEGY

### Unit Tests
- **CPF Calculator**: 32 tests — pure functions, no mocks, fake timers for calculateAge/calculatePayroll
- **Utils**: ~20 tests — pure functions, fake timers for prorateLeave
- **Payroll API**: ~12 tests — mocked Prisma/auth/dev-auth, fake timers for calculatePayroll integration

### Edge Cases
- CPF: OW at exactly $8,000 ceiling, AW ceiling exhausted, zero wage, rounding boundaries
- Proration: January (1 inclusive month), December (full year), join month = 0, future start, string dates
- Payroll: No employees, duplicate payslip, missing DOB, create failure, mixed results

---

## VALIDATION COMMANDS

### Level 1: Syntax & Types
```bash
npx tsc --noEmit
```

### Level 2: Individual Test Files
```bash
npx vitest run src/__tests__/cpf-calculator.test.ts
npx vitest run src/__tests__/utils.test.ts
npx vitest run src/__tests__/payroll-generate.test.ts
npx vitest run src/__tests__/leave-api.test.ts
```

### Level 3: Full Unit Suite
```bash
npx vitest run
```

### Level 4: Complete Validation (including existing E2E)
```bash
npx vitest run && echo "All unit tests pass"
```

---

## ACCEPTANCE CRITERIA

- [ ] `npx vitest run` passes with 60+ total tests (up from 31)
- [ ] CPF calculator has tests for all 5 age tiers, wage ceilings, rounding rules
- [ ] Leave proration tests are deterministic (no `if (currentMonth >= X)` guards)
- [ ] Payroll generation tests cover auth, validation, create/skip/error branches
- [ ] No production code changes — only test files created/modified
- [ ] Existing E2E and leave-api tests continue to pass
