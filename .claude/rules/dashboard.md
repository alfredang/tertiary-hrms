# Dashboard rules (admin view)

Follow the user-level skill `admin-dashboard` (~/.claude/skills/admin-dashboard/SKILL.md): neat, KPI-first, interactive.
- `/dashboard` (admin view) = 3 clickable KPI tiles: full-time staff, interns, pending approvals (Alfred, 20 Nov 2026) (`admin-kpis.tsx`) + "Needs attention" grouped by alert
  category (`needs-attention.tsx`) + ONE chart (`leave-trend-chart.tsx`). Never list individual findings there.
- Detail lives on `/dashboard/insights` (`#alerts`, `#approvals`, `#leave`, `#interns`, `?cat=<category>`).
- Tiles and chart use the same `getMonthlyLeaveSeries()` numbers. Chart palette is validated (dataviz skill).
- Staff/intern views keep the simple `StatsCards`.
- `/dashboard/analytics` (`analytics-dashboard.tsx`, loader `src/lib/analytics.ts`, shared `bar-chart.tsx`): 12 months of
  bank revenue / expenses, leave and MC per person, headcount. One filter row drives every chart and tile. Same three
  colour slots, validated on the light and dark cards. Admin gate as `/accounting`. Add new long-range charts here, not
  on `/dashboard`.
