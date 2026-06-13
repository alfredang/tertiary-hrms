import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

const STATUS = {
  SENT: { cls: "bg-emerald-500/15 text-emerald-400", Icon: CheckCircle2, label: "Sent" },
  FAILED: { cls: "bg-red-500/15 text-red-400", Icon: XCircle, label: "Failed" },
  SKIPPED: { cls: "bg-amber-500/15 text-amber-400", Icon: MinusCircle, label: "Skipped" },
} as const;

export function InviteStatusPill({ status, title }: { status: string; title?: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? STATUS.FAILED;
  const { Icon } = s;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
      title={title}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}
