import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { WoodsSquareAccessCard } from "@/components/profile/woods-square-access-card";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { getCurrentUser } from "@/lib/woods-square-auth";

export const dynamic = "force-dynamic";

export default async function WoodsSquareAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Woods Square Access</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Your employee profile has not been set up yet. Please contact HR.
        </p>
      </div>
    );
  }

  // Admins manage access from the Woods Square Invite page; in admin view this
  // staff-facing page isn't relevant, so send them there.
  const isAdminView =
    user.roles.some((r) => hasAdminAccess(r)) && (await getViewMode()) === "admin";
  if (isAdminView) redirect("/woods-square");

  const myInvites = await prisma.habitapInviteLog.findMany({
    where: {
      status: "SENT",
      OR: [{ employeeId: user.employee.id }, { email: user.employee.email }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, fromDate: true, toDate: true, createdAt: true, status: true },
  });

  const myRequests = await prisma.accessRequest.findMany({
    where: { employeeId: user.employee.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, fromDate: true, toDate: true, note: true, status: true, createdAt: true },
  });

  // Compute "today" once, server-side, in Singapore time (en-CA → yyyy-MM-dd) so the
  // card's date math matches between SSR and client hydration (no mismatch/flicker).
  const nowIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-white">Woods Square Access</h1>

      <WoodsSquareAccessCard
        holderName={user.employee.name}
        employeeId={user.employee.employeeId}
        nowIso={nowIso}
        invites={myInvites}
        requests={myRequests}
        onRoster={user.employee.woodsSquareInvite}
      />
    </div>
  );
}
