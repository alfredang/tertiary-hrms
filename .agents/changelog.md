# Template Changelog

This file tracks improvements applied to the template by `/execution-report`. Each entry documents what was changed, what was deferred, and why.

Format: Newest entries at the top.

---

## V5.1.1 — Real-World Fixes (2026-03-01)

### Bug Fixes
- **Permission patterns**: Added `cd *` and 17 other dev tool commands to allow list — fixes compound command prompts
- **Plan location**: Added explicit instruction to /plan and /execute to write/read `.agents/plans/`, not built-in plan mode directory
- **Hooks**: Changed SessionStart hooks from `prompt` to `command` type — correct usage for context injection vs. safety gating. Documented known Claude Code bugs.

### Improvements
- **Plug-and-play**: Moved `template-version.json` into `.claude/`, removed `PIVLoopDiagram.png`. Root now only has files required by Claude Code.
- **Renamed `/setup-project` → `/setup`**: Added Step 0 (template initialization) — creates CLAUDE.md, .mcp.json, .gitignore entries, .agents/ from `.claude/templates/`. Existing project setup is now: copy `.claude/` → run `/setup` → done.
- **README auto-update**: `/setup` and `/create-prd` now generate project-specific README.md
- **New skill: /toggle-visibility**: Manage .gitignore with presets (work, private, stealth, open) or per-file toggling. 20 → 21 skills.
- **Quick Install guide**: README now documents how to add the template to an existing project

### Reference Docs Updated
- `subagents-and-hooks-guide.md` — added `agent` and `http` hook types, known limitations section
- `skills-and-workflow-guide.md` — updated directory tree, skill count

---

## V5.1.0 — 2026-03-01

**Trigger**: Audit against official Claude Code docs (code.claude.com)

**Changes Applied**:
- All 19 skills: removed redundant `user-invokable: true` from frontmatter (default is true)
- 4 subagents: fixed stale skill name cross-references (V4.5 names → V5 names)
- 5 skills: added `!`command`` dynamic context injection (review, commit, help, update-progress, execution-report)
- test-planner: added `memory: project` for cross-session learning
- help skill: added built-in `/simplify` and `/batch` reference, MCP/plugin awareness
- README: expanded MCP section with recommended servers table, added Plugins section
- CLAUDE.md: updated MCP stub to reference plugins
- plan + create-prd: added contextual MCP server recommendations (checks stack, suggests relevant servers, offers to install)
- NEW skill: `/create-skill` — meta-skill that creates new skills (auto-detects repeated patterns or manual invoke)
- Folder renamed from `AI-Coding-Template-V5/` to `AI-Coding-Template-V5.1/` to match version
- Extracted critical README content into 4 reference docs in `.claude/reference/`:
  - `skills-and-workflow-guide.md` — skills overview, workflow patterns, directory structure, V4.5 upgrade
  - `subagents-and-hooks-guide.md` — subagents, hooks, hook configuration examples
  - `context-architecture.md` — layered context system documentation
  - `mcp-and-plugins-guide.md` — MCP servers, plugins, reference docs inventory
- Updated skill references from "see README" to point to reference docs (plan, create-prd, help)
- Removed hardcoded "V5" version labels from skills and README
- plan + create-prd: added contextual subagent & hook recommendations (checks project type, suggests relevant automation, offers to configure)
- setup: added step 7 — MCP, subagent & hook recommendations after scaffolding
- describe-project: added lightweight MCP/subagent/hook suggestions before handoff to /create-prd

**Deferred to V5.2**:
- `context: fork` for heavy skills (review, execution-report, test) — needs per-skill testing
- `allowed-tools` restrictions for discovery skills — needs per-skill testing
- Supporting files extraction (inline templates → separate .md files)
- Positional `$ARGUMENTS[N]` / `$N` syntax — low impact

**Rationale**: Official docs revealed features V5 wasn't using (dynamic injection, memory), bugs in subagent cross-references, and zero MCP/plugin ecosystem guidance.

<!-- Entries will be appended here by /execution-report -->
