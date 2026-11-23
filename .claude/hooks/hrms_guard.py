#!/usr/bin/env python3
"""HRMS business-logic guard for Claude Code (project hooks, .claude/settings.json).

PreToolUse  Bash   - blocks destructive Prisma commands (the local DATABASE_URL is PRODUCTION):
                     migrate reset, --force-reset, --accept-data-loss; previews every `prisma db push`
                     and blocks it when the SQL diff drops/alters existing columns, tables or enum values.
                   - blocks `git add/commit` of PII paths (.trainers/, .bank_statements/, .env*, uploads/).
                   - before `git push`: tsc --noEmit + vitest must pass, and the login-email guardrail must hold.
PostToolUse Edit/Write
                   - edits to business-logic files (leave, MC, NPL, attendance, payroll/CPF, accounting,
                     trainers, auth/roles) run the related vitest tests; failures are fed back to Claude.
                   - prisma/schema.prisma edits run `prisma validate` and print the additive-only rule.
                   - LOGIN GUARDRAIL (Alfred, 22 Nov 2026): staff sign in only with @tertiaryinfotech.com; personal
                     email only for PART_TIME staff and interns (src/lib/login-policy.ts). Every sign-in path must
                     keep calling isLoginEmailAllowed; an edit that removes a call is reported back as a failure.
                   - ROLE GUARDRAIL (22 Nov 2026): elevated roles only for the people in src/lib/role-policy.ts (everyone
                     else STAFF or INTERN); sign-in paths keep effectiveRoles, role writes keep disallowedRoles.
Exit code 2 = block (PreToolUse) / report failure back to Claude (PostToolUse).
"""
import json, os, re, subprocess, sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Windows: a lowercase drive letter ("c:\...") makes vitest load two copies of itself
# ("failed to find the runner" / "No test suite found"), so normalise it.
if re.match(r"^[a-z]:", ROOT):
    ROOT = ROOT[0].upper() + ROOT[1:]

BUSINESS = re.compile(
    r"^src/(lib/(utils|cpf-calculator|cpf-submission|leave[\w-]*|time-off[\w-]*|attendance[\w-]*|payroll[\w-]*|"
    r"parse-excel-statement|claude-parse-statement|trainer[\w-]*|trainers|auth|view-mode|qbo[\w-]*|quickbooks[\w-]*|"
    r"reconcil[\w-]*|compliance[\w-]*|validations/[\w-]+)\.tsx?|app/api/(leave|time-off|attendance|payroll|accounting|"
    r"trainers|agent|cron|employees|quickbooks)/.*\.ts)$"
)
PII_PATHS = re.compile(r"(^|\s|/)((\.trainers|\.bank_statements|uploads|env_backup)(/|\s|$)|\.env(\.\w+)?(\s|$))")
DESTRUCTIVE_SQL = re.compile(r"^\s*(DROP\s|ALTER\s+TABLE\s+\S+\s+(DROP|ALTER\s+COLUMN)|ALTER\s+TYPE\s+\S+\s+RENAME|TRUNCATE|DELETE\s)", re.I | re.M)


