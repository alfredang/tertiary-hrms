"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, Power, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface BuiltInWithUrl {
  id: string;
  name: string;
  description: string;
  method: "GET";
  pathTemplate: string;
  status: "planned" | "active";
  fullUrl: string;
}

interface CustomWebhook {
  id: string;
  name: string;
  description: string | null;
  httpMethod: string;
  endpointToken: string;
  authToken: string | null;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

type ViewMode =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; webhook: CustomWebhook };

export function WebhooksPanel({
  builtIns,
  custom,
  baseUrl,
}: {
  builtIns: BuiltInWithUrl[];
  custom: CustomWebhook[];
  baseUrl: string;
}) {
  const [view, setView] = useState<ViewMode>({ mode: "list" });

  if (view.mode !== "list") {
    return (
      <WebhookForm
        webhook={view.mode === "edit" ? view.webhook : null}
        baseUrl={baseUrl}
        onBack={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Webhooks</h2>
          <p className="text-sm text-gray-400 mt-1">
            Built-in approval webhooks and custom inbound endpoints.
          </p>
        </div>
        <Button onClick={() => setView({ mode: "create" })}>
          <Plus className="h-4 w-4 mr-2" />
          Create Webhook
        </Button>
      </div>

      {/* Built-in */}
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-medium text-white">Built-in Webhooks</h3>
          <p className="text-sm text-gray-400 mt-1">
            System webhooks for leave and expense-claim approvals. Triggered when the approver clicks Accept or
            Decline in the email.
          </p>
        </div>

        <div className="space-y-3">
          {builtIns.map((w) => (
            <div
              key={w.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white">{w.name}</p>
                <span className="text-xs px-2 py-0.5 rounded bg-green-950/50 border border-green-800 text-green-300">
                  {w.method}
                </span>
                <span
                  className={
                    w.status === "active"
                      ? "text-xs px-2 py-0.5 rounded bg-green-950/50 border border-green-800 text-green-300"
                      : "text-xs px-2 py-0.5 rounded bg-amber-950/50 border border-amber-800 text-amber-300"
                  }
                >
                  {w.status === "active" ? "Active" : "Planned"}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-950/50 border border-blue-800 text-blue-300">
                  Built-in
                </span>
              </div>
              <p className="text-sm text-gray-400">{w.description}</p>
              <UrlRow url={w.fullUrl} />
            </div>
          ))}
        </div>
      </section>

      {/* Custom */}
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-medium text-white">Custom Webhooks</h3>
          <p className="text-sm text-gray-400 mt-1">
            Public endpoints you can call from external systems. Every call is logged.
          </p>
        </div>

        {custom.length === 0 ? (
          <div className="bg-gray-900 border border-dashed border-gray-800 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400">
              No custom webhooks yet. Click <span className="text-white">Create Webhook</span> to add one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {custom.map((w) => (
              <CustomCard
                key={w.id}
                webhook={w}
                baseUrl={baseUrl}
                onEdit={() => setView({ mode: "edit", webhook: w })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UrlRow({ url }: { url: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate text-xs font-mono px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast({ title: "URL copied" });
        }}
        className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
      >
        <Copy className="h-3.5 w-3.5 mr-1.5" />
        Copy
      </Button>
    </div>
  );
}

function CustomCard({
  webhook,
  baseUrl,
  onEdit,
}: {
  webhook: CustomWebhook;
  baseUrl: string;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const url = `${baseUrl}/api/webhooks/${webhook.endpointToken}`;

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !webhook.enabled }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: webhook.enabled ? "Webhook disabled" : "Webhook enabled" });
      router.refresh();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${webhook.name}"? Logs will also be removed.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/webhooks/${webhook.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Webhook deleted" });
      router.refresh();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-white">{webhook.name}</p>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
          {webhook.httpMethod}
        </span>
        <span
          className={
            webhook.enabled
              ? "text-xs px-2 py-0.5 rounded bg-green-950/50 border border-green-800 text-green-300"
              : "text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400"
          }
        >
          {webhook.enabled ? "Enabled" : "Disabled"}
        </span>
        {webhook.authToken && (
          <span className="text-xs px-2 py-0.5 rounded bg-blue-950/50 border border-blue-800 text-blue-300">
            Bearer auth
          </span>
        )}
      </div>
      {webhook.description && <p className="text-sm text-gray-400">{webhook.description}</p>}
      <UrlRow url={url} />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={busy} className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">
          Edit
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={busy} className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">
          <Power className="h-3.5 w-3.5 mr-1.5" />
          {webhook.enabled ? "Disable" : "Enable"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={remove} disabled={busy} className="border-red-900 bg-red-950/40 text-red-300 hover:bg-red-950/60">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function WebhookForm({
  webhook,
  baseUrl,
  onBack,
}: {
  webhook: CustomWebhook | null;
  baseUrl: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!webhook;
  const [name, setName] = useState(webhook?.name ?? "");
  const [description, setDescription] = useState(webhook?.description ?? "");
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST">((webhook?.httpMethod as "GET" | "POST") ?? "POST");
  const [authToken, setAuthToken] = useState(webhook?.authToken ?? "");
  const [enabled, setEnabled] = useState(webhook?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        httpMethod,
        authToken: authToken.trim() || null,
        enabled,
      };
      const res = await fetch(
        isEdit ? `/api/settings/webhooks/${webhook!.id}` : "/api/settings/webhooks",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      toast({ title: isEdit ? "Webhook updated" : "Webhook created" });
      onBack();
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

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to webhooks
      </button>

      <div>
        <h2 className="text-xl font-semibold text-white">{isEdit ? "Edit Webhook" : "Create Webhook"}</h2>
        <p className="text-sm text-gray-400 mt-1">
          Inbound webhooks expose a public URL at <code className="text-xs">{baseUrl}/api/webhooks/&lt;token&gt;</code>.
          Every call is logged and a 200 is returned.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-gray-300">Name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="e.g., Slack notification" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description" className="text-gray-300">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="bg-gray-800 border-gray-700 text-white"
            placeholder="What does this webhook do?"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-300">HTTP Method</Label>
            <div className="flex gap-2">
              {(["GET", "POST"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setHttpMethod(m)}
                  className={
                    httpMethod === m
                      ? "px-4 py-2 rounded-md bg-primary text-white text-sm font-medium"
                      : "px-4 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-700"
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">Enabled</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEnabled(true)}
                className={
                  enabled
                    ? "px-4 py-2 rounded-md bg-green-900/60 border border-green-700 text-green-200 text-sm font-medium"
                    : "px-4 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-700"
                }
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setEnabled(false)}
                className={
                  !enabled
                    ? "px-4 py-2 rounded-md bg-gray-700 border border-gray-600 text-gray-200 text-sm font-medium"
                    : "px-4 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-700"
                }
              >
                No
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="authToken" className="text-gray-300">Bearer Auth Token (optional)</Label>
          <Input
            id="authToken"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
            placeholder="If set, callers must send Authorization: Bearer <token>"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving} className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isEdit ? "Save Changes" : "Create Webhook"}
        </Button>
      </div>
    </div>
  );
}
