import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { UserNav } from "@/components/layout/user-nav";
import { ChatWidget } from "@/components/chat/chat-widget";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar - desktop only */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white">
          <Sidebar />
          <UserNav />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        <Header />
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
