import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { LeaveDetailView } from "@/components/leave/leave-detail-view";

export const dynamic = "force-dynamic";

export default async function LeaveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
    const session = await auth();
    if (!session?.user) redirect("/login");
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          department: { select: { name: true } },
        },
      },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { name: true } },
    },
  });

  if (!request) notFound();

  const isAdmin = ["ADMIN", "MANAGER", "HR"].includes(role);
  const isOwner = request.employeeId === currentEmployeeId;
  if (!isAdmin && !isOwner) redirect("/leave/annual");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leave Request</h1>
        <p className="text-gray-400 text-sm mt-1">
          {isAdmin ? `Review leave request from ${request.employee.name}` : "Your leave request details"}
        </p>
      </div>
      <LeaveDetailView request={request as any} isAdmin={isAdmin} />
    </div>
  );
}
