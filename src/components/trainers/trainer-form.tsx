"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { TRAINING_CERTS, TRAINER_STATUSES } from "@/lib/trainers";

export type TrainerFormValues = {
  id?: string;
  name: string;
  nickname: string | null;
  nric: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  linkedinUrl: string | null;
  status: string;
  trainingCerts: string[];
  certifications: string[];
  skills: string[];
  experience: string[];
  education: string | null;
  summary: string | null;
  financeBackground: boolean;
  ibfFitDeclaration: boolean;
  adminNotes: string | null;
};

export const EMPTY_TRAINER: TrainerFormValues = {
  name: "", nickname: null, nric: null, phone: null, email: null, nationality: null, linkedinUrl: null, status: "Active",
  trainingCerts: [], certifications: [], skills: [], experience: [], education: null, summary: null,
  financeBackground: false, ibfFitDeclaration: false, adminNotes: null,
};

const splitList = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

export function TrainerForm({ initial, onDone }: { initial: TrainerFormValues; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [certs, setCerts] = useState(initial.certifications.join(", "));
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [exp, setExp] = useState(initial.experience.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TrainerFormValues>(k: K, val: TrainerFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      ...v, id: undefined,
      certifications: splitList(certs, /[,;\n]/),
      skills: splitList(skills, /[,;\n]/),
      experience: splitList(exp, /\n/),
    };
    const res = await fetch(v.id ? `/api/trainers/${v.id}` : "/api/trainers", {
      method: v.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    if (v.id) {
      onDone?.();
      router.refresh();
    } else {
      router.push(`/trainers/${json.id}`);
    }
  }

  const text = (k: keyof TrainerFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`f-${k}`}>{label}</Label>
      <Input id={`f-${k}`} value={(v[k] as string | null) ?? ""} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {text("name", "Full name *", { required: true })}
        {text("nickname", "Nickname")}
        {text("nric", "NRIC / FIN", { autoComplete: "off" })}
        {text("phone", "Tel")}
        {text("email", "Email", { type: "email" })}
        {text("nationality", "Nationality")}
        {text("linkedinUrl", "LinkedIn URL")}
        <div className="space-y-1">
          <Label htmlFor="f-status">Status</Label>
          <select id="f-status" value={v.status} onChange={(e) => set("status", e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            {TRAINER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Accreditation</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {TRAINING_CERTS.map((c) => (
            <label key={c.code} className="inline-flex items-center gap-2" title={c.full}>
              <input type="checkbox" checked={v.trainingCerts.includes(c.code)}
                onChange={(e) => set("trainingCerts", e.target.checked ? [...v.trainingCerts, c.code] : v.trainingCerts.filter((x) => x !== c.code))} />
              {c.label}
            </label>
          ))}
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={v.financeBackground} onChange={(e) => set("financeBackground", e.target.checked)} /> Finance background</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={v.ibfFitDeclaration} onChange={(e) => set("ibfFitDeclaration", e.target.checked)} /> IBF Fit declaration form on file</label>
        </div>
      </fieldset>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="f-certs">Professional certifications (comma-separated)</Label>
          <Textarea id="f-certs" rows={2} value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="PMP, CCAR-F, CFA, AWS Solutions Architect" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-skills">Skills (comma-separated)</Label>
          <Textarea id="f-skills" rows={2} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Articulate Storyline, Python, Power BI, Video editing" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-edu">Education</Label>
          <Textarea id="f-edu" rows={3} value={v.education ?? ""} onChange={(e) => set("education", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-sum">Summary — what they are good to teach</Label>
          <Textarea id="f-sum" rows={3} value={v.summary ?? ""} onChange={(e) => set("summary", e.target.value)} />
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="f-exp">Work experience (one per line)</Label>
          <Textarea id="f-exp" rows={5} value={exp} onChange={(e) => setExp(e.target.value)} placeholder="Senior Trainer, ABC Academy (2019 – present)" />
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="f-notes">Trainer Admin notes</Label>
          <Textarea id="f-notes" rows={3} value={v.adminNotes ?? ""} onChange={(e) => set("adminNotes", e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : v.id ? "Save changes" : "Add trainer"}</Button>
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
      </div>
    </form>
  );
}

export function TrainerEditButton({ trainer }: { trainer: TrainerFormValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Edit trainer">
          <Card className="w-full max-w-4xl p-5 mt-8 relative">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-5 w-5" /></button>
            <h2 className="text-lg font-semibold mb-4">Edit {trainer.name}</h2>
            <TrainerForm initial={trainer} onDone={() => setOpen(false)} />
          </Card>
        </div>
      )}
    </>
  );
}
