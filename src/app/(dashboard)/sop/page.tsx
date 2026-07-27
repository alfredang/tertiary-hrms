import Link from "next/link";
import { BookOpen, ChevronRight, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SOPS } from "@/lib/sop-data";

export const dynamic = "force-dynamic";

// Standard Operating Procedures index — visible to ALL authenticated
// users (staff and interns alike); middleware only requires login.
export default function SopIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Standard Operating Procedures</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-400">
          Step-by-step guides for company processes. Follow each SOP exactly — if anything is
          unclear, check with your supervisor before proceeding.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SOPS.map((sop) => (
          <Link key={sop.slug} href={`/sop/${sop.slug}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <span className="rounded-full border border-gray-700 px-2.5 py-0.5 text-xs text-gray-400">
                    {sop.category}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white group-hover:text-primary transition-colors">
                  {sop.title}
                </h2>
                <p className="mt-1.5 text-sm text-gray-400 line-clamp-3">{sop.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5" />
                    {sop.steps.length} steps
                  </span>
                  <span className="flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    View SOP <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
