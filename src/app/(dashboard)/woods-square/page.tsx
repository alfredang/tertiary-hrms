import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { getScheduleConfig } from "@/lib/woods-square-schedule";
import { WoodsSquareInvite } from "@/components/staff/woods-square-invite";

export const dynamic = "force-dynamic";

export default async function WoodsSquarePage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  let role = "STAFF";
  if (isDevAuthSkipped()) {
    role = "ADMIN";
  } else {
    const session = await auth();
    if (!session?.user) redirect("/login");
    role = session.user.role;
  }
  // Admin-only — and only in admin view (an admin previewing as staff/intern can't use it).
  if (!hasAdminAccess(role) || (await getViewMode()) !== "admin") redirect("/dashboard");

  // The invite roster now lives on the employee record (managed in the Settings tab).
  // The picker shows only people flagged onto the list; everyone else stays hidden.
  const allStaff = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
      woodsSquareInvite: true,
      woodsSquareEmail: true,
    },
    orderBy: { name: "asc" },
  });
  const staff = allStaff
    .filter((e) => e.woodsSquareInvite)
    // The invite list is the source of truth for Woods Square: a person's email here is
    // their delivery override if set, otherwise their account email — so the Send picker,
    // overview and the actual send all show/use the SAME address the PIN goes to.
    .map((e) => ({
      id: e.id,
      name: e.name,
      email: e.woodsSquareEmail || e.email,
      employeeId: e.employeeId,
    }));

  // Every employee + their current on-list flag and delivery override, for the Settings tab.
  const manageStaff = allStaff.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    employeeId: e.employeeId,
    onList: e.woodsSquareInvite,
    deliveryEmail: e.woodsSquareEmail,
  }));

  const scheduleConfig = await getScheduleConfig();

  // Notifications deep-link here with ?tab=… so admins land on the right tab: a new
  // request → the queue (requests); a failed auto-invite → Settings (manage).
  const initialTab =
    searchParams.tab === "requests" || searchParams.tab === "manage" ? searchParams.tab : "send";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Woods Square Invite</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Send Woods Square building-access invites to staff — each selected person receives their
          entry PIN by email.
        </p>
      </div>
      <WoodsSquareInvite
        staff={staff}
        manageStaff={manageStaff}
        scheduleConfig={scheduleConfig}
        initialTab={initialTab}
      />
    </div>
  );
}
