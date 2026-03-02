# Security Audit & QA Report

**Project**: Tertiary HRMS (https://hrms.tertiaryinfo.tech)
**Date**: 2 March 2026
**Branch**: `main` at `2dfd20e`
**Scope**: Full security sweep (OWASP Top 10, dependency audit, auth/RBAC review) + QA pass (types, lint, tests, build)

---

## Executive Summary

The application is **functionally stable** — all unit tests pass, ESLint is clean, and the main codebase compiles without errors. However, the security audit identified **3 high-severity**, **12 medium-severity**, and **10 low-severity** findings across dependency vulnerabilities, missing security headers, authorization gaps, and configuration issues. No critical code-level vulnerabilities (SQL injection, XSS) were found — the codebase uses Prisma's query builder and React's JSX escaping correctly throughout.

### Risk Score: MEDIUM

| Category | Status |
|----------|--------|
| Injection (SQL/NoSQL) | PASS — no raw queries, Prisma only |
| XSS | PASS — no `dangerouslySetInnerHTML`, React escaping |
| CSRF | PASS — NextAuth JWT + `sameSite: lax` cookies |
| Password Hashing | PASS — bcryptjs with cost factor 12 |
| Authentication | PARTIAL — `SKIP_AUTH` properly guarded for prod, but gaps elsewhere |
| Authorization (RBAC) | PARTIAL — inconsistent across routes, ownership gaps |
| Security Headers | FAIL — none configured |
| Dependency Vulnerabilities | FAIL — 19 vulns (2 critical, 7 high) |
| File Upload Security | PARTIAL — MIME checked but client-supplied, not magic bytes |
| Rate Limiting | FAIL — none on any endpoint |

---

## QA Pass Results

### TypeScript (`tsc --noEmit`)

| Result | Details |
|--------|---------|
| FAIL (1 error) | `scripts/cleanup-cancelled.ts:77` — `Set<string>` iteration needs `--downlevelIteration` or ES2015+ target |
| Main app code | CLEAN — all `src/` files compile without errors |

The error is in an **untracked utility script**, not in the deployed application. The app itself type-checks cleanly.

### ESLint

| Result | Details |
|--------|---------|
| PASS (0 errors, 1 warning) | `src/components/ui/document-preview-modal.tsx:58` — use `<Image />` instead of `<img>` |

### Unit Tests (Vitest)

| Result | Details |
|--------|---------|
| PASS | **31/31 tests passing** in `src/__tests__/leave-api.test.ts` (243ms) |

### Production Build (`next build`)

| Result | Details |
|--------|---------|
| FAIL | Same TypeScript error as above (`scripts/cleanup-cancelled.ts`) blocks the build |
| Root cause | Untracked script included in build scope — either commit with a fix or exclude from `tsconfig.json` |

### E2E Tests (Playwright) — Last Run

| Result | Details |
|--------|---------|
| PASS | **144/144 tests passing** across 3 viewports (Chromium + iPhone 14 + Pixel 7) — run on 2 Mar 2026 |

---

## Dependency Vulnerabilities (`npm audit`)

**19 vulnerabilities total**: 2 critical, 7 high, 10 moderate

### Critical (2)

| Package | Issue | Fix |
|---------|-------|-----|
| `next` 14.2.20 | 11 CVEs: DoS via Server Actions, SSRF via middleware redirect, cache poisoning, authorization bypass, content injection, image optimization abuse | `npm audit fix --force` installs 14.2.35 (outside stated range) |
| `next-auth` 5.0.0-beta.25 | Email misdelivery vulnerability (GHSA-5jpx-9hw9-2fx4) | Update to beta.30+ |

### High (7)

| Package | Issue | Fix |
|---------|-------|-----|
| `xlsx` (SheetJS) | Prototype pollution + ReDoS | **No fix available** — consider replacing with `exceljs` or `read-excel-file` |
| `glob` 10.x | Command injection via `--cmd` flag | `npm audit fix --force` (breaking: eslint-config-next 16.x) |
| `minimatch` | ReDoS via wildcards (3 variants) | `npm audit fix` |
| `rollup` 4.x | Arbitrary file write via path traversal | `npm audit fix` |
| `tar` <7.5.8 | Arbitrary file read/write via hardlink/symlink chain | `npm audit fix` |

### Moderate (10)

| Package | Issue |
|---------|-------|
| `ai` (Vercel AI SDK) | File type whitelist bypass on upload |
| `ajv` | ReDoS with `$data` option |
| `dompurify` (via jspdf) | XSS bypass |
| `jsondiffpatch` (via ai) | XSS via HtmlFormatter |
| `nanoid` (via @ai-sdk/*) | Predictable output with non-integer input |

### Recommended Actions

1. **Immediate**: `npm audit fix` — resolves minimatch, rollup, tar, ajv (non-breaking)
2. **Soon**: Update `next` to 14.2.35+ and `next-auth` to beta.30+ (test for regressions)
3. **Plan**: Replace `xlsx` with `exceljs` — no fix available, prototype pollution is exploitable
4. **Defer**: AI SDK + jspdf updates require major version bumps (breaking changes)

---

## Security Findings

### HIGH (3)

#### H-1: File Upload Validates Client-Supplied MIME Type, Not File Content

**File**: `src/app/api/upload/route.ts:40-52`
**Risk**: An attacker can upload a malicious file (HTML, SVG with script, PHP) while setting `Content-Type: image/jpeg`. The server trusts the client header and writes the file to `public/uploads/` — a statically-served directory.

```typescript
// PROBLEM: file.type is whatever the client claims
if (!allowedTypes.includes(file.type)) { ... }
await writeFile(filePath, buffer); // written to public/uploads/ — HTTP accessible
```

**Impact**: Stored file could be served with wrong content type. In the current Next.js standalone setup, static files are served as-is. An HTML file disguised as JPEG could execute JavaScript if accessed directly.

**Fix**: Read the first bytes of the buffer and validate against magic byte signatures (`FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `25 50 44 46` for PDF). Use a library like `file-type` for reliable detection.

---

#### H-2: Calendar DELETE/PATCH Has No Ownership Check

**File**: `src/app/api/calendar/[id]/route.ts:17-49` (DELETE), `51-112` (PATCH)
**Risk**: Any authenticated user can delete or modify any other user's personal calendar events by providing the event ID. The code comments say "Any authenticated user can delete any event (shared company calendar)" but the documented design is **fully personal** — events filtered by `createdById`.

**Impact**: Staff member who knows/guesses another user's event ID can delete or modify their private events. Event IDs are CUIDs (not easily enumerable) but this is security through obscurity.

**Fix**: After `findUnique`, add: `if (event.createdById !== currentUserId && !isAdmin) return 403`.

---

#### H-3: `GET /api/settings/company` Has No Authentication

**File**: `src/app/api/settings/company/route.ts:78-113`
**Risk**: The `GET` handler returns company settings (name, UEN, address, phone, email, `approvalEmails`) with zero authentication. The `PATCH` handler correctly checks ADMIN/HR roles. While the middleware blocks unauthenticated access to most routes, this is a defense-in-depth failure — if middleware is ever bypassed (e.g., via direct API call, proxy misconfiguration), company data including internal HR email addresses leaks.

**Fix**: Add `const session = await auth(); if (!session?.user) return 401;` to the GET handler.

---

### MEDIUM (12)

#### M-1: No HTTP Security Headers

**File**: `next.config.mjs`
**Risk**: No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers. Leaves the app open to clickjacking and provides no XSS defense-in-depth.
**Fix**: Add `headers()` async function to `next.config.mjs`.

#### M-2: Default Employee Password Hardcoded as "123456"

**File**: `src/app/api/employees/route.ts:55`
**Risk**: `const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || "123456"`. If `DEFAULT_EMPLOYEE_PASSWORD` is not set in production (not listed as required), every new employee gets the well-known test password.
**Fix**: Require the env var or generate a random password per employee.

#### M-3: No Rate Limiting on Login Endpoint

**File**: `src/app/api/auth/[...nextauth]/route.ts`
**Risk**: Unlimited login attempts allowed. Enables brute-force password attacks and CPU exhaustion (bcrypt is intentionally expensive).
**Fix**: Add rate limiting middleware (e.g., `@upstash/ratelimit` with Redis, or in-memory for single-server).

#### M-4: Cron Payroll Route Open Without Auth in Non-Production

**File**: `src/app/api/cron/payroll/route.ts:9-22`
**Risk**: When `CRON_SECRET` is unset and `NODE_ENV !== "production"`, the endpoint runs payroll generation with zero authentication. Since the project uses a **shared production database**, a dev-mode hit to this endpoint generates real payroll records.
**Fix**: Reject all requests when `CRON_SECRET` is not configured, regardless of `NODE_ENV`.

#### M-5: Chat API Accepts Unbounded Messages Array

**File**: `src/app/api/chat/route.ts:44-98`
**Risk**: No validation on message count, message length, or array shape. A malicious user can send thousands of messages or extremely long content to exhaust API quota/inflate costs.
**Fix**: Add Zod schema: max message count, max character length per message.

#### M-6: MANAGER Can Self-Approve Own Leave/Expenses

**Files**: `src/app/api/leave/[id]/approve/route.ts:17`, `src/app/api/expenses/[id]/approve/route.ts:16`
**Risk**: No check that `approverId !== request.employeeId`. A MANAGER can submit their own leave/expense and approve it. Segregation-of-duties violation.
**Fix**: Add `if (session.user.employeeId === request.employeeId) return 403`.

#### M-7: Hardcoded Admin Email Fallback in ~10 Server Pages

**Files**: `src/app/(dashboard)/layout.tsx:24`, `dashboard/page.tsx:139`, `leave/page.tsx:89`, `expenses/page.tsx:69`, `calendar/page.tsx:87`, `employees/page.tsx:57`, `payroll/page.tsx:80`, `profile/page.tsx:19`, `calendar/day/[date]/page.tsx:103`
**Risk**: When `SKIP_AUTH` is active, these pages fall back to `where: { email: "admin@tertiaryinfotech.com" }` to load data. This is a dev-only path (guarded by `NODE_ENV !== "production"`), but hardcoding a real production email in source code is a code smell.
**Fix**: Use a `DEV_USER_EMAIL` env var instead of hardcoded string.

#### M-8: Mobile Google Sign-In Validates Against Web Client ID Only

**File**: `src/app/api/auth/google-mobile/route.ts:38-42`
**Risk**: Mobile tokens have audience set to the mobile OAuth client ID, not the web `GOOGLE_CLIENT_ID`. When mobile client IDs are eventually configured, this check will reject all valid mobile logins.
**Fix**: Compare against a list of allowed audiences (web + iOS + Android client IDs).

#### M-9: Uploaded Files Publicly Accessible Without Authentication

**File**: `src/app/api/upload/route.ts:58`
**Risk**: Files in `public/uploads/` are served statically by Next.js with no auth check. Medical certificates and expense receipts are accessible to anyone who knows the URL. Filenames use `Date.now()_random6chars` — weak obscurity.
**Fix**: Move to authenticated file serving (API route that checks session before streaming file) or activate UploadThing (blocked on API key).

#### M-10: Uploaded Files Lost on Container Restart

**File**: `src/app/api/upload/route.ts:58`
**Risk**: Files written to `public/uploads/` inside the Docker container are ephemeral — lost on every Coolify redeploy. Users silently lose their uploaded documents.
**Fix**: Configure Coolify persistent volume mount for `public/uploads/`, or activate UploadThing.

#### M-11: Open Registration via Google — Any Google Account Can Create a User

**File**: `src/app/api/auth/google-mobile/route.ts:67-78`, `src/lib/auth.ts:112-127`
**Risk**: Any person with a valid Google account can create themselves a STAFF account. For a corporate HRMS, this should verify email domain (e.g., `@tertiaryinfotech.com`) or restrict to pre-existing users.
**Fix**: Add domain allowlist check: `if (!email.endsWith('@tertiaryinfotech.com')) return 403`.

#### M-12: SKIP_AUTH Inconsistently Applied Across Routes

**Files**: ~27 locations use `isDevAuthSkipped()`, but 8 routes (approve, reject, reset, cancel, chat, payslip PDF) intentionally skip it.
**Risk**: Inconsistent dev experience. A developer using `SKIP_AUTH=true` may not realize some routes still require real auth. No documentation of which routes intentionally skip it.
**Fix**: Document the intentional exclusions. Consider removing `SKIP_AUTH` from all routes and using middleware-only bypass.

---

### LOW (10)

| ID | Finding | File |
|----|---------|------|
| L-1 | Prisma error messages leaked in 500 responses (`error.message` exposed) | `api/employees/route.ts:142`, `api/employees/[id]/route.ts:139`, `api/settings/company/route.ts:71` |
| L-2 | `employeeData: any` bypasses TypeScript safety on employee updates | `api/employees/[id]/route.ts:62` |
| L-3 | Employee ID generation has race condition (non-atomic sequential read+write) | `api/employees/route.ts:46-53` |
| L-4 | `token?.role as string` cast without enum validation in middleware | `middleware.ts:62` |
| L-5 | Mobile cookie uses `sameSite: "lax"` — could be `"strict"` for native app | `api/auth/google-mobile/route.ts:134` |
| L-6 | Rollover endpoint returns bulk per-employee leave data in response body | `api/leave/rollover/route.ts:109-116` |
| L-7 | `cleanup-cancelled.ts` has no production database guard | `scripts/cleanup-cancelled.ts` |
| L-8 | Rollover restricted to ADMIN-only but is functionally an HR operation | `api/leave/rollover/route.ts:10` |
| L-9 | 401 returned instead of 403 for authenticated users lacking permissions | `api/leave/rollover/route.ts:11`, others |
| L-10 | Dead middleware code — `/admin` route protection exists but no `/admin` page | `middleware.ts:50-54` |

---

### INFO / Positive Observations

| ID | Observation |
|----|-------------|
| I-1 | **No SQL injection** — zero `$queryRaw`/`$executeRaw` calls in entire codebase |
| I-2 | **No XSS vectors** — zero `dangerouslySetInnerHTML` usage, React JSX escaping throughout |
| I-3 | **CSRF adequately handled** — NextAuth JWT + `sameSite: lax` cookies |
| I-4 | **Password hashing correct** — bcryptjs with cost factor 12 |
| I-5 | **`SKIP_AUTH` production guard works** — `NODE_ENV !== "production"` check is reliable |
| I-6 | **Ownership checks on mutations consistent** — leave/expense edit/cancel verify `employeeId === session.user.employeeId` |
| I-7 | **Admin action routes don't use SKIP_AUTH** — approve/reject/reset always require real session |
| I-8 | **Zod validation on all write endpoints** — consistent input validation layer |
| I-9 | **INACTIVE employee status blocks both auth paths** — credentials and Google OAuth |
| I-10 | **Payslip PDF has combined ownership + role check** — correct pattern for sensitive financial data |

---

## Findings Summary

| Severity | Count | Actionable Now | Needs Boss/Config |
|----------|-------|----------------|-------------------|
| HIGH | 3 | 3 (code fixes) | 0 |
| MEDIUM | 12 | 8 (code fixes) | 4 (API keys, infra) |
| LOW | 10 | 6 (code fixes) | 0 |
| INFO | 10 | — | — |
| **Total** | **35** | **17** | **4** |

---

## Recommended Fix Priority

### Immediate (before next deploy)

1. **H-1**: Add magic byte validation to file upload route
2. **H-2**: Add ownership check to calendar DELETE/PATCH
3. **H-3**: Add auth check to `GET /api/settings/company`
4. **M-1**: Add security headers to `next.config.mjs`
5. **M-2**: Require `DEFAULT_EMPLOYEE_PASSWORD` env var or generate random

### Soon (within next sprint)

6. **M-6**: Block self-approval of leave/expenses
7. **M-5**: Add Zod validation + limits to chat API
8. **M-4**: Fix cron route to reject when `CRON_SECRET` is unset (any env)
9. **M-8**: Support multiple Google OAuth client ID audiences
10. **L-1**: Stop leaking Prisma error messages in 500 responses
11. Run `npm audit fix` for non-breaking dependency patches

### Planned (with dependency updates)

12. **M-3**: Add rate limiting to login (needs `@upstash/ratelimit` or similar)
13. Update `next` to 14.2.35+ (test for regressions)
14. Update `next-auth` to beta.30+
15. Replace `xlsx` with `exceljs` (no fix available for prototype pollution)

### Blocked on Boss

16. **M-9/M-10**: Activate UploadThing (needs API key) or configure Coolify persistent volume
17. **M-11**: Decide on Google OAuth domain restriction policy

---

## Build Health

| Check | Result | Notes |
|-------|--------|-------|
| `tsc --noEmit` | 1 error | Untracked `scripts/cleanup-cancelled.ts` only — main app clean |
| `eslint src/` | 0 errors, 1 warning | `<img>` vs `<Image />` in document preview modal |
| `vitest run` | 31/31 pass | All leave API unit tests green |
| `next build` | FAIL | Blocked by same TS error in cleanup script |
| E2E (last run) | 144/144 pass | 3 viewports, run 2 Mar 2026 |
| `npm audit` | 19 vulns | 2 critical, 7 high, 10 moderate |

**Build fix**: Either exclude `scripts/` from `tsconfig.json` include paths, fix the Set iteration in `cleanup-cancelled.ts`, or delete the untracked file.

---

*Generated by Claude Code security audit — 2 March 2026*
