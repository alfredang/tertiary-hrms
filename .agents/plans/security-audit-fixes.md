# Feature: Security Audit Fixes

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Fix all actionable security findings from the 2 March 2026 security audit report (`.agents/reports/2026-03-02-security-qa-audit.md`). This covers 3 HIGH, 8 actionable MEDIUM, and 6 actionable LOW findings — totaling 17 code-level fixes across API routes, config, and scripts. No new features; purely hardening existing code.

## User Story

As a system administrator
I want security vulnerabilities patched
So that the HRMS is safe to run in production with real employee data

## Problem Statement

The security audit found 35 findings (3H / 12M / 10L / 10 INFO). Of these, 17 are actionable code fixes. The 3 HIGH findings are most urgent: file upload trusts client MIME types, calendar API has no ownership check, and the settings GET endpoint is completely unauthenticated.

## Solution Statement

Fix findings in priority order: HIGH first, then MEDIUM, then LOW. Each fix is isolated to 1-2 files, minimal blast radius. After all fixes, run full validation (types, lint, tests, build) to confirm no regressions.

## Feature Metadata

**Feature Type**: Bug Fix (Security)
**Estimated Complexity**: Medium
**Primary Systems Affected**: API routes, Next.js config, utility scripts
**Dependencies**: `file-type` npm package (for H-1 magic byte validation)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `src/app/api/upload/route.ts` — H-1: File upload MIME validation
- `src/app/api/calendar/[id]/route.ts` — H-2: Calendar ownership check
- `src/app/api/settings/company/route.ts` — H-3: Settings GET auth + L-1: error message leak
- `next.config.mjs` — M-1: Security headers
- `src/app/api/employees/route.ts` — M-2: Default password + L-1: error message leak + L-3: race condition
- `src/app/api/leave/[id]/approve/route.ts` — M-6: Self-approval block
- `src/app/api/expenses/[id]/approve/route.ts` — M-6: Self-approval block
- `src/app/api/chat/route.ts` — M-5: Unbounded messages
- `src/app/api/cron/payroll/route.ts` — M-4: Cron auth when CRON_SECRET unset
- `src/app/api/auth/google-mobile/route.ts` — M-8: Multiple OAuth audiences
- `src/app/api/employees/[id]/route.ts` — L-1: error message leak + L-2: `any` type
- `src/app/api/leave/rollover/route.ts` — L-6: bulk data in response, L-8: role check, L-9: 401 vs 403
- `src/middleware.ts` — L-4: role cast without validation, L-10: dead `/admin` route
- `scripts/cleanup-cancelled.ts` — Build blocker: TS error + L-7: no production guard
- `tsconfig.json` — Build fix: exclude scripts/

### New Files to Create

- None (all changes to existing files)

### Relevant Documentation — READ BEFORE IMPLEMENTING

- `.agents/reports/2026-03-02-security-qa-audit.md` — Full audit with finding details
- `.claude/reference/calendar-design-notes.md` — Confirms calendar is personal (not shared)

### Applicable Skills & Reference Docs

| Resource | Type | When to Use |
|----------|------|-------------|
| `calendar-design-notes.md` | Reference Doc | During H-2 (calendar ownership) |

### Applicable Subagents

| Subagent | When to Invoke |
|----------|----------------|
| code-reviewer | After all fixes complete |
| rca-agent | If tests fail after changes |

### Patterns to Follow

- **Auth check pattern** (used in all API routes):
  ```typescript
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  ```
- **Ownership check pattern** (used in leave/expense edit/cancel):
  ```typescript
  if (record.employeeId !== session.user.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  ```
- **Error response pattern**: Always return generic message in 500, never expose `error.message`

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: Install `file-type` package

- **IMPLEMENT**: `npm install file-type` — needed for H-1 magic byte validation
- **NOTE**: `file-type` v19+ is ESM-only. Since Next.js App Router supports ESM, this should work. If import issues arise, use dynamic import: `const { fileTypeFromBuffer } = await import('file-type');`
- **VALIDATE**: `npm ls file-type`

### Task 2 (H-1): Add magic byte validation to file upload

- **FILE**: `src/app/api/upload/route.ts`
- **IMPLEMENT**: After `const buffer = Buffer.from(bytes);` (line 55), add magic byte validation:
  1. Import `fileTypeFromBuffer` from `file-type` (use dynamic import if needed for ESM compat)
  2. Call `const detectedType = await fileTypeFromBuffer(buffer);`
  3. If `detectedType` is null or `detectedType.mime` not in `allowedTypes`, return 400
  4. Use `detectedType.mime` for the extension lookup instead of `file.type`
  5. Keep the existing client MIME check as a first-pass filter (fast rejection)