def run(cmd, timeout=600):
    # Hooks can start with a bare PATH (no Homebrew), and "npx: command not found" then reads as a failed check.
    env = dict(os.environ, PATH="/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "/usr/bin:/bin"))
    p = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout, env=env)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def block(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def commands(cmd):
    """Shell commands actually executed: drop heredoc bodies (commit messages, scripts) and split on ; && || | newlines,
    so words inside a commit message never trigger a guard."""
    lines, out, skip = cmd.splitlines(), [], None
    for line in lines:
        if skip is not None:
            if line.strip() == skip:
                skip = None
            continue
        m = re.search(r"<<-?\s*['\"]?(\w+)['\"]?", line)
        if m:
            skip = m.group(1)
            line = line[:m.start()]
        line = re.sub(r"(['\"]).*?\1", " ", line)       # quoted strings (e.g. -m "...") are data, not commands
        out += [p.strip() for p in re.split(r"&&|\|\||;|\|", line) if p.strip()]
    return out


def pre_bash(cmd):
    segs = commands(cmd)
    starts = lambda rx: any(re.match(rx, s) for s in segs)
    c = " ".join(segs)
    if re.search(r"prisma\s+migrate\s+reset|--force-reset|--accept-data-loss", c):
        block("HRMS guard: blocked. The local DATABASE_URL is the PRODUCTION database; reset/force-reset/accept-data-loss "
              "would destroy live HR and payroll data. Make the schema change additive instead.")
    if re.search(r"prisma\s+db\s+push|npm\s+run\s+db:push", c):
        # Read DATABASE_URL in Python: the command runs under cmd.exe on Windows, where
        # `set -a; . ./.env` (POSIX) fails and the preview never runs.
        db_url = os.environ.get("DATABASE_URL", "")
        env_file = os.path.join(ROOT, ".env")
        if not db_url and os.path.exists(env_file):
            for line in open(env_file, encoding="utf-8", errors="replace"):
                m = re.match(r'\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?', line)
                if m:
                    db_url = m.group(1).strip()
        code, out = run(f'npx prisma migrate diff --from-url "{db_url}" '
                        '--to-schema-datamodel prisma/schema.prisma --script', timeout=180)
        if code != 0:
            block("HRMS guard: could not preview the schema diff before db push:\n" + out[-1500:])
        bad = [l for l in out.splitlines() if DESTRUCTIVE_SQL.search(l)]
        if bad:
            block("HRMS guard: blocked `db push` — the diff against PRODUCTION is destructive:\n  " + "\n  ".join(bad[:15]) +
                  "\nOnly additive changes (new tables, nullable columns, new enum values) may be pushed. "
                  "Ask Alfred before any destructive migration.")
        # Additive: allow, but remind about enum ordering.
        if re.search(r"ALTER TYPE .* ADD VALUE", out):
            print("HRMS guard: new enum value(s). Deploy the code that knows them BEFORE writing them to any row "
                  "(e.g. assigning TRAINER_ADMIN), or the running app's Prisma client fails on those rows.", file=sys.stderr)
    if any(re.match(r"git\s+(add|commit)\b", s) and PII_PATHS.search(" " + s + " ") for s in segs):
        block("HRMS guard: blocked — .trainers/, .bank_statements/, .env and uploads/ hold NRIC, bank and salary data and must never be committed.")
    if starts(r"git\s+(add\s+(-A|--all|\.)(\s|$)|commit\s+(-\w*a\w*|--all)\b)"):
        code, out = run("git status --porcelain --untracked-files=all")
        leaked = [l for l in out.splitlines() if re.search(r"\.trainers/|\.bank_statements/|(^|/)\.env|/uploads/", l)]
        if leaked:
            block("HRMS guard: `git add` would stage PII files:\n  " + "\n  ".join(leaked[:10]))
    if starts(r"git\s+push\b"):
        bad = role_guard_problems()
        if bad:
            block("HRMS guard: blocked push — ROLE GUARDRAIL broken (elevated roles only for src/lib/role-policy.ts):\n  "
                  + "\n  ".join(bad))
        bad = login_guard_problems()
        if bad:
            block("HRMS guard: blocked push — LOGIN GUARDRAIL broken (company email for staff on every sign-in path):\n  "
                  + "\n  ".join(bad))
        code, out = run("npx tsc --noEmit", timeout=600)
        if code != 0:
            block("HRMS guard: blocked push — TypeScript errors:\n" + out[-3000:])
        code, out = run("npx vitest run", timeout=900)
        if code != 0:
            block("HRMS guard: blocked push — unit tests (leave/MC/NPL proration, CPF, payroll, attendance, trainers) failed:\n" + out[-3000:])


# Sign-in paths that must enforce the company-email rule, and how many calls each must keep.
LOGIN_GUARD = {
    "src/lib/auth.ts": 4,                          # password + email-code authorize, Google signIn, jwt refresh
    "src/app/api/auth/google-mobile/route.ts": 1,  # Google sign-in from the phone apps
    "src/app/api/auth/send-otp/route.ts": 1,       # no code to a refused address
}


# Role guardrail (Alfred, 22 Nov 2026): elevated roles only for the people in src/lib/role-policy.ts.
ROLE_GUARD = {
    "src/lib/auth.ts": ("effectiveRoles(", 4),
    "src/app/api/auth/google-mobile/route.ts": ("effectiveRoles(", 1),
    "src/app/api/employees/route.ts": ("disallowedRoles(", 1),
    "src/app/api/employees/[id]/route.ts": ("disallowedRoles(", 1),
}


def role_guard_problems():
    problems = []
    if not os.path.exists(os.path.join(ROOT, "src/lib/role-policy.ts")):
        problems.append("src/lib/role-policy.ts is missing")
    for rel, (call, need) in ROLE_GUARD.items():
        f = os.path.join(ROOT, rel)
        n = open(f).read().count(call) if os.path.exists(f) else 0
        if n < need:
            problems.append(f"{rel}: {n} call(s) to {call[:-1]}, needs {need}")
    return problems


def login_guard_problems():
    problems = []
    policy = os.path.join(ROOT, "src/lib/login-policy.ts")
    if not os.path.exists(policy) or 'COMPANY_EMAIL_DOMAIN = "tertiaryinfotech.com"' not in open(policy).read():
        problems.append("src/lib/login-policy.ts must keep COMPANY_EMAIL_DOMAIN = \"tertiaryinfotech.com\"")
    for rel, need in LOGIN_GUARD.items():
        f = os.path.join(ROOT, rel)
        n = len(re.findall(r"isLoginEmailAllowed\(", open(f).read())) if os.path.exists(f) else 0
        if n < need:
            problems.append(f"{rel}: {n} call(s) to isLoginEmailAllowed, needs {need}")
    return problems


def post_edit(path):
    rel = os.path.relpath(os.path.abspath(path), ROOT) if path else ""
    if rel in ROLE_GUARD or rel == "src/lib/role-policy.ts":
        bad = role_guard_problems()
        if bad:
            print("HRMS guard: ROLE GUARDRAIL broken. Elevated roles (ADMIN/HR/MANAGER/ACCOUNTANT/TRAINER_ADMIN) only for the "
                  "people in src/lib/role-policy.ts, everyone else STAFF or INTERN:\n  " + "\n  ".join(bad), file=sys.stderr)
            sys.exit(2)
        code, out = run("npx vitest run src/lib/__tests__/role-policy.test.ts", timeout=300)
        if code != 0:
            print("HRMS guard: role-policy tests FAILED:\n" + out[-2500:], file=sys.stderr)
            sys.exit(2)
    if rel in LOGIN_GUARD or rel == "src/lib/login-policy.ts":
        bad = login_guard_problems()
        if bad:
            print("HRMS guard: LOGIN GUARDRAIL broken. Staff sign in only with @tertiaryinfotech.com (personal email only "
                  "for part-time staff and interns), on every sign-in path:\n  " + "\n  ".join(bad), file=sys.stderr)
            sys.exit(2)
        code, out = run("npx vitest run src/lib/__tests__/login-policy.test.ts", timeout=300)
        if code != 0:
            print("HRMS guard: login-policy tests FAILED:\n" + out[-2500:], file=sys.stderr)
            sys.exit(2)
    if rel == "prisma/schema.prisma":
        code, out = run("npx prisma validate", timeout=120)
        if code != 0:
            print("HRMS guard: prisma/schema.prisma is invalid:\n" + out[-2000:], file=sys.stderr)
            sys.exit(2)
        print("HRMS guard: schema edited. Keep it ADDITIVE (new tables / nullable columns / new enum values); "
              "`npm run db:push` targets PRODUCTION and is previewed by this guard.", file=sys.stderr)
        return
    if not BUSINESS.match(rel):
        return
    code, out = run(f"npx vitest related --run {json.dumps(rel)}", timeout=600)
    if code != 0 and "No test files found" not in out:
        print(f"HRMS guard: business-logic tests related to {rel} FAILED — fix before continuing:\n" + out[-3500:], file=sys.stderr)
        sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    event = data.get("hook_event_name", "")
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}
    if event == "PreToolUse" and tool == "Bash":
        pre_bash(inp.get("command", ""))
    elif event == "PostToolUse" and tool in ("Edit", "Write", "MultiEdit"):
        post_edit(inp.get("file_path", ""))


if __name__ == "__main__":
    main()
