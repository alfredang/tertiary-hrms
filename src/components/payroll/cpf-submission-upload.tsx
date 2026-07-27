"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ParsedRow {
  cpfAccountNo: string;
  name: string;
  ordinaryWages: number;
  additionalWages: number;
  employeeCpf: number;
  employerCpf: number;
  grossSalary: number;
  netSalary: number;
  employeeId: string | null;
  matchedName: string | null;
  matchMethod: "nric" | "exact" | "tokens" | null;
  ambiguous: boolean;
  alreadyHasPayslip: boolean;
}

interface ParseResult {
  cpfSubmissionNo: string | null;
  companyName: string | null;
  month: number;
  year: number;
  totals: {
    totalCpfContributions: number | null;
    totalSdl: number | null;
    grandTotal: number | null;
    ordinaryWages: number;
    employeeCpf: number;
    employerCpf: number;
  };
  counts: { total: number; matched: number; unmatched: number; existing: number };
  rows: ParsedRow[];
  driveWebViewLink: string | null;
}

interface ApplyResult {
  message: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  details?: string[];
}

interface ProcessOutcome {
  month: number;
  year: number;
  driveWebViewLink: string | null;
  apply: ApplyResult;
  unmatched: ParsedRow[];
  processedNames: string[];
}

const money = (n: number) =>
  n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CpfSubmissionUpload() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outcome, setOutcome] = useState<ProcessOutcome | null>(null);

  const reset = () => {
    setSelectedFile(null);
    setOutcome(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setOutcome(null);
  };

  // One-shot flow: archive the PDF to the CPF Drive folder + parse it, then
  // immediately create/update the month's payslips from the matched rows.
  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setOutcome(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const parseRes = await fetch("/api/payroll/cpf-submission/parse", {
        method: "POST",
        body: formData,
      });
      const parsed: ParseResult & { error?: string } = await parseRes.json();
      if (!parseRes.ok) {
        throw new Error(parsed.error || "Failed to read the CPF statement");
      }

      const matched = parsed.rows.filter((r) => r.employeeId);
      const unmatched = parsed.rows.filter((r) => !r.employeeId);
      if (matched.length === 0) {
        throw new Error(
          "No employees in the statement could be matched to HRMS records — payroll was not changed.",
        );
      }

      const applyRes = await fetch("/api/payroll/cpf-submission/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: parsed.month,
          year: parsed.year,
          overwrite: true,
          rows: matched.map((r) => ({
            employeeId: r.employeeId,
            name: r.name,
            ordinaryWages: r.ordinaryWages,
            additionalWages: r.additionalWages,
            employeeCpf: r.employeeCpf,
            employerCpf: r.employerCpf,
          })),
        }),
      });
      const apply: ApplyResult & { error?: string } = await applyRes.json();
      if (!applyRes.ok) {
        throw new Error(apply.error || "The statement was read but payroll could not be written");
      }

      setOutcome({
        month: parsed.month,
        year: parsed.year,
        driveWebViewLink: parsed.driveWebViewLink,
        apply,
        unmatched,
        processedNames: matched.map((r) => r.matchedName ?? r.name),
      });
      toast({
        title: "Payroll processed",
        description: `${MONTHS[parsed.month - 1]} ${parsed.year}: ${apply.created} created, ${apply.updated} updated${unmatched.length ? `, ${unmatched.length} unmatched` : ""}`,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to process the CPF statement",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <ShieldCheck className="h-5 w-5" />
          Generate from CPF Submission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-400">
          Upload the CPF EZPay <span className="font-medium">Confirm Employee Details</span> PDF.
          The PDF is first archived to the shared CPF Drive folder, then payroll for the
          statement&apos;s month is created or updated automatically — wages and CPF are taken
          straight from what was filed with the CPF Board.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="border-gray-700 hover:bg-gray-800"
            disabled={isProcessing}
          >
            <Upload className="mr-2 h-4 w-4" />
            Choose CPF PDF
          </Button>

          {selectedFile && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="max-w-[18rem] truncate">{selectedFile.name}</span>
              <button
                type="button"
                onClick={reset}
                disabled={isProcessing}
                aria-label="Remove selected file"
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <Button
            type="button"
            onClick={handleUploadAndProcess}
            disabled={!selectedFile || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading &amp; processing…
              </>
            ) : (
              "Upload & Process Payroll"
            )}
          </Button>
        </div>

        {outcome && (
          <div className="space-y-4 border-t border-gray-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-white">
                {MONTHS[outcome.month - 1]} {outcome.year} payroll processed
              </p>
              {outcome.driveWebViewLink && (
                <a
                  href={outcome.driveWebViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View archived PDF in Drive
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Created", value: outcome.apply.created },
                { label: "Updated", value: outcome.apply.updated },
                { label: "Unmatched", value: outcome.unmatched.length },
                { label: "Errors", value: outcome.apply.errors },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
              ))}
            </div>

            {outcome.processedNames.length > 0 && (
              <p className="text-xs text-gray-500">
                Processed: {outcome.processedNames.join(", ")}
              </p>
            )}

            {outcome.unmatched.length > 0 && (
              <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  Not processed — no matching employee found
                </p>
                <ul className="list-inside list-disc text-amber-200/80">
                  {outcome.unmatched.map((r) => (
                    <li key={r.cpfAccountNo}>
                      {r.name} ({r.cpfAccountNo}) — ${money(r.grossSalary)}
                      {r.ambiguous ? " — ambiguous match, resolve manually" : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-200/60">
                  Check the employee&apos;s NRIC or name in Staff Management, then upload again.
                </p>
              </div>
            )}

            {outcome.apply.details && outcome.apply.details.length > 0 && (
              <ul className="list-inside list-disc text-sm text-amber-500">
                {outcome.apply.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
