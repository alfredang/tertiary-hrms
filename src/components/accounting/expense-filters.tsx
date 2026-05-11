"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const STATUS_OPTIONS = ["Pending", "Settled", "All"];

export const EXPENSE_CATEGORY_OPTIONS = [
  "All",
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

export const INCOME_CATEGORY_OPTIONS = ["All", "Income", "Refund", "Other"];

export function ExpenseFilters({
  status,
  category,
  from,
  to,
  categoryOptions = EXPENSE_CATEGORY_OPTIONS,
}: {
  status: string;
  category: string;
  from: string;
  to: string;
  categoryOptions?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value) {
      next.delete(key);
    } else if (key === "category" && value === "All") {
      // Category default is already "All" → just drop the param.
      next.delete(key);
    } else {
      // For status, keep `All` in the URL because the page default is `Pending`,
      // so we need an explicit override to show every row.
      next.set(key, value);
    }
    startTransition(() => {
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    });
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-end gap-3">
      <Field label="Status">
        <select
          value={status}
          onChange={(e) => update("status", e.target.value)}
          disabled={pending}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => update("category", e.target.value)}
          disabled={pending}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white max-w-[200px]"
        >
          {categoryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <input
          type="date"
          value={from}
          onChange={(e) => update("from", e.target.value)}
          disabled={pending}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          value={to}
          onChange={(e) => update("to", e.target.value)}
          disabled={pending}
          className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
        />
      </Field>
      {(status !== "Pending" || category !== "All" || from || to) && (
        <button
          type="button"
          onClick={() => {
            startTransition(() => router.replace("?", { scroll: false }));
          }}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2 rounded-md hover:bg-gray-800"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </label>
  );
}
