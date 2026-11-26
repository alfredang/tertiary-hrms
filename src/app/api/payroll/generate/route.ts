import { NextRequest, NextResponse } from "next/server";
import { requirePayEditor } from "@/lib/pay-edit-gate";
import { generateBaseSalaryPayslips, MONTHS } from "@/lib/payroll-month-end";

// "Auto-Generate" on /payroll/generate: base-salary payslips for the month, with the
// same rule as the month-end run (src/lib/payroll-month-end.ts): if the month's CPF
// statement was uploaded, only interns are generated (staff come from the statement);
// otherwise everyone without a payslip. Interns have CPF 0. Never overwrites.
export async function POST(req: NextRequest) {
  try {
    // Pay-edit guardrail: admins only (src/lib/pay-edit-policy.ts).
    const refused = await requirePayEditor();
    if (refused) return refused;

    const body = await req.json();
    const month = Number(body.month);
    const year = Number(body.year);
    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
      return NextResponse.json({ error: "Month and year are required" }, { status: 400 });
    }

    const run = await generateBaseSalaryPayslips({ month, year });
    const label = `${MONTHS[month - 1]} ${year}`;
    return NextResponse.json({
      message: run.cpfUploaded
        ? `${label}: the CPF statement was uploaded, so staff payslips come from it; interns were generated from base salary.`
        : `${label}: no CPF statement uploaded, so payslips were generated from base salary.`,
      created: run.created,
      skipped: run.skippedExisting + run.staffNotOnCpf.length + run.problems.length - run.errors,
      errors: run.errors,
      cpfUploaded: run.cpfUploaded,
      staffNotOnCpf: run.staffNotOnCpf,
      problems: run.problems,
    });
  } catch (error) {
    console.error("Error generating payroll:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
