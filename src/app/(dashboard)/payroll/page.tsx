import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollList } from "@/components/payroll/payroll-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen } from "lucide-react";
import { buildFolderWebUrl, getEmployeeSubfolderId } from "@/lib/drive";
import { hasAdminAccess } from "@/lib/utils";
import { isDevAuthSkipped } from "@/lib/dev-auth";

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

  let payrollFolderUrl: string | null = null;
  if (!isFinanceView && currentEmployeeId) {
    try {
      const folderId = await getEmployeeSubfolderId(currentEmployeeId, "Payroll");
      if (folderId) payrollFolderUrl = buildFolderWebUrl(folderId);
    } catch (err) {
      console.error("Failed to resolve Payroll folder:", err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Payroll</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {isFinanceView ? "Manage all employee payroll" : "Manage salary payments"}
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
        {!isFinanceView && payrollFolderUrl && (
          <a
            href={payrollFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button variant="outline" className="w-full sm:w-auto">
              <FolderOpen className="h-4 w-4 mr-2" />
              My Payroll Folder
            </Button>
          </a>
        )}
      </div>

      <PayrollList payslips={payslips} isHR={isFinanceView} />
    </div>
  );
}
