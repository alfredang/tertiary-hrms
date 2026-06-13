"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2 } from "lucide-react";

export function AccountingClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);
    setBusy(true);
    try {
      // 1. Parse the statement
      const fd = new FormData();
      fd.append("file", file);
      const parseRes = await fetch("/api/accounting/parse-statement", {
        method: "POST",
        body: fd,
      });
      const parsed = await parseRes.json();
      if (!parseRes.ok) throw new Error(parsed.error ?? "Failed to parse statement");

      const rows = (parsed.transactions ?? []).map((t: any) => ({
        paymentDate: t.paymentDate,
        title: t.title,
        amount: Number(t.amount),
        direction: t.direction === "CREDIT" ? "CREDIT" : "DEBIT",
        type: t.type ?? "Other",
        status: "Pending",
        gstIncluded: t.gstIncluded ?? t.direction === "DEBIT",
        recurring: t.recurring ?? "One Time",
        remarks: t.remarks ?? file.name,
        rawDescription: t.rawDescription ?? t.title,
        paymentType: t.paymentType ?? "Bank Transfer",
        paymentRef: t.paymentRef ?? "",
        invoiceNo: t.invoiceNo ?? "",
      }));

      if (rows.length === 0) {
        setSummary("No transactions found in this statement.");
        return;
      }

      // 2. Auto-save (dedupe handled server-side via unique key)
      const saveRes = await fetch("/api/accounting/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: rows }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error ?? "Failed to save");

      const credits = rows.filter((r: any) => r.direction === "CREDIT").length;
      const debits = rows.length - credits;
      const verifyNote = saved.verified
        ? "all rows verified in DB"
        : `WARNING: persisted ${saved.persisted} of ${saved.fresh} expected`;

      const existingRows: any[] = saved.existingRows ?? [];
      const alreadySettled = existingRows.filter((r: any) => r.qbExpenseNo);
      let settledNote = "";
      if (alreadySettled.length > 0) {
        const bills = alreadySettled.map((r: any) => r.qbExpenseNo).join(", ");
        settledNote = ` — ${alreadySettled.length} already in QB: ${bills}.`;
      } else if (saved.skipped > 0) {
        settledNote = ` — ${saved.skipped} duplicate${saved.skipped === 1 ? "" : "s"} already in HRMS (not yet in QB).`;
      }

      const driveNote = parsed.driveWarning
        ? ` ⚠️ Google Drive upload failed: ${parsed.driveWarning}`
        : parsed.driveFileId
          ? " ✓ Saved to Google Drive."
          : "";

      setSummary(
        `Imported ${file.name}: ` +
          `${saved.saved} new saved` +
          (saved.skipped > 0 ? `, ${saved.skipped} skipped` : "") +
          `. Parsed ${credits} credit${credits === 1 ? "" : "s"} / ${debits} debit${debits === 1 ? "" : "s"}.` +
          settledNote +
          ` (${verifyNote})` +
          driveNote,
      );
      // Clear any active search/status/date filters so the freshly-imported rows
      // are always visible. router.refresh() alone keeps the old URL params, which
      // can hide every new row behind a stale `?q=` search.
      router.replace(pathname, { scroll: false });
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gray-800">
            <FileText className="h-6 w-6 text-gray-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Import Bank Statement</h2>
            <p className="text-sm text-gray-400">
              Upload a DBS Excel statement (.xlsx or .xls). Rows are parsed locally and enriched with
              Claude (customer/vendor name, category, refs); duplicates are detected and skipped.
            </p>
          </div>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onPick}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Upload Statement
              </>
            )}
          </Button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {summary && <p className="mt-3 text-sm text-green-400">{summary}</p>}
    </div>
  );
}
