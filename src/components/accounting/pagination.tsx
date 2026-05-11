"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (totalPages <= 1) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-800">
        {total} record{total === 1 ? "" : "s"}
      </div>
    );
  }

  function go(target: number) {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    startTransition(() => {
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    });
  }

  const pages = buildPageList(page, totalPages);
  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);

  return (
    <div className="px-4 py-3 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        Showing <span className="text-gray-300">{startRow.toLocaleString()}</span>–
        <span className="text-gray-300">{endRow.toLocaleString()}</span> of{" "}
        <span className="text-gray-300">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <PgBtn
          onClick={() => go(page - 1)}
          disabled={page <= 1 || pending}
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </PgBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-gray-500 select-none">
              …
            </span>
          ) : (
            <PgBtn
              key={p}
              onClick={() => go(p)}
              disabled={pending}
              active={p === page}
            >
              {p}
            </PgBtn>
          ),
        )}
        <PgBtn
          onClick={() => go(page + 1)}
          disabled={page >= totalPages || pending}
          aria-label="Next"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </PgBtn>
      </div>
    </div>
  );
}

function PgBtn({
  children,
  onClick,
  disabled,
  active,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm transition-colors " +
        (active
          ? "bg-primary text-white"
          : "bg-gray-900 text-gray-300 hover:bg-gray-800") +
        " disabled:opacity-40 disabled:hover:bg-gray-900"
      }
    >
      {children}
    </button>
  );
}

// Pages: 1 2 3 4 5 6 7 if small; otherwise 1 … (page-1) page (page+1) … last.
function buildPageList(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [];
  const window = 1;
  const start = Math.max(2, page - window);
  const end = Math.min(totalPages - 1, page + window);

  out.push(1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}