- **PATTERN**: Keep existing error response format: `{ error: "message" }`
- **GOTCHA**: PDF files may not always be detected by magic bytes if they have a BOM. Add a fallback: if buffer starts with `%PDF` (hex `25 50 44 46`), treat as `application/pdf`
- **VALIDATE**: Manual test — upload a .txt file renamed to .jpg; should be rejected

### Task 3 (H-2): Add ownership check to calendar DELETE and PATCH

- **FILE**: `src/app/api/calendar/[id]/route.ts`
- **IMPLEMENT**:
  1. In DELETE handler (line 40-41): Replace the "Any authenticated user" comment with ownership check:
     ```typescript
     if (event.createdById !== currentUserId) {
       return NextResponse.json({ error: "Forbidden - you can only delete your own events" }, { status: 403 });
     }
     ```
  2. In PATCH handler (line 92-93): Same ownership check after `findUnique`:
     ```typescript
     if (event.createdById !== currentUserId) {
       return NextResponse.json({ error: "Forbidden - you can only edit your own events" }, { status: 403 });
     }
     ```
  3. For SKIP_AUTH fallback: when `currentUserId` is null (dev mode), skip the ownership check
- **PATTERN**: Follow leave edit ownership check pattern: `src/app/api/leave/[id]/route.ts`
- **GOTCHA**: Calendar is **personal** — no admin override needed. Admins don't manage other users' calendar events (confirmed in `.claude/reference/calendar-design-notes.md`)
- **VALIDATE**: E2E tests `e2e/07-calendar.spec.ts` should still pass (they test own events)

### Task 4 (H-3): Add auth check to Settings GET endpoint

- **FILE**: `src/app/api/settings/company/route.ts`
- **IMPLEMENT**: Add auth check to the GET handler (line 78):
  ```typescript
  export async function GET() {
    try {
      if (!isDevAuthSkipped()) {
        const session = await auth();
        if (!session?.user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
      // ... rest of existing code
  ```
- **PATTERN**: Same pattern as PATCH handler above it in the same file
- **NOTE**: Any authenticated user can read settings (not just ADMIN/HR) — the settings page shows company name across all views. Only PATCH needs role-based restriction.
- **VALIDATE**: E2E tests `e2e/10-settings.spec.ts` should still pass

### Task 5 (H-3 + L-1): Stop leaking error messages in Settings route

- **FILE**: `src/app/api/settings/company/route.ts`
- **IMPLEMENT**: In both PATCH (line 66-74) and GET (line 100-111) catch blocks, remove the `message` field:
  - Change `{ error: "Internal server error", message: error instanceof Error ? error.message : "..." }`
  - To just `{ error: "Internal server error" }`
- **VALIDATE**: `npx tsc --noEmit` still passes

### Task 6 (L-1): Stop leaking error messages in Employee routes

- **FILE**: `src/app/api/employees/route.ts` (line 139-142)
- **IMPLEMENT**: Change the 500 response from:
  ```typescript
  { error: "Internal server error", message: error instanceof Error ? error.message : "Failed to create employee" }
  ```
  to:
  ```typescript
  { error: "Internal server error" }
  ```
- **FILE**: `src/app/api/employees/[id]/route.ts` (line 136-141)
- **IMPLEMENT**: Same change — remove `message` field from 500 response
- **VALIDATE**: `npx tsc --noEmit` still passes

### Task 7 (M-1): Add security headers to next.config.mjs

- **FILE**: `next.config.mjs`
- **IMPLEMENT**: Add `headers()` async function to the config:
  ```javascript
  const nextConfig = {
    output: 'standalone',
    images: { ... },
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            { key: 'X-DNS-Prefetch-Control', value: 'on' },
          ],
        },
      ];
    },
  };
  ```
- **NOTE**: Do NOT add a strict CSP header — it will break inline styles from Tailwind/shadcn and the AI SDK streaming. The headers above provide meaningful protection without breaking anything.
- **VALIDATE**: `npm run build` should include headers in output. After deploy, check with `curl -I https://hrms.tertiaryinfo.tech`

### Task 8 (M-2): Require DEFAULT_EMPLOYEE_PASSWORD env var or generate random

- **FILE**: `src/app/api/employees/route.ts` (line 55)
- **IMPLEMENT**: Replace:
  ```typescript
  const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || "123456";
  ```
  With:
  ```typescript
  const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || randomUUID().slice(0, 12);
  ```
  Import `randomUUID` from `crypto` (already available in Node.js).
- **NOTE**: This means if the env var is unset, each new employee gets a random 12-char password. Admin would need to communicate it or implement a password reset flow. For now, this is safer than a universal default.
- **VALIDATE**: `npx tsc --noEmit` still passes

