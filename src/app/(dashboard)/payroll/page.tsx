import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollList } from "@/components/payroll/payroll-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { hasAdminAccess } from "@/lib/utils";
import { isInternEmployee } from "@/lib/leave-policy";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import {
  canViewCpfSubmissions,
  cpfDownloadPath,
  cpfFileForPayslip,
  listCpfSubmissionFiles,
} from "@/lib/cpf-submission-files";

export const dynamic = 'force-dynamic';

async function getPayslips(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const payslips = await prisma.payslip.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ payPeriodStart: "desc" }, { employee: { name: "asc" } }],
  });

  return payslips;
}

export default async function PayrollPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let roles: string[] = [];
  let currentEmployeeId: string | undefined;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentEmployeeId = adminUser?.employee?.id;
  } else {
    if (!session?.user) {
      return null;
    }
    role = session.user.role;
    roles = session.user.roles ?? [];
    currentEmployeeId = session.user.employeeId;
  }

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";
  // Accountant has full finance access — same data scope as admin
  const isFinanceView = viewAs === "admin" || viewAs === "accountant";

  const filterByEmployeeId = !isFinanceView ? currentEmployeeId : undefined;

  if (!isFinanceView && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Payroll</h1>
        <p className="text-sm sm:text-base text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const payslips = await getPayslips(filterByEmployeeId);

  // An intern's own payslips: flat allowance, no CPF, MC / No Pay Leave and paybacks shown instead.
  let internViewer = false;
  if (!isFinanceView && currentEmployeeId) {
    const me = await prisma.employee.findUnique({
      where: { id: currentEmployeeId },
      select: { employmentType: true },
    });
    internViewer = isInternEmployee({ employmentType: me?.employmentType, roles });
  }

  // Finance view: each payslip links to the CPF statement it was generated from.
  // Never in the staff view — the statement lists everyone's NRIC and wages.
  const cpfLinks: Record<string, { path: string; name: string }> = {};
  if (isFinanceView && (isDevAuthSkipped() || canViewCpfSubmissions(role, roles))) {
    try {
      const files = await listCpfSubmissionFiles();
      for (const p of payslips) {
        const f = cpfFileForPayslip(p, files);
        if (f) cpfLinks[p.id] = { path: cpfDownloadPath(f.id), name: f.name };
      }
    } catch (err) {
      console.error("CPF statement lookup for payroll failed:", err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Payroll</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {isFinanceView
              ? "Manage all employee payroll"
              : internViewer
                ? "Your monthly allowance payslips. Interns have no CPF."
                : "Your payslips"}
          </p>
        </div>
        {isFinanceView && (
          <Link href="/payroll/generate" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Process Payroll
            </Button>
          </Link>
        )}
      </div>

      <PayrollList payslips={payslips} isHR={isFinanceView} cpfLinks={cpfLinks} intern={internViewer} />
    </div>
  );
}
