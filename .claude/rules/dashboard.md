# Dashboard rules (admin view)

Follow the user-level skill `admin-dashboard` (~/.claude/skills/admin-dashboard/SKILL.md): neat, KPI-first, interactive.
- `/dashboard` (admin view) = 8 clickable KPI tiles (`admin-kpis.tsx`) + "Needs attention" grouped by alert
  category (`needs-attention.tsx`) + ONE chart (`leave-trend-chart.tsx`). Never list individual findings there.
- Detail lives on `/dashboard/insights` (`#alerts`, `#approvals`, `#leave`, `#interns`, `?cat=<category>`).
- Tiles and chart use the same `getMonthlyLeaveSeries()` numbers. Chart palette is validated (dataviz skill).
- Staff/intern views keep the simple `StatsCards`.
