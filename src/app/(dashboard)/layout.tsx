import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { UserNav } from "@/components/layout/user-nav";
import { ChatWidget } from "@/components/chat/chat-widget";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = isDevAuthSkipped() ? "ADMIN" : session?.user?.role;
  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Sidebar - desktop only */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-800 bg-gray-950">
          <Sidebar role={role} />
          <UserNav />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        <Header isAdmin={isAdmin} />
        <main className="py-6 px-4 pb-20 sm:px-6 lg:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />

      {/* AI Chat Widget */}
      <ChatWidget />
    </div>
  );
}
