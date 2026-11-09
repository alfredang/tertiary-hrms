import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, Phone, Linkedin, FileText, FolderOpen, Landmark, FileCheck2, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTrainerAccess } from "@/lib/trainer-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/trainers/trainer-directory";
import { NricReveal } from "@/components/trainers/nric-reveal";
import { TrainerEditButton } from "@/components/trainers/trainer-form";
import { TRAINING_CERTS, maskNric } from "@/lib/trainers";

export const dynamic = "force-dynamic";

type Course = { title: string; code?: string; classes: number; first?: string; last?: string };
type RecentClass = { start: string; title: string; run?: string; status?: string };
type CalClass = { date: string; title: string; calendar?: string };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getTrainerAccess();
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const { id } = await params;
  const t = await prisma.trainer.findUnique({ where: { id } });
  if (!t) notFound();

  const courses = arr<Course>(t.courses);
  const recent = arr<RecentClass>(t.recentClasses);
  const cal = arr<CalClass>(t.calendarClasses);
  const folders = [t.actaFolder, ...t.moreFolders].filter(Boolean) as string[];
  const otherTraining = t.trainingCerts.filter((c) => !TRAINING_CERTS.some((x) => x.code === c));

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/trainers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Trainer directory
        </Link>
        <TrainerEditButton trainer={{
          id: t.id, name: t.name, nickname: t.nickname, nric: t.nric, phone: t.phone, email: t.email, nationality: t.nationality,
          linkedinUrl: t.linkedinUrl, status: t.status, trainingCerts: t.trainingCerts, certifications: t.certifications, skills: t.skills,
          experience: t.experience, education: t.education, summary: t.summary, financeBackground: t.financeBackground,
          ibfFitDeclaration: t.ibfFitDeclaration, adminNotes: t.adminNotes,
        }} />
      </div>

      <div>
        <h1 className="text-2xl font-bold">{t.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t.nickname && t.nickname !== t.name ? <>“{t.nickname}” · </> : null}
          {t.inTms ? `LMS/TMS trainer (${t.trainerType ?? "—"}, ${t.status})` : t.status === "Applicant" || t.status === "Contacted" ? `Applicant (${t.status})` : "ACTA Trainers folder — not in the TMS yet"}
          {t.lastClassDate && <> · last class {t.lastClassDate}</>}
          {t.classesCount > 0 && <> · {t.classesCount} TMS classes</>}
        </p>
        {t.summary && <p className="mt-2 text-sm max-w-3xl">{t.summary}</p>}
      </div>

      {/* Accreditation flags — the things a Trainer Admin filters on most */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {TRAINING_CERTS.map((c) => (
          <Flag key={c.code} on={t.trainingCerts.includes(c.code)} label={c.label} title={c.full} icon={<GraduationCap className="h-4 w-4" />} />
        ))}
        <Flag on={t.financeBackground} label="Finance background" icon={<Landmark className="h-4 w-4" />} />
        <Flag on={t.ibfFitDeclaration} label="IBF Fit declaration" icon={<FileCheck2 className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Identity &amp; contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV k="Full name">{t.name}</KV>
            <KV k="Nickname">{t.nickname || "—"}</KV>
            <KV k="NRIC / FIN">{t.nric ? <NricReveal masked={maskNric(t.nric)} full={t.nric} /> : <span className="text-muted-foreground">Not on file</span>}</KV>
            <KV k="Nationality">{t.nationality || "—"}</KV>
            <KV k="Tel">{t.phone ? <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${t.phone}`}><Phone className="h-3.5 w-3.5" />{t.phone}</a> : "—"}</KV>
            <KV k="Email">{t.email ? <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${t.email}`}><Mail className="h-3.5 w-3.5" />{t.email}</a> : "—"}</KV>
            {t.secondaryEmail && <KV k="Other email"><a className="hover:underline" href={`mailto:${t.secondaryEmail}`}>{t.secondaryEmail}</a></KV>}
            <KV k="Links">
              <span className="flex flex-wrap gap-3">
                {t.linkedinUrl && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={t.linkedinUrl} target="_blank" rel="noopener noreferrer"><Linkedin className="h-3.5 w-3.5" />LinkedIn</a>}
                {t.cvUrl && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={t.cvUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-3.5 w-3.5" />CV</a>}
                {t.cvFolderUrl && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={t.cvFolderUrl} target="_blank" rel="noopener noreferrer"><FolderOpen className="h-3.5 w-3.5" />CV folder</a>}
                {!t.linkedinUrl && !t.cvUrl && !t.cvFolderUrl && <span className="text-muted-foreground">—</span>}
              </span>
            </KV>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Certifications</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Training &amp; assessment</div>
              <div className="flex flex-wrap gap-1">
                {t.trainingCerts.length ? t.trainingCerts.map((c) => <Tag key={c} tone="acta">{c}</Tag>) : <span className="text-muted-foreground">None recorded</span>}
                {otherTraining.length > 0 && null}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Professional</div>
              <div className="flex flex-wrap gap-1">
                {t.certifications.length ? t.certifications.map((c) => <Tag key={c}>{c}</Tag>) : <span className="text-muted-foreground">None recorded</span>}
              </div>
            </div>
            {t.financeBackground && t.financeEvidence.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Finance background — evidence</div>
                <div className="flex flex-wrap gap-1">{t.financeEvidence.map((x) => <Tag key={x} tone="fin">{x}</Tag>)}</div>
              </div>
            )}
            {t.ibfFitFiles.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">IBF Fit and Proper declaration on file</div>
                <ul className="list-disc pl-5 text-xs">{t.ibfFitFiles.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Education</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-line">{t.education || <span className="text-muted-foreground">Not recorded yet</span>}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {t.skills.length ? t.skills.map((s) => <Tag key={s} tone="skill">{s}</Tag>) : <span className="text-sm text-muted-foreground">Not recorded yet</span>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Work experience</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {t.experience.length ? <ul className="list-disc pl-5 space-y-1">{t.experience.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="text-muted-foreground">Not recorded yet</span>}
            {t.profileSource && <p className="mt-3 text-xs text-muted-foreground">Source: {t.profileSource}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Courses taught ({courses.reduce((n, c) => n + (c.classes || 0), 0)} classes)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {courses.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3">Course</th><th className="pr-3">Code</th><th className="pr-3 text-right">Classes</th><th className="pr-3">First</th><th>Last</th></tr></thead>
                <tbody>{courses.map((c, i) => (
                  <tr key={i} className="border-t"><td className="py-1.5 pr-3">{c.title}</td><td className="pr-3 text-xs">{c.code || "—"}</td><td className="pr-3 text-right tabular-nums">{c.classes}</td><td className="pr-3 text-xs whitespace-nowrap">{c.first || "—"}</td><td className="text-xs whitespace-nowrap">{c.last || "—"}</td></tr>
                ))}</tbody>
              </table>
            ) : <span className="text-sm text-muted-foreground">No classes in the TMS.</span>}
          </CardContent>
        </Card>

        {recent.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Recent classes in the TMS</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3">Start</th><th className="pr-3">Course</th><th>Status</th></tr></thead>
                <tbody>{recent.map((r, i) => (
                  <tr key={i} className="border-t"><td className="py-1.5 pr-3 text-xs whitespace-nowrap">{r.start || "—"}</td><td className="pr-3">{r.title}</td><td className="text-xs">{r.status || "—"}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {cal.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Classes in Google Calendar ({cal.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3">Date</th><th className="pr-3">Class</th><th>Calendar</th></tr></thead>
                <tbody>{cal.map((r, i) => (
                  <tr key={i} className="border-t"><td className="py-1.5 pr-3 text-xs whitespace-nowrap">{r.date}</td><td className="pr-3">{r.title}</td><td className="text-xs">{r.calendar || "—"}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Evidence on file</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {folders.length ? (
              <p className="text-muted-foreground">ACTA Trainers folder: {folders.map((f) => <code key={f} className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">{f}</code>)}</p>
            ) : <p className="text-muted-foreground">No ACTA Trainers folder.</p>}
            {t.evidenceFiles.length > 0 && (
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">{t.evidenceFiles.map((f) => <li key={f} className="flex gap-1.5 break-all"><FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />{f}</li>)}</ul>
            )}
          </CardContent>
        </Card>

        {t.adminNotes && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Trainer Admin notes</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-line">{t.adminNotes}</CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t.importedAt && <>Imported {t.importedAt.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}. </>}
        {t.editedAt && <>Edited {t.editedAt.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}{t.editedBy ? ` by ${t.editedBy}` : ""} — the importer keeps these edits.</>}
      </p>
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium break-words">{children}</span>
    </div>
  );
}

function Flag({ on, label, title, icon }: { on: boolean; label: string; title?: string; icon: React.ReactNode }) {
  return (
    <div title={title} className={`rounded-xl border p-3 flex items-center gap-2 text-sm ${on ? "border-emerald-500/50 bg-emerald-500/10" : "opacity-60"}`}>
      {icon}
      <span className="font-medium">{label}</span>
      <span className={`ml-auto text-xs font-semibold ${on ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{on ? "Yes" : "No"}</span>
    </div>
  );
}
