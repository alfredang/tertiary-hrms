import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const viewMode = await getViewMode();

  const role = isDevAuthSkipped() ? "ADMIN" : session?.user?.role || "STAFF";
  if (role !== "ADMIN" || viewMode === "staff") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Manage company information, integrations, email templates, and webhooks
        </p>
      </div>
      {children}
    </div>
  );
}
