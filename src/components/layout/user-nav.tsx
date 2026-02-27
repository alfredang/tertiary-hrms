"use client";

import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";

interface UserNavProps {
  fallbackName?: string | null;
  fallbackEmail?: string | null;
}

export function UserNav({ fallbackName, fallbackEmail }: UserNavProps = {}) {
  const { data: session } = useSession();
  const displayName = session?.user?.name || fallbackName || "User";
  const displayEmail = session?.user?.email || fallbackEmail || "";

  return (
    <div className="border-t border-gray-800 p-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-800 transition-colors">
            <Avatar className="h-10 w-10 bg-primary">
              <AvatarFallback className="bg-primary text-white">
                {getInitials(displayName || displayEmail || "U")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {displayName}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {displayEmail}
              </p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
