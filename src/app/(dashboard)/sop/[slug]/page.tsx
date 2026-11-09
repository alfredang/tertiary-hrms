import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, FileText, Link2, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSopBySlug } from "@/lib/sops";

export const dynamic = "force-dynamic";

// SOP detail: purpose / scope / owner, then the numbered steps with who and when, then references
// and the source section of the manual. Open to all authenticated users (staff and interns).
export default async function SopDetailPage({ params }: { params: { slug: string } }) {
  const sop = await getSopBySlug(params.slug);
  if (!sop) notFound();

  const meta = [
    { label: "Purpose", value: sop.purpose },
    { label: "Scope", value: sop.scope },
    { label: "Owner", value: sop.owner },
  ].filter((m): m is { label: string; value: string } => Boolean(m.value));
  const updated = sop.updatedAt
    ? new Date(sop.updatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/sop"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> All SOPs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{sop.title}</h1>
          <span className="rounded-full border border-gray-700 px-2.5 py-0.5 text-xs text-gray-400">{sop.category}</span>
        </div>
        <p className="mt-2 text-sm text-gray-400 sm:text-base">{sop.summary}</p>
      </div>

      {(meta.length > 0 || (sop.triggers && sop.triggers.length > 0)) && (
        <Card>
          <CardContent className="p-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr]">
              {meta.map((m) => (
                <div key={m.label} className="contents">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 sm:pt-0.5">{m.label}</dt>
                  <dd className="text-sm text-gray-200">{m.value}</dd>
                </div>
              ))}
              {sop.triggers && sop.triggers.length > 0 && (
                <div className="contents">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 sm:pt-0.5">When to use</dt>
                  <dd>
                    <ul className="space-y-1">
                      {sop.triggers.map((t) => (
                        <li key={t} className="flex items-start gap-2 text-sm text-gray-200">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Steps</h2>
        <ol className="relative ml-4 space-y-4 border-l border-gray-700 pl-8">
          {sop.steps.map((step, i) => (
            <li key={`${i}-${step.title}`} className="relative">
              <span className="absolute -left-[3.25rem] flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-color ring-4 ring-gray-900">
                {i + 1}
              </span>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  {(step.owner || step.timing) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                      {step.owner && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5 text-primary" /> {step.owner}
                        </span>
                      )}
                      {step.timing && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-primary" /> {step.timing}
                        </span>
                      )}
                    </div>
                  )}
                  {step.detail && <p className="mt-2 text-sm text-gray-300">{step.detail}</p>}

                  {step.items && step.items.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {step.items.map((d) => (
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
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-gray-800"
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

      {sop.references && sop.references.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" /> Quick reference
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="divide-y divide-gray-800">
              {sop.references.map((r) => (
                <div key={r.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <dt className="w-full shrink-0 text-xs font-medium uppercase tracking-wide text-gray-500 sm:w-48">{r.label}</dt>
                  <dd className="break-words text-sm text-gray-300">
                    {r.href ? (
                      <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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

      {(sop.source || updated) && (
        <p className="flex items-start gap-2 border-t border-gray-800 pt-4 text-xs text-gray-500">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {sop.source && <>Source: {sop.source}</>}
            {sop.source && updated && " · "}
            {updated && <>Last updated {updated}</>}
          </span>
        </p>
      )}
    </div>
  );
}
