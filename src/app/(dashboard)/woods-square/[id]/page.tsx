import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarRange, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { Card } from "@/components/ui/card";
import { InviteStatusPill } from "@/components/staff/invite-status-pill";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default async function StaffInvitesPage({ params }: { params: { id: string } }) {
  let role = "STAFF";
  if (isDevAuthSkipped()) {
    role = "ADMIN";
  } else {
    const session = await auth();
    if (!session?.user) redirect("/login");
    role = session.user.role;
  }
  if (!hasAdminAccess(role) || (await getViewMode()) !== "admin") redirect("/dashboard");

  const employee = await prisma.employee.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, employeeId: true },
  });
  if (!employee) notFound();

  const invites = await prisma.habitapInviteLog.findMany({
    where: { OR: [{ employeeId: employee.id }, { email: employee.email }] },
    orderBy: { createdAt: "desc" },
  });

  const sentCount = invites.filter((i) => i.status === "SENT").length;
  const failedCount = invites.filter((i) => i.status === "FAILED").length;
  const latest = invites.find((i) => i.status === "SENT");

  const stats = [
    { label: "Invites sent", value: String(sentCount), tone: "indigo" as const },
    { label: "Failed", value: String(failedCount), tone: failedCount > 0 ? ("red" as const) : ("gray" as const) },
    {
      label: "Latest access window",
      value: latest ? `${latest.fromDate} – ${latest.toDate}` : "—",
      tone: "gray" as const,
    },
  ];

  const toneClass = {
    indigo: "text-indigo-400",
    red: "text-red-400",
    gray: "text-white",
  };

  return (
    <div className="space-y-6">
      <Link
        href="/woods-square"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Woods Square Invite
      </Link>

      {/* Hero */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-indigo-600/5 border border-indigo-500/20 flex items-center justify-center text-indigo-300 text-xl font-bold shrink-0">
          {initials(employee.name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{employee.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5 truncate">
            {employee.email} · {employee.employeeId}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-gray-950 border-gray-800 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className={`mt-1 text-lg font-bold ${toneClass[s.tone]}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Invite history */}
      <Card className="bg-gray-950 border-gray-800 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <CalendarRange className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Invite history</h2>
        </div>

        {invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-14 px-4">
            <div className="h-12 w-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">
              <Inbox className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-300">No invites yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              This staff member hasn&rsquo;t been sent a Woods Square invite. Send one from the{" "}
              <Link href="/woods-square" className="text-indigo-400 hover:underline">
                invite page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 bg-gray-900/40 border-b border-gray-800">
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Sent</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Access window</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Event</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fmt(inv.createdAt)}</td>
                    <td className="px-4 py-2.5 text-white whitespace-nowrap">
                      {inv.fromDate} – {inv.toDate}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {inv.eventId ? `#${inv.eventId}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <InviteStatusPill status={inv.status} title={inv.error ?? undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
