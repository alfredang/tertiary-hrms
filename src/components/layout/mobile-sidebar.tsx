"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { UserNav } from "./user-nav";

interface MobileSidebarProps {
  fallbackName?: string | null;
  fallbackEmail?: string | null;
}

export function MobileSidebar({ fallbackName, fallbackEmail }: MobileSidebarProps = {}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;

  // Close sidebar on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 bg-gray-950 border-gray-800">
        <div className="flex h-full flex-col overflow-y-auto">
          <Sidebar role={role} />
          <UserNav fallbackName={fallbackName} fallbackEmail={fallbackEmail} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
