"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Eye, ChevronDown, Check, ShieldCheck, Calculator, User, GraduationCap } from "lucide-react";

const ALL_ROLES = [
  { value: "admin",      label: "Admin",      icon: ShieldCheck },
  { value: "accountant", label: "Accountant", icon: Calculator },
  { value: "staff",      label: "Staff",      icon: User },
  { value: "intern",     label: "Intern",     icon: GraduationCap },
] as const;

interface ViewToggleProps {
  userRoles?: string[];
}

export function ViewToggle({ userRoles = [] }: ViewToggleProps) {
  const router = useRouter();
  // Filter to only roles the user has been assigned
  const assignedLower = userRoles.map((r) => r.toLowerCase());
  const ROLES = ALL_ROLES.filter((r) => assignedLower.includes(r.value));
  const [currentView, setCurrentView] = useState("");

  useEffect(() => {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith("viewAs="));
    const saved = cookie ? cookie.split("=")[1] : "";
    if (saved && assignedLower.includes(saved)) {
      setCurrentView(saved);
    } else if (ROLES.length > 0) {
      // Saved cookie is for a role the user no longer has — reset it
      const defaultView = ROLES[0].value;
      document.cookie = `viewAs=${defaultView};path=/;max-age=${60 * 60 * 24 * 365}`;
      setCurrentView(defaultView);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRoles.join(",")]);

  const handleSelect = (view: string) => {
    document.cookie = `viewAs=${view};path=/;max-age=${60 * 60 * 24 * 365}`;
    setCurrentView(view);
    router.refresh();
  };

  if (ROLES.length === 0) return null;

  const current = ROLES.find((r) => r.value === currentView) ?? ROLES[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white h-8 px-2.5"
        >
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs hidden sm:inline text-gray-400">View As:</span>
          <CurrentIcon className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{current.label}</span>
          <ChevronDown className="h-3 w-3 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-gray-400 uppercase tracking-wide">
          Switch Role View
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => handleSelect(value)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon className="h-4 w-4 text-gray-400" />
            <span className="flex-1">{label}</span>
            {currentView === value && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
