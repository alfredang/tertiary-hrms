"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder";
import type { Gender } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LogOut, RefreshCw, User } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { NotificationBell } from "./notification-bell";
import { useViewModeOptional } from "./view-mode-context";

interface HeaderProps {
  isAdmin?: boolean;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  avatarUrl?: string | null;
  gender?: Gender | null;
  currentView?: string;
  companyShortName?: string;
  companyLogo?: string | null;
}

export function Header({ isAdmin = false, fallbackName, fallbackEmail, avatarUrl, gender, currentView, companyShortName, companyLogo }: HeaderProps) {
  const { data: session } = useSession();
  const displayName = session?.user?.name || fallbackName || "User";
  const displayEmail = session?.user?.email || fallbackEmail || "";
  const router = useRouter();
  // Prefer client context (instant updates on view-toggle) — fall back to
  // the server-rendered currentView prop on routes that don't mount the
  // ViewModeProvider.
  const ctx = useViewModeOptional();
  const viewAs = ctx?.viewMode ?? currentView ?? "admin";

  const [isRefreshing, setIsRefreshing] = useState(false);

  const showAdminFeatures = isAdmin && viewAs === "admin";

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleSignOut = async () => {
    // Clear Google Auth plugin session (shows account picker on next sign-in)
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        await GoogleAuth.signOut();
      }
    } catch {
      // Not on native or plugin not available — ignore
    }
    // POST to signout endpoint directly with redirect: "manual" to avoid
    // NextAuth redirecting to AUTH_URL (localhost), which opens external browser
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/login" }),
        redirect: "manual",
      });
    } catch {
      // Ignore errors — cookie is cleared server-side regardless
    }
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-800 bg-gray-950 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex items-center gap-x-3">
          <MobileSidebar fallbackName={fallbackName} fallbackEmail={fallbackEmail} companyShortName={companyShortName} companyLogo={companyLogo} />
        </div>

        <div className="flex flex-1 items-center justify-end gap-x-4 lg:gap-x-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-8 w-8 text-gray-400 hover:text-white"
            title="Refresh data"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          {isAdmin && <ViewToggle userRoles={session?.user?.roles ?? [session?.user?.role ?? "ADMIN"]} />}
          <NotificationBell viewAs={viewAs} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <Avatar className="h-8 w-8">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback className="bg-transparent p-0">
                    <AvatarPlaceholder gender={gender} />
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-gray-300">
                  {displayName || displayEmail}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1 min-w-0">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="mr-2 h-4 w-4" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
