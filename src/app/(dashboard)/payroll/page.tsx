import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollList } from "@/components/payroll/payroll-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const dynamic = 'force-dynamic';

async function getPayrollStats() {
  const payslips = await prisma.payslip.findMany({
    where: {
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

async function getPayslips() {
  const payslips = await prisma.payslip.findMany({
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
  const [stats, payslips] = await Promise.all([getPayrollStats(), getPayslips()]);

  const isHR =
    session?.user?.role === "HR" || session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
          <p className="text-gray-500 mt-1">Manage salary payments</p>
        </div>
        {isHR && (
          <Link href="/payroll/generate">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process Payroll
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-500 text-white rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-100">Total Paid</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(stats.totalPaid)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-green-400/30">
              <DollarSign className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-amber-500 text-white rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-100">Pending Payments</p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(stats.pendingAmount)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-400/30">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </div>

      <PayrollList payslips={payslips} isHR={isHR} />
    </div>
  );
}
