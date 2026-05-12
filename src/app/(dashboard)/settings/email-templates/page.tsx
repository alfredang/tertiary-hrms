import Link from "next/link";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email-templates/defaults";
import { prisma } from "@/lib/prisma";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesIndex() {
  const rows = await prisma.emailTemplate.findMany({
    select: { key: true, updatedAt: true },
  });
  const customized = new Set(rows.map((r) => r.key));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Email Templates</h2>
        <p className="text-sm text-gray-400 mt-1">
          Customise the emails sent by the HR Portal. Pick a template on the left to edit its subject and body.
        </p>
      </div>

      <div className="grid gap-2">
        {TEMPLATE_KEYS.map((k) => {
          const t = TEMPLATES[k];
          const href = `/settings/email-templates/${k.toLowerCase().replace(/_/g, "-")}`;
          const isCustom = customized.has(k);
          return (
            <Link
              key={k}
              href={href}
              className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 transition-colors"
            >
              <Mail className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{t.label}</p>
                <p className="text-sm text-gray-400 truncate">{t.description}</p>
              </div>
              <span
                className={
                  isCustom
                    ? "shrink-0 text-xs px-2 py-1 rounded bg-amber-950/50 border border-amber-800 text-amber-300"
                    : "shrink-0 text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-400"
                }
              >
                {isCustom ? "Customised" : "Default"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
