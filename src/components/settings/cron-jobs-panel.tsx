"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Copy, CheckCircle2, Mail, UserX } from "lucide-react";

interface CronJobView {
  id: string;
  name: string;
  description: string;
  schedule: string;
  cron: string;
  method: "GET" | "POST";
  path: string;
  fullUrl: string;
  status: "active" | "planned";
}

export function CronJobsPanel({
  jobs,
  autoDeactivateInterns = false,
}: {
  jobs: CronJobView[];
  autoDeactivateInterns?: boolean;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [autoDeactivate, setAutoDeactivate] = useState(autoDeactivateInterns);
  const [savingToggle, setSavingToggle] = useState(false);

  const toggleAutoDeactivate = async () => {
    const next = !autoDeactivate;
    setSavingToggle(true);
    setAutoDeactivate(next); // optimistic
    try {
      const res = await fetch("/api/settings/auto-deactivate-interns", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast({
        title: next ? "Auto-deactivation enabled" : "Auto-deactivation disabled",
        description: next
          ? "Interns are set to Inactive the day after their end date."
          : "Interns will no longer be auto-deactivated.",
      });
    } catch (err) {
      setAutoDeactivate(!next); // revert
      toast({
        title: "Could not update setting",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingToggle(false);
    }
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast({ title: "Test email sent", description: `Delivered to ${body.sentTo}` });
    } catch (err) {
      toast({
        title: "Email failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const runNow = async (job: CronJobView) => {
    setRunning(job.id);
    try {
      const res = await fetch("/api/cron/run-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: job.path, method: job.method }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      const entries = body && typeof body === "object" ? Object.entries(body) : [];
      const details = entries.length > 0
        ? entries.slice(0, 6).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("  |  ")
        : "Job completed (no response body).";
      toast({ title: `${job.name} triggered`, description: details });
    } catch (err) {
      toast({
        title: "Run failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle className="text-white">Cron Jobs</CardTitle>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <p className="text-sm text-gray-400">
            Scheduled tasks triggered by an external scheduler (Coolify cron, GitHub Action). The app itself
            does not run a timer — point your scheduler at the URLs below on the listed cadence.
          </p>
          <Button variant="outline" size="sm" onClick={sendTestEmail} disabled={testingEmail} className="shrink-0">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            {testingEmail ? "Sending..." : "Send Test Email"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border border-gray-800 rounded-xl p-4 bg-gray-900/40 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-gray-800 shrink-0">
              <UserX className="h-4 w-4 text-gray-300" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Auto-deactivate expired interns</h3>
              <p className="text-sm text-gray-400 mt-1">
                When on, the daily <span className="text-gray-300">Deactivate Expired Interns</span> job
                sets interns to <span className="text-gray-300">Inactive</span> the day after their
                employment end date, which also blocks them from logging in. When off, the job is skipped.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoDeactivate}
            aria-label="Auto-deactivate expired interns"
            onClick={toggleAutoDeactivate}
            disabled={savingToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autoDeactivate ? "bg-primary" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoDeactivate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {jobs.map((j) => (
          <div
            key={j.id}
            className="border border-gray-800 rounded-xl p-4 bg-gray-900/40 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-semibold">{j.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    j.status === "active" ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-400"
                  }`}>
                    {j.status}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 font-mono">
                    {j.method}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1.5">{j.description}</p>
              </div>
              <Button
                size="sm"
                onClick={() => runNow(j)}
                disabled={running === j.id}
                className="shrink-0"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {running === j.id ? "Running..." : "Run Now"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-900 border border-gray-800 rounded px-2 py-1.5">
                <span className="text-gray-500">Schedule</span>
                <p className="text-gray-200 mt-0.5">{j.schedule}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded px-2 py-1.5">
                <span className="text-gray-500">Cron Expression</span>
                <p className="text-amber-300 font-mono mt-0.5">{j.cron}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-gray-300 bg-gray-900 border border-gray-800 rounded px-2 py-2 break-all">
                {j.fullUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(j.fullUrl, j.id)}
                className="shrink-0"
              >
                {copied === j.id ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copied === j.id ? "Copied" : "Copy URL"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