### Task 9 (M-4): Fix cron route to reject when CRON_SECRET is unset

- **FILE**: `src/app/api/cron/payroll/route.ts` (lines 9-22)
- **IMPLEMENT**: Replace the current auth block with:
  ```typescript
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ```
- **PATTERN**: Remove the `NODE_ENV` branching entirely — if no secret, no access, period
- **VALIDATE**: `npx tsc --noEmit`

### Task 10 (M-5): Add Zod validation to chat API messages

- **FILE**: `src/app/api/chat/route.ts`
- **IMPLEMENT**: After the auth check (line 43), add message validation:
  ```typescript
  import * as z from "zod";

  const chatSchema = z.object({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      })
    ).max(50),
  });
  ```
  Then validate:
  ```typescript
  const body = await req.json();
  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify({ error: "Invalid message format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { messages } = validation.data;
  ```
- **GOTCHA**: Replace `const { messages } = await req.json();` with the schema-validated version. Don't call `req.json()` twice.
- **VALIDATE**: `npx tsc --noEmit`

### Task 11 (M-6): Block self-approval of leave and expenses

- **FILE**: `src/app/api/leave/[id]/approve/route.ts`
- **IMPLEMENT**: After fetching the leave request (line 23-26) and before the status check, add:
  ```typescript
  if (leaveRequest.employeeId === session.user.employeeId) {
    return NextResponse.json(
      { error: "You cannot approve your own leave request" },
      { status: 403 }
    );
  }
  ```
- **FILE**: `src/app/api/expenses/[id]/approve/route.ts`
- **IMPLEMENT**: After fetching the expense (line 22-24) and before the status check, add:
  ```typescript
  if (expense.employeeId === session.user.employeeId) {
    return NextResponse.json(
      { error: "You cannot approve your own expense claim" },
      { status: 403 }
    );
  }
  ```
