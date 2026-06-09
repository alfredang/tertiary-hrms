import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { WoodsSquareInvite } from "@/components/staff/woods-square-invite";

export const dynamic = "force-dynamic";

export default async function WoodsSquarePage() {
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

  const staff = await prisma.employee.findMany({
    select: { id: true, name: true, email: true, employeeId: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Woods Square Invite</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Send Woods Square building-access invites to staff — each selected person receives their
          entry PIN by email.
        </p>
      </div>
      <WoodsSquareInvite staff={staff} />
    </div>
  );
}
