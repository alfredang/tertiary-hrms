import { NextRequest, NextResponse } from "next/server";
import { cronAuthError } from "@/lib/admin-alerts";
import { withCronRun } from "@/lib/cron-runs";
import { generateBaseSalaryPayslips, monthEndTarget } from "@/lib/payroll-month-end";

export const dynamic = "force-dynamic";

// Month-end payroll (Alfred, 26 Nov 2026; src/lib/payroll-month-end.ts). The daily 08:30 SGT
// roll-up already runs it on the 1st–3rd; this route is for a manual or extra trigger.
// Pays the month just ended (or ?month=&year=) from base salary where no CPF statement was
// uploaded, interns always with CPF 0. Never overwrites a payslip.
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const authErr = cronAuthError(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const params = new URL(req.url).searchParams;
  const month = Number(params.get("month"));
  const year = Number(params.get("year"));
  const target =
    month >= 1 && month <= 12 && year >= 2000
      ? { month, year }
      : monthEndTarget() ?? (() => {
          // Outside the 1st–3rd: the previous month.
          const sg = new Date(Date.now() + 8 * 3600_000);
          const m = sg.getUTCMonth();
          return m === 0 ? { month: 12, year: sg.getUTCFullYear() - 1 } : { month: m, year: sg.getUTCFullYear() };
        })();

  try {
    const result = await withCronRun("monthly-payroll", async () => ({
      ...(await generateBaseSalaryPayslips({ ...target, email: true })),
    }));
    return NextResponse.json(result);
  } catch (err) {
    console.error("Cron payroll error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
