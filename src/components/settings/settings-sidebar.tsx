"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Building2, KeyRound, Mail, Webhook, ChevronDown, ChevronRight } from "lucide-react";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email-templates/defaults";

const TOP_LINKS = [
  { href: "/settings/company", label: "Company Info", icon: Building2 },
  { href: "/settings/credentials", label: "Credentials", icon: KeyRound },
];

const BOTTOM_LINKS = [
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const templatesActive = pathname.startsWith("/settings/email-templates");
  const [templatesOpen, setTemplatesOpen] = useState(templatesActive);

  return (
    <nav className="bg-gray-900 border border-gray-800 rounded-xl p-2 space-y-1 h-fit sticky top-4">
      {TOP_LINKS.map((l) => (
        <NavLink key={l.href} href={l.href} label={l.label} icon={l.icon} active={pathname === l.href} />
      ))}

      <button
        type="button"
        onClick={() => setTemplatesOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          templatesActive ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white",
        )}
      >
        <Mail className="h-4 w-4" />
        <span className="flex-1 text-left">Email Templates</span>
        {templatesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {templatesOpen && (
        <ul className="ml-3 pl-3 border-l border-gray-800 space-y-1">
          {TEMPLATE_KEYS.map((k) => {
            const href = `/settings/email-templates/${k.toLowerCase().replace(/_/g, "-")}`;
            const active = pathname === href;
            return (
              <li key={k}>
                <Link
                  href={href}
                  className={cn(
                    "block px-3 py-1.5 rounded-md text-sm transition-colors",
                    active ? "bg-primary text-white" : "text-gray-400 hover:bg-gray-800 hover:text-gray-100",
                  )}
                >
                  {TEMPLATES[k].label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {BOTTOM_LINKS.map((l) => (
        <NavLink key={l.href} href={l.href} label={l.label} icon={l.icon} active={pathname === l.href} />
      ))}
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active ? "bg-primary text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
