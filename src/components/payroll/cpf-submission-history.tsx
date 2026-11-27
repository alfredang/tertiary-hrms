"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";

interface CpfFile {
  id: string;
  name: string;
  periodLabel: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  webViewLink: string | null;
  downloadPath: string;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploaded(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Past CPF EZPay statements from the shared CPF Drive folder, latest first, each
 * downloadable. Admins and accountants only (the API enforces it). Bump
 * `refreshKey` to reload, e.g. after a new statement is processed.
 */
export function CpfSubmissionHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [files, setFiles] = useState<CpfFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/cpf-submission/files", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the CPF submissions");
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the CPF submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-white">
          <FileText className="h-5 w-5" />
          Past CPF Submissions
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="border-gray-700 hover:bg-gray-800"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : files === null ? (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : files.length === 0 ? (
          <p className="text-sm text-gray-400">No CPF submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Pay Period</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">File</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Uploaded</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3">Size</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3">Download</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b border-gray-800/60 hover:bg-gray-900/60">
                    <td className="px-4 py-3 text-sm font-medium text-white">{f.periodLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-[22rem] truncate" title={f.name}>
                      {f.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatUploaded(f.uploadedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right">{formatSize(f.sizeBytes)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <a href={f.downloadPath} download={f.name}>
                          <Button size="sm" variant="outline" className="border-gray-700 hover:bg-gray-800">
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                        </a>
                        {f.webViewLink && (
                          <a
                            href={f.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Google Drive"
                            className="text-gray-400 hover:text-white"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
