import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Flag,
  Link2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSop } from "@/lib/sop-data";

export const dynamic = "force-dynamic";

// SOP detail — a visual process view: a horizontal flow overview of all
// steps, then a numbered vertical timeline with the full instructions.
// Open to all authenticated users (staff and interns).
export default function SopDetailPage({ params }: { params: { slug: string } }) {
  const sop = getSop(params.slug);
  if (!sop) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/sop"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All SOPs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{sop.title}</h1>
          <span className="rounded-full border border-gray-700 px-2.5 py-0.5 text-xs text-gray-400">
            {sop.category}
          </span>
        </div>
        <p className="mt-2 text-sm sm:text-base text-gray-400">{sop.description}</p>
        <p className="mt-1 text-xs text-gray-500">Last updated: {sop.updated}</p>
      </div>

      {/* When this SOP applies */}
      {sop.triggers && sop.triggers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" /> When to use this SOP
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {sop.triggers.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Process flow overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Process at a glance</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-y-3">
            {sop.steps.map((step, i) => (
              <div key={step.title} className="flex items-center">
                <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium text-gray-200">{step.title}</span>
                </div>
                {i < sop.steps.length - 1 && (
                  <ArrowRight className="mx-1.5 h-4 w-4 shrink-0 text-gray-600" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step-by-step timeline */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Step-by-step</h2>
        <ol className="relative space-y-6 border-l border-gray-700 pl-8 ml-4">
          {sop.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[3.25rem] flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white ring-4 ring-gray-900">
                {i + 1}
              </span>
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-gray-300">{step.summary}</p>

                  {step.details && step.details.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {step.details.map((d) => (
                        <li key={d} className="flex items-start gap-2 text-sm text-gray-400">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}

                  {step.note && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <p className="text-sm text-amber-200">{step.note}</p>
                    </div>
                  )}

                  {step.links && step.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.links.map((l) => (
                        <a
                          key={l.href}
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-primary hover:bg-gray-800 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" /> {l.label}
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </div>

      {/* Reference table */}
      {sop.references && sop.references.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Quick reference
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="divide-y divide-gray-800">
              {sop.references.map((r) => (
                <div
                  key={r.label}
                  className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:gap-4"
                >
                  <dt className="w-full text-xs font-medium uppercase tracking-wide text-gray-500 sm:w-48 shrink-0">
                    {r.label}
                  </dt>
                  <dd className="text-sm text-gray-300 break-all">
                    {r.href ? (
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {r.value}
                      </a>
                    ) : (
                      r.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
