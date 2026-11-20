import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { PaybackRequestForm } from "@/components/leave/payback-request-form";
import { getNplStatus } from "@/lib/leave-allowance";
import { getNplDays, holidayKeys } from "@/lib/npl-payback-store";
import { splitWorkWeek } from "@/lib/attendance-policy";

export const dynamic = "force-dynamic";

export default async function PaybackRequestPage({ searchParams }: { searchParams: Promise<{ npl?: string }> }) {
  let employeeId: string | undefined;
  if (isDevAuthSkipped()) {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    employeeId = adminUser?.employee?.id;
  } else {
    const session = await auth();
    employeeId = session?.user?.employeeId;
  }
  if (!employeeId) redirect("/leave/payback");

  const year = new Date().getFullYear();
  const [{ npl: initialDate }, employee, nplDays, npl, holidays] = await Promise.all([
    searchParams,
    prisma.employee.findUnique({ where: { id: employeeId }, select: { workdays: true } }),
    getNplDays(employeeId, year),
    getNplStatus(employeeId),
    holidayKeys([year]),
  ]);
  const workdays = employee?.workdays?.length ? employee.workdays : [1, 2, 3, 4, 5];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Payback</h1>
        <p className="text-gray-400 mt-1 allow-wrap">
          Choose the No Pay Leave day and the off day you worked instead. It is sent to your manager for approval.
        </p>
      </div>
      <PaybackRequestForm
        days={nplDays.filter((d) => d.outstanding > 0).map((d) => ({ date: d.date, outstanding: d.outstanding, reason: d.reason }))}
        workdays={workdays}
        holidays={Array.from(holidays)}
        offDayNames={splitWorkWeek(workdays).off}
        npl={{ remaining: npl.remaining, cap: npl.cap }}
        initialDate={initialDate}
      />
    </div>
  );
}
