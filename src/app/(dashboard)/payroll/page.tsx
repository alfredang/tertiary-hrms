import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollList } from "@/components/payroll/payroll-list";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const dynamic = 'force-dynamic';

async function getPayrollStats(employeeId?: string) {
  const baseWhere = employeeId ? { employeeId } : {};

  const payslips = await prisma.payslip.findMany({
    where: {
      ...baseWhere,
      status: "PAID",
    },
    select: {
      netSalary: true,
    },
  });

  const totalPaid = payslips.reduce(
    (sum, p) => sum + Number(p.netSalary),
    0
  );

  const pendingPayslips = await prisma.payslip.findMany({
    where: {
      ...baseWhere,
      status: { in: ["DRAFT", "GENERATED"] },
    },
    select: {
      netSalary: true,
    },
  });

  const pendingAmount = pendingPayslips.reduce(
    (sum, p) => sum + Number(p.netSalary),
    0
  );

  return { totalPaid, pendingAmount };
}

async function getPayslips(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const payslips = await prisma.payslip.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ payPeriodStart: "desc" }, { employee: { firstName: "asc" } }],
  });

  return payslips;
}

export default async function PayrollPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let currentEmployeeId: string | undefined;

  if (process.env.SKIP_AUTH === "true") {
    role = "ADMIN";
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
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

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: show all payslips; Staff view: show only own
  const filterByEmployeeId = viewAs === "staff" ? currentEmployeeId : undefined;

  // Safety: prevent data leak if staff view but no employeeId
  if (viewAs === "staff" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-white">Payroll</h1>
        <p className="text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const [stats, payslips] = await Promise.all([
    getPayrollStats(filterByEmployeeId),
    getPayslips(filterByEmployeeId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Payroll</h1>
          <p className="text-gray-400 mt-1">
            {viewAs === "admin" ? "Manage all employee payroll" : "Manage salary payments"}
          </p>
        </div>
        {viewAs === "admin" && (
          <Link href="/payroll/generate">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process Payroll
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards - admin view only */}
      {viewAs === "admin" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-950 border border-green-800 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Paid</p>
                <p className="text-3xl font-bold text-green-400 mt-1">
                  {formatCurrency(stats.totalPaid)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-green-950/50">
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </div>
          <div className="bg-gray-950 border border-amber-800 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Pending Payments</p>
                <p className="text-3xl font-bold text-amber-400 mt-1">
                  {formatCurrency(stats.pendingAmount)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-950/50">
                <TrendingUp className="h-8 w-8 text-amber-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      <PayrollList payslips={payslips} isHR={viewAs === "admin"} />
    </div>
  );
}
