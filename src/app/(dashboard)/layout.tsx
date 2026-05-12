import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { ViewModeProvider } from "@/components/layout/view-mode-context";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve session + view mode + company settings in parallel — they're all
  // independent. Total wall time = max(query time), not sum.
  const [session, currentView, companySettings] = await Promise.all([
    auth(),
    getViewMode(),
    prisma.companySettings.findUnique({
      where: { id: "company_settings" },
      select: { shortName: true, name: true, logo: true },
    }),
  ]);

  const role = isDevAuthSkipped() ? "ADMIN" : session?.user?.role;
  const isAdmin = hasAdminAccess(role);
  const companyShortName = companySettings?.shortName || companySettings?.name || "HR Portal";
  const companyLogo = companySettings?.logo || null;

  // User-record lookup depends on session, so it runs after the parallel batch.
  let userName = session?.user?.name;
  let userEmail = session?.user?.email;
  let userAvatarUrl: string | null = null;
  let userGender: "MALE" | "FEMALE" | "OTHER" | null = null;
  const lookupEmail = userEmail || (isDevAuthSkipped() ? "admin@tertiaryinfotech.com" : null);
  if (lookupEmail) {
    const u = await prisma.user.findUnique({
      where: { email: lookupEmail },
      include: { employee: { select: { name: true, avatarUrl: true, gender: true } } },
    });
    if (!userName) userName = u?.employee?.name || (isDevAuthSkipped() ? "Admin" : userName);
    if (!userEmail) userEmail = u?.email ?? undefined;
    userAvatarUrl = u?.employee?.avatarUrl ?? null;
    userGender = u?.employee?.gender ?? null;
  }

  return (
    <ViewModeProvider initial={currentView}>
      <div className="min-h-screen bg-gray-900">
        {/* Sidebar - desktop only */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-[width] duration-200 lg:w-[var(--sidebar-w,18rem)]">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-800 bg-gray-950">
            <Sidebar role={role} companyShortName={companyShortName} companyLogo={companyLogo} />
          </div>
        </div>

        {/* Main content */}
        <div className="transition-[padding] duration-200 lg:pl-[var(--sidebar-w,18rem)]">
          <Header isAdmin={isAdmin} fallbackName={userName} fallbackEmail={userEmail} avatarUrl={userAvatarUrl} gender={userGender} currentView={currentView} companyShortName={companyShortName} companyLogo={companyLogo} />
          <PullToRefresh>
            <main className="py-6 px-4 pb-20 sm:px-6 lg:px-8 lg:pb-6">
              {children}
            </main>
          </PullToRefresh>
        </div>

        {/* Mobile bottom navigation */}
        <MobileBottomNav />
      </div>
    </ViewModeProvider>
  );
}