- **VALIDATE**: E2E tests should pass (test accounts don't self-approve)

### Task 12 (M-8): Support multiple Google OAuth client ID audiences

- **FILE**: `src/app/api/auth/google-mobile/route.ts` (lines 38-42)
- **IMPLEMENT**: Replace single audience check with a list:
  ```typescript
  const allowedAudiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean);

  if (!allowedAudiences.includes(googleUser.aud)) {
    return NextResponse.json(
      { error: "Token audience mismatch" },
      { status: 401 }
    );
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 13 (L-2): Replace `any` type in employee update

- **FILE**: `src/app/api/employees/[id]/route.ts` (line 62)
- **IMPLEMENT**: Change `const employeeData: any = {};` to a proper type. Since the data is built from Zod-validated `personalInfo` and `employmentInfo`, use:
  ```typescript
  const employeeData: Record<string, unknown> = {};
  ```
  Then, for the `tx.employee.update` call, cast the spread:
  ```typescript
  data: {
    ...(employeeData as Parameters<typeof tx.employee.update>[0]['data']),
    updatedAt: new Date(),
  },
  ```
  Alternatively, a simpler approach: use `Prisma.EmployeeUpdateInput`:
  ```typescript
  import { Prisma } from "@prisma/client";
  const employeeData: Partial<Prisma.EmployeeUpdateInput> = {};
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 14 (L-4): Validate role enum in middleware

- **FILE**: `src/middleware.ts` (line 62)
- **IMPLEMENT**: Replace the raw cast with validation:
  ```typescript
  const validRoles = ["ADMIN", "HR", "MANAGER", "STAFF"];
  const userRole = typeof token?.role === "string" && validRoles.includes(token.role) ? token.role : null;
  ```
  Then use `userRole` in the role check:
  ```typescript
  if (isHRRoute && (!userRole || !hrAllowedRoles.includes(userRole))) {
  ```
  And update the admin route check:
  ```typescript
  if (isAdminRoute && userRole !== "ADMIN") {
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 15 (L-9): Return 403 instead of 401 for authenticated users lacking permissions

- **FILE**: `src/app/api/leave/rollover/route.ts` (line 10-11)
- **IMPLEMENT**: The current code returns 401 for non-ADMIN authenticated users:
  ```typescript
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ```
  Split into two checks:
  ```typescript
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`

### Task 16 (L-10): Remove dead `/admin` route protection from middleware

- **FILE**: `src/middleware.ts` (lines 49-55)
- **IMPLEMENT**: Remove the dead code block:
  ```typescript
  // Admin-only routes
  const adminRoutes = ["/admin"];
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  if (isAdminRoute && token?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  ```
  No `/admin` page exists. The `/settings` route handles admin-only access via the `hrManagementRoutes` block below it.
- **VALIDATE**: `npx tsc --noEmit` + E2E `e2e/01-auth.spec.ts` still passes

### Task 17: Fix build blocker — exclude scripts from tsconfig or fix TS error

- **FILE**: `tsconfig.json`
- **IMPLEMENT**: Add `"scripts"` to the `exclude` array:
  ```json
  "exclude": ["node_modules", "scripts"]
  ```
  This is the cleanest fix — utility scripts are run with `tsx` which has its own TS handling. They shouldn't block `next build` or `tsc --noEmit`.
- **ALTERNATIVE**: Fix `cleanup-cancelled.ts` line 77 by converting `new Set(...)` spread to `Array.from(new Set(...))`. But excluding scripts is better practice overall.
- **VALIDATE**: `npx tsc --noEmit` should show 0 errors. `npm run build` should succeed.

### Task 18: Final validation

- **IMPLEMENT**: Run full validation suite:
  1. `npx tsc --noEmit` — 0 errors
  2. `npx eslint src/` — 0 errors
  3. `npm run test` — all unit tests pass
  4. `npm run build` — succeeds
  5. E2E spot check (optional): `npx playwright test e2e/07-calendar.spec.ts e2e/10-settings.spec.ts`
- **VALIDATE**: All pass

---

## TESTING STRATEGY

### Unit Tests
- Existing 31 unit tests cover leave API logic — should not be affected
- No new unit tests needed (fixes are auth guards and validation, not business logic)

### Integration Tests
- None currently; not adding

### Edge Cases
- H-1: PDF with BOM prefix, empty file (0 bytes), file with wrong extension
- H-2: SKIP_AUTH mode with null userId — should still allow (dev convenience)
- M-5: Empty messages array, single message at max length, 51 messages (should reject)
- M-6: MANAGER trying to approve own leave (should return 403)
- M-8: Mobile token with Android client ID audience (should be accepted when configured)

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style
```bash
npx tsc --noEmit
npx eslint src/
```

### Level 2: Unit Tests
```bash
npm run test
```

### Level 3: Build
```bash
npm run build
```

### Level 4: E2E (optional, spot check)
```bash
npx playwright test e2e/07-calendar.spec.ts
npx playwright test e2e/10-settings.spec.ts
npx playwright test e2e/01-auth.spec.ts
```

---

## ACCEPTANCE CRITERIA

- [ ] H-1: File upload validates magic bytes, not just client MIME type
- [ ] H-2: Calendar DELETE/PATCH returns 403 if user doesn't own the event
- [ ] H-3: Settings GET returns 401 for unauthenticated requests
- [ ] M-1: Security headers present in response (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] M-2: Default employee password is random when env var not set
- [ ] M-4: Cron route rejects all requests when CRON_SECRET is unset
- [ ] M-5: Chat API validates message count (max 50) and length (max 4000 chars)
- [ ] M-6: Self-approval of leave/expenses returns 403
- [ ] M-8: Mobile Google auth accepts iOS and Android client IDs
- [ ] L-1: No Prisma error messages leaked in 500 responses (3 files)
- [ ] L-2: No `any` type in employee update route
- [ ] L-4: Role cast in middleware validates against known enum values
- [ ] L-9: Rollover returns 403 (not 401) for authenticated non-admin users
- [ ] L-10: Dead `/admin` route code removed from middleware
- [ ] Build: `tsc`, `eslint`, `vitest`, `next build` all pass
- [ ] No regressions in existing E2E tests

## DEFERRED (NOT IN THIS PLAN)

These findings are intentionally excluded — they need boss input or infrastructure changes:

| Finding | Reason |
|---------|--------|
| M-3: Rate limiting on login | Needs `@upstash/ratelimit` + Redis setup — separate plan |
| M-7: Hardcoded admin email in SKIP_AUTH | Dev-only path, low risk, code smell only |
| M-9: Uploaded files publicly accessible | Needs UploadThing activation (blocked on API key) |
| M-10: Uploaded files lost on redeploy | Needs Coolify volume mount or UploadThing |
| M-11: Open Google OAuth registration | Needs boss decision on domain restriction policy |
| M-12: SKIP_AUTH inconsistency | Documentation task, not a code fix |
| L-3: Employee ID race condition | Needs atomic sequence (Prisma `$queryRaw` or DB sequence) — separate plan |
| L-5: sameSite "strict" for mobile cookie | Might break cross-origin redirects, needs testing |
| L-6: Rollover bulk data in response | Minor, admin-only endpoint |
| L-7: Cleanup script production guard | Script is untracked utility, not deployed |
| L-8: Rollover ADMIN-only vs HR | Policy decision, not a bug |
| Dependency updates | `next`, `next-auth`, `xlsx` replacement — separate plan with regression testing |
