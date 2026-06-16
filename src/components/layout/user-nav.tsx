"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import type { Gender } from "@prisma/client";

interface UserNavProps {
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  avatarUrl?: string | null;
  gender?: Gender | null;
}

export function UserNav({ fallbackName, fallbackEmail, avatarUrl, gender }: UserNavProps = {}) {
  const { data: session } = useSession();
  const displayName = session?.user?.name || fallbackName || "User";
  const displayEmail = session?.user?.email || fallbackEmail || "";

  return (
    <div className="border-t border-gray-800 p-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-800 transition-colors">
            <Avatar className="h-10 w-10">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-transparent p-0">
                <AvatarPlaceholder gender={gender} />
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
            onClick={async () => {
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
                // Ignore — cookie cleared server-side regardless
              }
              window.location.href = "/login";
            }}
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
