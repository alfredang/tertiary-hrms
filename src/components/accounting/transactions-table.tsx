"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Send } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Row = {
  id: string;
  paymentDate: string;
  title: string;
  amount: number;
  type: string;
  paymentType: string;
  paymentRef: string;
  invoiceNo: string;
  receiptNo: string;
  qbExpenseNo: string;
  status: string;
  gstIncluded: boolean;
  remarks: string;
};

const PAYMENT_TYPES = ["GIRO", "Bank Transfer", "PayNow", "CC", "Cash", "e-invoice"];
const STATUSES = ["Pending", "Settled"];
const EXPENSE_CATEGORIES = [
  "Trainer Fee",
  "Allowance",
  "Bank Charges",
  "Payroll",
  "CPF",
  "Income Tax",
  "Rental",
  "Subscription",
  "Vendor Payment",
  "Payment Processor",
  "Grocery",
  "Meal",
  "Entertainment",
  "General Expenses",
  "Refund",
  "Other",
];
const INCOME_CATEGORIES = ["Income", "Refund", "Other"];

export function TransactionsTable({
  rows: initialRows,
  emptyText,
  titleLabel = "Expense Title",
  showGst = true,
  showCategory = false,
  showReceiptNo = false,
  showGenerateExpense = false,
  paymentRefLabel = "Bank Ref",
  invoiceNoLabel = "Invoice No",
  direction = "DEBIT",
}: {
  rows: Row[];
  emptyText: string;
  titleLabel?: string;
  showGst?: boolean;
  showCategory?: boolean;
  showReceiptNo?: boolean;
  showGenerateExpense?: boolean;
  paymentRefLabel?: string;
  invoiceNoLabel?: string;
  direction?: "DEBIT" | "CREDIT";
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generateErrors, setGenerateErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);

  const storageKey = `acct-cols-v3-${direction}`;
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setWidths(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  const setWidth = (id: string, w: number) => {
    setWidths((prev) => {
      const next = { ...prev, [id]: Math.max(60, Math.round(w)) };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => { setRows(initialRows); }, [initialRows]);

  // Pending rows that are eligible to be sent to QB
  const pendingRows = rows.filter((r) => r.status === "Pending" && !r.qbExpenseNo);
  const selectedPending = [...selectedIds].filter((id) =>
    pendingRows.some((r) => r.id === id),
  );
  const allPendingSelected =
    pendingRows.length > 0 && pendingRows.every((r) => selectedIds.has(r.id));

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRows.map((r) => r.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateOneExpense(rowId: string): Promise<boolean> {
    setGeneratingIds((s) => new Set(s).add(rowId));
    setGenerateErrors((e) => { const { [rowId]: _, ...rest } = e; return rest; });
    try {
      const res = await fetch("/api/accounting/transactions/generate-expense", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rowId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create QB expense");
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, status: "Settled", qbExpenseNo: data.qbExpenseNo ?? "" } : r,
        ),
      );
      return true;
    } catch (err: any) {
      setGenerateErrors((e) => ({ ...e, [rowId]: err.message ?? "QB error" }));
      return false;
    } finally {
      setGeneratingIds((s) => { const next = new Set(s); next.delete(rowId); return next; });
    }
  }

  async function bulkGenerate() {
    if (selectedPending.length === 0) return;
    setBulkGenerating(true);
    for (const id of selectedPending) {
      await generateOneExpense(id);
    }
    setSelectedIds(new Set());
    setBulkGenerating(false);
  }

  async function deleteRow(rowId: string) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingId(rowId);
    try {
      const res = await fetch(`/api/accounting/transactions/${rowId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function patch(rowId: string, field: keyof Row, value: any) {
    const key = `${rowId}:${field}`;
    setSavingKeys((prev) => new Set(prev).add(key));
    setErrors((e) => { const { [key]: _ignored, ...rest } = e; return rest; });
    try {
      const res = await fetch(`/api/accounting/transactions/${rowId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
    } catch (err: any) {
      setErrors((e) => ({ ...e, [key]: err.message ?? "Save failed" }));
    } finally {
      setSavingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  function setField(rowId: string, field: keyof Row, value: any) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  }

  async function commitField(rowId: string, field: keyof Row, value: any, opts: { refresh?: boolean } = {}) {
    await patch(rowId, field, value);
    if (opts.refresh) router.refresh();
  }

  const categoryOptions = direction === "CREDIT" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const total = rows.reduce((s, r) => s + r.amount, 0);

  if (initialRows.length === 0) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 text-center text-sm text-gray-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            {rows.length} record{rows.length === 1 ? "" : "s"}
          </p>
          {showGenerateExpense && selectedPending.length > 0 && (
            <button
              onClick={bulkGenerate}
              disabled={bulkGenerating}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white transition-colors"
            >
              {bulkGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Generate QB Expense{selectedPending.length > 1 ? `s (${selectedPending.length})` : ""}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-300">
          Total <span className="font-semibold text-white">{formatCurrency(total)}</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          className="text-sm border-collapse [&_td]:border-r [&_td]:border-gray-700 [&_th]:border-r [&_th]:border-gray-700 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_tr]:border-b [&_tr]:border-gray-700"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <colgroup>
            {showGenerateExpense && <col style={{ width: "40px" }} />}
            <Col id="title" widths={widths} defaultW={360} />
            <Col id="paymentDate" widths={widths} defaultW={150} />
            <Col id="amount" widths={widths} defaultW={110} />
            {showGst && <Col id="gstIncluded" widths={widths} defaultW={80} />}
            <Col id="paymentType" widths={widths} defaultW={140} />
            {showCategory && <Col id="type" widths={widths} defaultW={150} />}
            {showGenerateExpense && <Col id="qbExpenseNo" widths={widths} defaultW={120} />}
            <Col id="paymentRef" widths={widths} defaultW={160} />
            <Col id="invoiceNo" widths={widths} defaultW={200} />
            {showReceiptNo && <Col id="receiptNo" widths={widths} defaultW={180} />}
            <Col id="status" widths={widths} defaultW={120} />
            <Col id="remarks" widths={widths} defaultW={360} />
            <col style={{ width: "40px" }} />
          </colgroup>

          <thead className="bg-gray-900 text-gray-400">
            <tr>
              {showGenerateExpense && (
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                    disabled={pendingRows.length === 0}
                    title="Select all pending"
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </th>
              )}
              <ResizableTh id="title" widths={widths} setWidth={setWidth} defaultW={360}>
                {titleLabel}
              </ResizableTh>
              <ResizableTh id="paymentDate" widths={widths} setWidth={setWidth} defaultW={150}>
                Payment Date
              </ResizableTh>
              <ResizableTh id="amount" widths={widths} setWidth={setWidth} defaultW={110} align="right">
                Amount
              </ResizableTh>
              {showGst && (
                <ResizableTh id="gstIncluded" widths={widths} setWidth={setWidth} defaultW={80}>
                  GST
                </ResizableTh>
              )}
              <ResizableTh id="paymentType" widths={widths} setWidth={setWidth} defaultW={140}>
                Payment Type
              </ResizableTh>
              {showCategory && (
                <ResizableTh id="type" widths={widths} setWidth={setWidth} defaultW={150}>
                  Category
                </ResizableTh>
              )}
              {showGenerateExpense && (
                <ResizableTh id="qbExpenseNo" widths={widths} setWidth={setWidth} defaultW={120}>
                  Bill No
                </ResizableTh>
              )}
              <ResizableTh id="paymentRef" widths={widths} setWidth={setWidth} defaultW={160}>
                {paymentRefLabel}
              </ResizableTh>
              <ResizableTh id="invoiceNo" widths={widths} setWidth={setWidth} defaultW={200}>
                {invoiceNoLabel}
              </ResizableTh>
              {showReceiptNo && (
                <ResizableTh id="receiptNo" widths={widths} setWidth={setWidth} defaultW={180}>
                  Receipt No
                </ResizableTh>
              )}
              <ResizableTh id="status" widths={widths} setWidth={setWidth} defaultW={120}>
                Status
              </ResizableTh>
              <ResizableTh id="remarks" widths={widths} setWidth={setWidth} defaultW={360}>
                Remark
              </ResizableTh>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody className="text-white">
            {rows.map((r) => {
              const isSaving = (f: string) => savingKeys.has(`${r.id}:${f}`);
              const errorOf = (f: string) => errors[`${r.id}:${f}`];
              const isPending = r.status === "Pending" && !r.qbExpenseNo;
              const isGenerating = generatingIds.has(r.id);

              return (
                <tr
                  key={r.id}
                  className={
                    "hover:bg-gray-900/40 align-top " +
                    (selectedIds.has(r.id) ? "bg-emerald-950/30 " : "")
                  }
                >
                  {/* Checkbox */}
                  {showGenerateExpense && (
                    <td className="p-3 text-center align-middle">
                      {isPending ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                      ) : (
                        <span className="block w-4 h-4" />
                      )}
                    </td>
                  )}

                  {/* Title */}
                  <td className="p-2 overflow-hidden">
                    <TextCell
                      value={r.title}
                      onChange={(v) => setField(r.id, "title", v)}
                      onCommit={(v) => commitField(r.id, "title", v.slice(0, 250))}
                      saving={isSaving("title")}
                      error={errorOf("title")}
                    />
                  </td>

                  {/* Payment Date */}
                  <td className="p-2 whitespace-nowrap">
                    <input
                      type="date"
                      value={r.paymentDate}
                      onChange={(e) => {
                        setField(r.id, "paymentDate", e.target.value);
                        commitField(r.id, "paymentDate", e.target.value, { refresh: true });
                      }}
                      disabled={isSaving("paymentDate")}
                      className="bg-transparent border border-transparent hover:border-gray-700 focus:border-gray-600 focus:bg-gray-900 rounded-md px-2 py-1 text-sm text-white outline-none"
                    />
                    {isSaving("paymentDate") && <Spin />}
                    {errorOf("paymentDate") && <ErrText msg={errorOf("paymentDate")!} />}
                  </td>

                  {/* Amount */}
                  <td className="p-2 text-right whitespace-nowrap">
                    <NumberCell
                      value={r.amount}
                      onChange={(v) => setField(r.id, "amount", v)}
                      onCommit={(v) => commitField(r.id, "amount", v)}
                      saving={isSaving("amount")}
                      error={errorOf("amount")}
                    />
                  </td>

                  {/* GST */}
                  {showGst && (
                    <td className="p-2">
                      <SelectCell
                        value={r.gstIncluded ? "Yes" : "No"}
                        options={["Yes", "No"]}
                        onChange={(v) => {
                          const bool = v === "Yes";
                          setField(r.id, "gstIncluded", bool);
                          commitField(r.id, "gstIncluded", bool);
                        }}
                        saving={isSaving("gstIncluded")}
                        error={errorOf("gstIncluded")}
                      />
                    </td>
                  )}

                  {/* Payment Type */}
                  <td className="p-2">
                    <SelectCell
                      value={r.paymentType}
                      options={PAYMENT_TYPES}
                      onChange={(v) => {
                        setField(r.id, "paymentType", v);
                        commitField(r.id, "paymentType", v);
                      }}
                      saving={isSaving("paymentType")}
                      error={errorOf("paymentType")}
                      tone="sky"
                    />
                  </td>

                  {/* Category */}
                  {showCategory && (
                    <td className="p-2">
                      <SelectCell
                        value={r.type || categoryOptions[0]}
                        options={categoryOptions}
                        onChange={(v) => {
                          setField(r.id, "type", v);
                          commitField(r.id, "type", v, { refresh: true });
                        }}
                        saving={isSaving("type")}
                        error={errorOf("type")}
                        tone="emerald"
                      />
                    </td>
                  )}

                  {/* Bill No — QB expense number, read-only */}
                  {showGenerateExpense && (
                    <td className="p-2 align-middle">
                      {isGenerating ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                        </span>
                      ) : r.qbExpenseNo ? (
                        <span className="text-green-400 text-xs font-mono">{r.qbExpenseNo}</span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                      {generateErrors[r.id] && <ErrText msg={generateErrors[r.id]!} />}
                    </td>
                  )}

                  {/* Bank Ref */}
                  <td className="p-2 font-mono overflow-hidden">
                    <TextCell
                      value={r.paymentRef}
                      onChange={(v) => setField(r.id, "paymentRef", v)}
                      onCommit={(v) => commitField(r.id, "paymentRef", v.slice(0, 120))}
                      saving={isSaving("paymentRef")}
                      error={errorOf("paymentRef")}
                      mono
                    />
                  </td>

                  {/* Invoice No */}
                  <td className="p-2 font-mono overflow-hidden">
                    <TextCell
                      value={r.invoiceNo}
                      onChange={(v) => setField(r.id, "invoiceNo", v)}
                      onCommit={(v) => commitField(r.id, "invoiceNo", v.slice(0, 80))}
                      saving={isSaving("invoiceNo")}
                      error={errorOf("invoiceNo")}
                      mono
                    />
                  </td>

                  {/* Receipt No */}
                  {showReceiptNo && (
                    <td className="p-2 font-mono overflow-hidden">
                      <TextCell
                        value={r.receiptNo}
                        onChange={(v) => setField(r.id, "receiptNo", v)}
                        onCommit={(v) => commitField(r.id, "receiptNo", v.slice(0, 80))}
                        saving={isSaving("receiptNo")}
                        error={errorOf("receiptNo")}
                        mono
                      />
                    </td>
                  )}

                  {/* Status */}
                  <td className="p-2">
                    <SelectCell
                      value={r.status}
                      options={STATUSES}
                      onChange={(v) => {
                        setField(r.id, "status", v);
                        commitField(r.id, "status", v, { refresh: true });
                      }}
                      saving={isSaving("status")}
                      error={errorOf("status")}
                      tone={r.status === "Settled" ? "green" : "orange"}
                    />
                  </td>

                  {/* Remark */}
                  <td className="p-2 overflow-hidden">
                    <TextCell
                      value={r.remarks}
                      onChange={(v) => setField(r.id, "remarks", v)}
                      onCommit={(v) => commitField(r.id, "remarks", v.slice(0, 500))}
                      saving={isSaving("remarks")}
                      error={errorOf("remarks")}
                    />
                  </td>

                  {/* Delete */}
                  <td className="p-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => deleteRow(r.id)}
                      disabled={deletingId === r.id}
                      title="Delete this transaction"
                      className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TextCell({ value, onChange, onCommit, saving, error, mono }: {
  value: string; onChange: (v: string) => void; onCommit: (v: string) => void;
  saving: boolean; error?: string; mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) return;
    setDraft(value);
  }, [value]);
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        title={draft}
        onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); }
        }}
        disabled={saving}
        className={
          "w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-gray-600 focus:bg-gray-900 rounded-md px-2 py-1 text-sm text-white outline-none text-ellipsis " +
          (mono ? "font-mono " : "") + (error ? "border-red-700" : "")
        }
      />
      {saving && <Spin />}
      {error && <ErrText msg={error} />}
    </div>
  );
}

function NumberCell({ value, onChange, onCommit, saving, error }: {
  value: number; onChange: (v: number) => void; onCommit: (v: number) => void;
  saving: boolean; error?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) return;
    setDraft(String(value));
  }, [value]);
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        onBlur={() => { const n = parseFloat(draft); if (!isNaN(n) && n !== value) onCommit(n); else setDraft(String(value)); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        disabled={saving}
        className={
          "w-24 bg-transparent border border-transparent hover:border-gray-700 focus:border-gray-600 focus:bg-gray-900 rounded-md px-2 py-1 text-sm text-white outline-none text-right " +
          (error ? "border-red-700" : "")
        }
      />
      {saving && <Spin />}
      {error && <ErrText msg={error} />}
    </div>
  );
}

function SelectCell({ value, options, onChange, saving, error, tone }: {
  value: string; options: string[]; onChange: (v: string) => void;
  saving: boolean; error?: string; tone?: "sky" | "emerald" | "green" | "orange";
}) {
  const toneClass =
    tone === "sky" ? "bg-sky-900/40 text-sky-300 hover:bg-sky-900/60"
    : tone === "emerald" ? "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60"
    : tone === "green" ? "bg-green-900/40 text-green-300 hover:bg-green-900/60"
    : tone === "orange" ? "bg-orange-900/40 text-orange-300 hover:bg-orange-900/60"
    : "bg-gray-900 text-gray-200 hover:bg-gray-800";
  return (
    <div className="relative inline-flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        className={
          "appearance-none rounded-md text-xs px-2 py-0.5 cursor-pointer outline-none border border-transparent focus:border-gray-600 transition-colors " +
          toneClass
        }
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-gray-900 text-white">{o}</option>
        ))}
      </select>
      {saving && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
      {error && <ErrText msg={error} />}
    </div>
  );
}

function Col({ id, widths, defaultW }: { id: string; widths: Record<string, number>; defaultW: number }) {
  return <col style={{ width: `${widths[id] ?? defaultW}px` }} />;
}

function ResizableTh({ id, widths, setWidth, defaultW, children, align = "left" }: {
  id: string; widths: Record<string, number>; setWidth: (id: string, w: number) => void;
  defaultW: number; children: React.ReactNode; align?: "left" | "right";
}) {
  const current = widths[id] ?? defaultW;
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    dragState.current = { startX: e.clientX, startW: current };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    setWidth(id, dragState.current.startW + (e.clientX - dragState.current.startX));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  return (
    <th className={"p-3 font-medium whitespace-nowrap relative select-none " + (align === "right" ? "text-right" : "text-left")}>
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setWidth(id, defaultW)}
        title="Drag to resize · double-click to reset"
        className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-gray-700/60 active:bg-sky-700/60"
      />
    </th>
  );
}

function Spin() {
  return (
    <span className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
      <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
    </span>
  );
}

function ErrText({ msg }: { msg: string }) {
  return <p className="text-[10px] text-red-400 mt-0.5 truncate" title={msg}>{msg}</p>;
}
