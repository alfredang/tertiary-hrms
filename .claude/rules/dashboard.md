# Dashboard rules (admin view)

Follow the user-level skill `admin-dashboard` (~/.claude/skills/admin-dashboard/SKILL.md): neat, KPI-first, interactive.
- `/dashboard` (admin view) = 3 clickable KPI tiles (plus the trainer row for TRAINER_ADMIN holders): full-time staff, interns, pending approvals (Alfred, 20 Nov 2026) (`admin-kpis.tsx`) + "Needs attention" grouped by alert
  category (`needs-attention.tsx`) + ONE chart (`leave-trend-chart.tsx`). Never list individual findings there.
- Detail lives on `/dashboard/insights` (`#alerts`, `#approvals`, `#leave`, `#interns`, `?cat=<category>`).
- Tiles and chart use the same `getMonthlyLeaveSeries()` numbers. Chart palette is validated (dataviz skill).
- KPIs follow the role (Alfred, 20 Nov 2026), branching in `dashboard/page.tsx`:
  - admin view: staff, interns, pending approvals (`admin-kpis.tsx`);
  - accountant view (admin switched to it, or a real ACCOUNTANT): pending expense claims, this month's bank income and
    expenses with the year to date (`FinanceKpiRow`, loader `getFinanceKpis()` in `src/lib/dashboard-kpis.ts`), finance
    quick actions. A real accountant also gets their own leave row;
  - staff / intern view: own Annual Leave left, Medical Leave left, No Pay Leave taken of 14 (`StatsCards`; interns
    have no paid MC), plus Off In Lieu when there is any;
  - TRAINER_ADMIN holders: a second row of trainers, ACLP, non-ACLP (`TrainerKpiRow`, same counting as `/trainers`),
    under their own row in the admin, staff and intern views. Not in the accountant view (finance only).
  - Every tile row uses `kpi-tiles.tsx`; add a role's row there, not a new tile style.
- `/dashboard/analytics` (`analytics-dashboard.tsx`, loader `src/lib/analytics.ts`, shared `bar-chart.tsx`): 12 months of
  bank revenue / expenses, leave and MC per person, headcount. One filter row drives every chart and tile. Same three
  colour slots, validated on the light and dark cards. Admin gate as `/accounting`. Add new long-range charts here, not
  on `/dashboard`.
- Below that row: `workforce-breakdown.tsx` (gender / age group / ethnic group donuts, Staff default; Alfred, 20 Nov 2026).
  Helpers in `src/lib/demographics.ts`, loader `src/lib/workforce-breakdown.ts`. `Employee.ethnicGroup` is optional text.
