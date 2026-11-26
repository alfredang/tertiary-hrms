import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { generateBaseSalaryPayslips, MONTHS } from "@/lib/payroll-month-end";

// "Auto-Generate" on /payroll/generate: base-salary payslips for the month, with the
// same rule as the month-end run (src/lib/payroll-month-end.ts): if the month's CPF
// statement was uploaded, only interns are generated (staff come from the statement);
// otherwise everyone without a payslip. Interns have CPF 0. Never overwrites.
export async function POST(req: NextRequest) {
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const role = session.user.role;
      if (role !== "ADMIN" && role !== "HR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

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
