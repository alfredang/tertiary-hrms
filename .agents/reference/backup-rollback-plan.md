# Backup & Rollback Plan — Session 5 Deployment

**Created**: 2026-02-26
**For commit**: Security hardening, DatePicker, OAuth improvements

---

## Quick Reference: Last Known Good Commit

```
47baad1  (HEAD before this session's changes)
```

To fully revert everything:
```bash
git stash        # if uncommitted
git reset --hard 47baad1
git push --force-with-lease origin main
```

---

## Scenario 1: Can't Log In At All (Auth Completely Broken)

**Symptoms**: Login page shows errors, credentials don't work, blank screen after login

**Most likely cause**: `isDevAuthSkipped()` import failing or middleware crash

**Fix — Option A: Revert middleware only**
```bash
git checkout 47baad1 -- src/middleware.ts
git commit -m "fix: revert middleware to restore login"
git push
```

**Fix — Option B: Bypass auth temporarily**

Add to `.env` on Coolify:
```
SKIP_AUTH=true
```
This WON'T work in production anymore (that's the whole point of `isDevAuthSkipped()`). Instead, you'd need to:

1. SSH into Coolify server
2. Set `NODE_ENV=development` temporarily (NOT recommended for production)
3. Or revert the `dev-auth.ts` file to always return raw SKIP_AUTH check

**Fix — Option C: Direct DB password reset**
```bash
# From local machine (shared DB)
npx dotenv-cli -e .env.local -- npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('123456', 10);
  await prisma.user.update({
    where: { email: 'admin@tertiaryinfotech.com' },
    data: { password: hash }
  });
  console.log('Password reset to 123456');
}
main().finally(() => prisma.\$disconnect());
"
```

---

## Scenario 2: Test Accounts Deactivated / Can't Log In With Test Accounts

**Symptoms**: admin@, staff@, staff2@ get "Invalid email or password" or "Account inactive"

**Most likely cause**: Someone ran `deactivate-test-accounts.ts`, or employee status got set to INACTIVE

**Fix — Reactivate script** (already created):
```bash
npx dotenv-cli -e .env.local -- npx tsx scripts/reactivate-test-accounts.ts
```

**Fix — Direct DB** (if script doesn't work):
```bash
npx dotenv-cli -e .env.local -- npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const emails = [
    'admin@tertiaryinfotech.com',
    'staff@tertiaryinfotech.com',
    'staff2@tertiaryinfotech.com'
  ];
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true }
    });
    if (user?.employee) {
      await prisma.employee.update({
        where: { id: user.employee.id },
        data: { status: 'ACTIVE' }
      });
      console.log('Reactivated:', email);
    } else {
      console.log('Not found:', email);
    }
  }
}
main().finally(() => prisma.\$disconnect());
"
```

---

## Scenario 3: Re-Create Test Accounts From Scratch

**When**: Test accounts somehow got deleted entirely (user + employee records gone)

**DO NOT run `prisma/seed.ts`** — it does `deleteMany` and wipes ALL data.

Instead, create them manually:

```bash
npx dotenv-cli -e .env.local -- npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('123456', 10);

  const accounts = [
    {
      email: 'admin@tertiaryinfotech.com',
      role: 'ADMIN',
      name: 'Admin User',
      employeeId: 'EMP097',
    },
    {
      email: 'staff@tertiaryinfotech.com',
      role: 'STAFF',
      name: 'Staff User',
      employeeId: 'EMP098',
    },
    {
      email: 'staff2@tertiaryinfotech.com',
      role: 'STAFF',
      name: 'Staff User 2',
      employeeId: 'EMP099',
    },
  ];

  for (const acct of accounts) {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: acct.email } });
    if (existing) {
      console.log('Already exists:', acct.email);
      continue;
    }

    // Get or create a department
    let dept = await prisma.department.findFirst();
    if (!dept) {
      dept = await prisma.department.create({
        data: { id: randomUUID(), name: 'General', code: 'GEN' }
      });
    }

    const userId = randomUUID();
    const empId = randomUUID();

    await prisma.user.create({
      data: {
        id: userId,
        email: acct.email,
        password: hash,
        role: acct.role,
        updatedAt: new Date(),
        employee: {
          create: {
            id: empId,
            employeeId: acct.employeeId,
            name: acct.name,
            email: acct.email,
            gender: 'MALE',
            nationality: 'Singaporean',
            employmentType: 'FULL_TIME',
            status: 'ACTIVE',
            departmentId: dept.id,
            startDate: new Date('2024-01-01'),
          }
        }
      }
    });
    console.log('Created:', acct.email, '(password: 123456)');
  }
}
main().finally(() => prisma.\$disconnect());
"
```

---

## Scenario 4: DatePicker Broken / Forms Unusable

**Symptoms**: Date fields don't render, calendar popup doesn't open, can't submit leave/expense forms

**Fix — Quick revert to native inputs**:
```bash
# Revert all form files to before DatePicker migration
git checkout 47baad1 -- \
  src/components/leave/leave-request-form.tsx \
  src/components/leave/leave-edit-form.tsx \
  src/components/expenses/expense-submit-form.tsx \
  src/components/expenses/expense-edit-form.tsx \
  src/components/calendar/calendar-event-form.tsx \
  src/components/employees/personal-info-form.tsx \
  src/components/employees/employment-info-form.tsx \
  src/components/leave/leave-list.tsx \
  src/components/expenses/expense-list.tsx

git commit -m "fix: revert DatePicker to native date inputs"
git push
```

---

## Scenario 5: Google OAuth Broken

**Symptoms**: "Could not start Google sign-in" or redirect loop after Google login

**Fix — Revert OAuth changes only**:
```bash
git checkout 47baad1 -- src/lib/auth.ts src/app/\(auth\)/login/page.tsx
git commit -m "fix: revert OAuth changes"
git push
```

---

## Scenario 6: Cron Payroll Stopped Working

**Symptoms**: Automated payroll generation returns 500 error

**Most likely cause**: CRON_SECRET guard rejecting requests in production

**Fix**: Set `CRON_SECRET` env var in Coolify, then include it as `Authorization: Bearer <secret>` header in cron caller.

Or revert:
```bash
git checkout 47baad1 -- src/app/api/cron/payroll/route.ts
git commit -m "fix: revert cron payroll guard"
git push
```

---

## General: Selective Revert Cheat Sheet

Revert any single file to pre-session state:
```bash
git checkout 47baad1 -- <path/to/file>
```

Revert entire session (nuclear option):
```bash
git reset --hard 47baad1
git push --force-with-lease origin main
```

---

## Prevention Checklist (Before Deploying)

- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] `npm run test` passes (31/31)
- [ ] `npm run build` succeeds
- [ ] Login works on localhost with admin@ account
- [ ] Login works on localhost with staff@ account
- [ ] Leave request form renders with DatePicker
- [ ] Expense submit form renders with DatePicker
- [ ] Calendar new event form renders with DatePicker

---

## Contact / Escalation

If nothing above works and production is down:
1. Coolify dashboard → redeploy previous build
2. Or: `git reset --hard 47baad1 && git push --force-with-lease`
3. Database is unaffected by code changes (schema hasn't changed this session)
