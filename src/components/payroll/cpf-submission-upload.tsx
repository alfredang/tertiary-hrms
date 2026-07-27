"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
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
  driveWarning: string | null;
}

interface ApplyResult {
  message: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  details?: string[];
}

const money = (n: number) =>
  n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CpfSubmissionUpload() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const reset = () => {
    setSelectedFile(null);
    setParsed(null);
    setApplyResult(null);
    setExcluded(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setParsed(null);
    setApplyResult(null);
    setExcluded(new Set());
  };

  const handleParse = async () => {
    if (!selectedFile) return;
    setIsParsing(true);
    setParsed(null);
    setApplyResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/payroll/cpf-submission/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse the CPF statement");

      setParsed(data);
      toast({
        title: "CPF statement parsed",
        description: `${data.counts.matched} of ${data.counts.total} employees matched for ${MONTHS[data.month - 1]} ${data.year}`,
      });
      if (data.driveWarning) {
        toast({
          title: "Drive archive failed",
          description: data.driveWarning,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to parse the statement",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const toggleRow = (cpfAccountNo: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(cpfAccountNo)) next.delete(cpfAccountNo);
      else next.add(cpfAccountNo);
      return next;
    });
  };

  const selectableRows = parsed
    ? parsed.rows.filter((r) => r.employeeId && !excluded.has(r.cpfAccountNo))
    : [];

  const handleApply = async () => {
    if (!parsed || selectableRows.length === 0) return;
    setIsApplying(true);
    setApplyResult(null);

    try {
      const res = await fetch("/api/payroll/cpf-submission/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: parsed.month,
          year: parsed.year,
          overwrite,
          rows: selectableRows.map((r) => ({
            employeeId: r.employeeId,
            name: r.name,
            ordinaryWages: r.ordinaryWages,
            additionalWages: r.additionalWages,
            employeeCpf: r.employeeCpf,
            employerCpf: r.employerCpf,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payroll");

      setApplyResult(data);
      toast({
        title: "Payroll created",
        description: `Created ${data.created}, updated ${data.updated} payslips for ${MONTHS[parsed.month - 1]} ${parsed.year}`,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create payroll",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const busy = isParsing || isApplying;

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
          The pay period, wages and CPF contributions are read straight from the statement, so
          payslips match what was actually filed with the CPF Board. The PDF is archived to the
          shared CPF Drive folder.
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
            disabled={busy}
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
                disabled={busy}
                aria-label="Remove selected file"
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <Button type="button" onClick={handleParse} disabled={!selectedFile || busy}>
            {isParsing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reading statement…
              </>
            ) : (
              "Read statement"
            )}
          </Button>
        </div>

        {parsed && (
          <div className="space-y-4 border-t border-gray-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-white">
                  {MONTHS[parsed.month - 1]} {parsed.year}
                  {parsed.companyName ? ` · ${parsed.companyName}` : ""}
                </p>
                {parsed.cpfSubmissionNo && (
                  <p className="text-xs text-gray-500">
                    CSN {parsed.cpfSubmissionNo}
                  </p>
                )}
              </div>
              {parsed.driveWebViewLink && (
                <a
                  href={parsed.driveWebViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View archived PDF
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Employees", value: String(parsed.counts.total) },
                { label: "Matched", value: String(parsed.counts.matched) },
                { label: "Unmatched", value: String(parsed.counts.unmatched) },
                { label: "Ordinary wages", value: `$${money(parsed.totals.ordinaryWages)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm text-gray-300">
                <thead className="bg-gray-900 text-left text-gray-400">
                  <tr>
                    <th className="p-2 font-medium">Include</th>
                    <th className="p-2 font-medium">CPF name</th>
                    <th className="p-2 font-medium">Matched employee</th>
                    <th className="p-2 text-right font-medium">Gross</th>
                    <th className="p-2 text-right font-medium">CPF (EE)</th>
                    <th className="p-2 text-right font-medium">CPF (ER)</th>
                    <th className="p-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => {
                    const included = !!row.employeeId && !excluded.has(row.cpfAccountNo);
                    return (
                      <tr key={row.cpfAccountNo} className="border-t border-gray-800">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={!row.employeeId || busy}
                            onChange={() => toggleRow(row.cpfAccountNo)}
                            aria-label={`Include ${row.name}`}
                          />
                        </td>
                        <td className="p-2">
                          <div>{row.name}</div>
                          <div className="text-xs text-gray-500">{row.cpfAccountNo}</div>
                        </td>
                        <td className="p-2">
                          {row.employeeId ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              {row.matchedName}
                              {row.matchMethod !== "nric" && (
                                <span className="text-xs text-gray-500">
                                  (by name)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-500">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {row.ambiguous ? "Ambiguous — resolve manually" : "No match"}
                            </span>
                          )}
                          {row.alreadyHasPayslip && (
                            <div className="text-xs text-amber-500">
                              Payslip already exists for this period
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right">${money(row.grossSalary)}</td>
                        <td className="p-2 text-right">${money(row.employeeCpf)}</td>
                        <td className="p-2 text-right">${money(row.employerCpf)}</td>
                        <td className="p-2 text-right font-medium">${money(row.netSalary)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {parsed.counts.existing > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={overwrite}
                  disabled={busy}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                Overwrite the {parsed.counts.existing} payslip
                {parsed.counts.existing === 1 ? "" : "s"} that already exist for this period
              </label>
            )}

            <Button
              type="button"
              onClick={handleApply}
              disabled={busy || selectableRows.length === 0}
            >
              {isApplying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating payroll…
                </>
              ) : (
                `Create payroll for ${selectableRows.length} employee${selectableRows.length === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        )}

        {applyResult && (
          <div className="space-y-2 border-t border-gray-800 pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Created", value: applyResult.created },
                { label: "Updated", value: applyResult.updated },
                { label: "Skipped", value: applyResult.skipped },
                { label: "Errors", value: applyResult.errors },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
              ))}
            </div>
            {applyResult.details && applyResult.details.length > 0 && (
              <ul className="list-inside list-disc text-sm text-amber-500">
                {applyResult.details.map((d, i) => (
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
