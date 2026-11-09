#!/usr/bin/env python3
"""HRMS business-logic guard for Claude Code (project hooks, .claude/settings.json).

PreToolUse  Bash   - blocks destructive Prisma commands (the local DATABASE_URL is PRODUCTION):
                     migrate reset, --force-reset, --accept-data-loss; previews every `prisma db push`
                     and blocks it when the SQL diff drops/alters existing columns, tables or enum values.
                   - blocks `git add/commit` of PII paths (.trainers/, .bank_statements/, .env*, uploads/).
                   - before `git push`: tsc --noEmit + vitest must pass.
PostToolUse Edit/Write
                   - edits to business-logic files (leave, MC, NPL, attendance, payroll/CPF, accounting,
                     trainers, auth/roles) run the related vitest tests; failures are fed back to Claude.
                   - prisma/schema.prisma edits run `prisma validate` and print the additive-only rule.
Exit code 2 = block (PreToolUse) / report failure back to Claude (PostToolUse).
"""
import json, os, re, subprocess, sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BUSINESS = re.compile(
    r"^src/(lib/(utils|cpf-calculator|cpf-submission|leave[\w-]*|time-off[\w-]*|attendance[\w-]*|payroll[\w-]*|"
    r"parse-excel-statement|claude-parse-statement|trainer[\w-]*|trainers|auth|view-mode|qbo[\w-]*|quickbooks[\w-]*|"
    r"reconcil[\w-]*|compliance[\w-]*|validations/[\w-]+)\.tsx?|app/api/(leave|time-off|attendance|payroll|accounting|"
    r"trainers|agent|cron|employees|quickbooks)/.*\.ts)$"
)
PII_PATHS = re.compile(r"(^|\s|/)((\.trainers|\.bank_statements|uploads|env_backup)(/|\s|$)|\.env(\.\w+)?(\s|$))")
DESTRUCTIVE_SQL = re.compile(r"^\s*(DROP\s|ALTER\s+TABLE\s+\S+\s+(DROP|ALTER\s+COLUMN)|ALTER\s+TYPE\s+\S+\s+RENAME|TRUNCATE|DELETE\s)", re.I | re.M)


def run(cmd, timeout=600):
    p = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True, timeout=timeout)
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
        code, out = run('set -a; [ -f .env ] && . ./.env; set +a; npx prisma migrate diff --from-url "$DATABASE_URL" '
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
        code, out = run("npx tsc --noEmit", timeout=600)
        if code != 0:
            block("HRMS guard: blocked push — TypeScript errors:\n" + out[-3000:])
        code, out = run("npx vitest run", timeout=900)
        if code != 0:
            block("HRMS guard: blocked push — unit tests (leave/MC/NPL proration, CPF, payroll, attendance, trainers) failed:\n" + out[-3000:])


def post_edit(path):
    rel = os.path.relpath(os.path.abspath(path), ROOT) if path else ""
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
