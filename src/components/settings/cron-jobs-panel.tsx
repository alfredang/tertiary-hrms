"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Copy, CheckCircle2 } from "lucide-react";

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

export function CronJobsPanel({ jobs }: { jobs: CronJobView[] }) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
      toast({
        title: `${job.name} triggered`,
        description: body && typeof body === "object"
          ? `${Object.entries(body).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(", ")}`
          : "Job started.",
      });
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
        <p className="text-sm text-gray-400 mt-1">
          Scheduled tasks triggered by an external scheduler (Coolify cron, GitHub Action). The app itself
          does not run a timer — point your scheduler at the URLs below on the listed cadence.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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
