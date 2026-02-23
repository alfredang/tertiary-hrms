"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getInitials } from "@/lib/utils";
import { LogOut, Settings, User } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { ViewToggle } from "@/components/dashboard/view-toggle";

const pageNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/employees": "Employees",
  "/leave": "Leave",
  "/expenses": "Expenses",
  "/payroll": "Payroll",
  "/calendar": "Calendar",
};

interface HeaderProps {
  isAdmin?: boolean;
}

export function Header({ isAdmin = false }: HeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [viewAs, setViewAs] = useState<string>("admin");

  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("viewAs="));
    if (cookie) {
      setViewAs(cookie.split("=")[1]);
    }
  }, []);

  // Listen for cookie changes (when ViewToggle is clicked, it calls router.refresh)
  useEffect(() => {
    const interval = setInterval(() => {
      const cookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("viewAs="));
      const val = cookie ? cookie.split("=")[1] : "admin";
      setViewAs(val);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const showAdminFeatures = isAdmin && viewAs === "admin";

  const currentPage = Object.entries(pageNames).find(([path]) =>
    pathname.startsWith(path)
  )?.[1] || "Dashboard";

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-800 bg-gray-950 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex items-center gap-x-3">
          <MobileSidebar />
          <h1 className={cn("text-lg font-semibold text-white", isAdmin && "hidden sm:block")}>{currentPage}</h1>
        </div>

        <div className="flex flex-1 items-center justify-end gap-x-4 lg:gap-x-6">
          {isAdmin && <ViewToggle />}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8 bg-primary">
                    <AvatarFallback className="bg-primary text-white text-sm">
                      {getInitials(session.user.name || session.user.email || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-gray-300">
                    {session.user.name || session.user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="text-xs text-muted-foreground">{session.user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                {showAdminFeatures && (
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
