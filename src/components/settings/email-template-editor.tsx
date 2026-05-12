"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { TemplateDef } from "@/lib/email-templates/defaults";

interface Props {
  def: TemplateDef;
  initialSubject: string;
  initialBody: string;
  isCustom: boolean;
}

export function EmailTemplateEditor({ def, initialSubject, initialBody, isCustom }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [originalSubject, setOriginalSubject] = useState(initialSubject);
  const [originalBody, setOriginalBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hasChanges = subject !== originalSubject || body !== originalBody;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/email-templates/${def.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setOriginalSubject(subject);
      setOriginalBody(body);
      toast({ title: "Template saved", description: `${def.label} has been updated.` });
      router.refresh();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!confirm("Reset this template to the built-in default? Your custom version will be lost.")) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/settings/email-templates/${def.key}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      setSubject(def.defaultSubject);
      setBody(def.defaultBody);
      setOriginalSubject(def.defaultSubject);
      setOriginalBody(def.defaultBody);
      toast({ title: "Template reset", description: `${def.label} restored to default.` });
      router.refresh();
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Mail className="h-6 w-6 text-primary shrink-0 mt-1" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white">{def.label}</h2>
            <p className="text-sm text-gray-400 mt-1">{def.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={resetToDefault}
            disabled={!isCustom || resetting || saving}
            className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Reset to Default
          </Button>
          <Button type="button" onClick={save} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Available Variables */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm font-medium text-white mb-3">Available Variables</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {def.variables.map((v) => (
            <div key={v.name} className="flex items-center gap-2 min-w-0">
              <code className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-primary font-mono shrink-0">
                {`{${v.name}}`}
              </code>
              <span className="text-xs text-gray-400 truncate">{v.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">Email Template</p>
          <span
            className={
              hasChanges
                ? "text-xs px-2 py-1 rounded bg-amber-950/50 border border-amber-800 text-amber-300"
                : "text-xs px-2 py-1 rounded bg-green-950/50 border border-green-800 text-green-300"
            }
          >
            {hasChanges ? "Unsaved changes" : "Up to date"}
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject" className="text-gray-300">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body" className="text-gray-300">Body</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="bg-gray-800 border-gray-700 text-white font-mono text-sm leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
