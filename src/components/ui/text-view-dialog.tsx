"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TextView = { title: string; subtitle?: string; text: string; tone?: string };

/** Full text of a truncated table cell (reason, comment), shown in a dialog. */
export function TextViewDialog({ view, onClose }: { view: TextView | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={!!view} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[90vw] max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border border-gray-800 bg-gray-950 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-medium text-white">{view?.title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-gray-500">{view?.subtitle ?? ""}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-sm text-gray-400 transition-colors hover:text-white">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <p className={cn("max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-sm", view?.tone ?? "text-white")}>
            {view?.text}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** One-line table cell: truncated text; clicking opens the full text via `onOpen`. Empty text shows a dash. */
export function TruncatedTextButton({
  text,
  onOpen,
  tone = "text-white",
  className,
}: {
  text: string | null | undefined;
  onOpen: () => void;
  tone?: string;
  className?: string;
}) {
  if (!text) return <span className="text-xs text-gray-600">—</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Click to read in full"
      className={cn(
        "block max-w-[160px] truncate rounded text-left text-xs hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500",
        tone,
        className,
      )}
    >
      {text}
    </button>
  );
}
