// Result page for the one-click Approve / Decline links in the admin approval emails
// (/api/public/{leave,expense,time-off}-approval/respond). Light theme to match the app and
// the approval email itself. Every interpolated string is escaped (names, reasons are user input).

export type ResultTone = "approved" | "declined" | "info" | "error";

export interface SummaryStat {
  label: string;
  value: string;
  hint?: string;
}

export interface ResultSummary {
  heading: string;
  stats: SummaryStat[];
  table?: { columns: string[]; rows: string[][] };
  note?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TONE: Record<ResultTone, { accent: string; soft: string; icon: string }> = {
  approved: { accent: "#16A34A", soft: "#DCFCE7", icon: "&#10003;" },
  declined: { accent: "#DC2626", soft: "#FEE2E2", icon: "&#10005;" },
  info: { accent: "#24396A", soft: "#E0E7F5", icon: "i" },
  error: { accent: "#DC2626", soft: "#FEE2E2", icon: "!" },
};

export function renderSummaryHtml(s: ResultSummary): string {
  const stats = s.stats
    .map(
      (st) =>
        `<div style="flex:1 1 130px;background:#F5F8FC;border:1px solid #E4E9F0;border-radius:12px;padding:14px 12px;">` +
        `<div style="font-size:12px;color:#64748B;">${escapeHtml(st.label)}</div>` +
        `<div style="font-size:22px;font-weight:700;color:#24396A;margin-top:4px;white-space:nowrap;">${escapeHtml(st.value)}</div>` +
        (st.hint ? `<div style="font-size:12px;color:#64748B;margin-top:2px;">${escapeHtml(st.hint)}</div>` : "") +
        `</div>`,
    )
    .join("");

  let table = "";
  if (s.table && s.table.rows.length > 0) {
    const head = s.table.columns
      .map((c, i) => `<th style="text-align:${i === 0 ? "left" : "right"};padding:8px 8px;font-size:12px;color:#64748B;font-weight:600;border-bottom:1px solid #E4E9F0;">${escapeHtml(c)}</th>`)
      .join("");
    const body = s.table.rows
      .map(
        (r) =>
          `<tr>${r
            .map((c, i) => `<td style="text-align:${i === 0 ? "left" : "right"};padding:8px 8px;font-size:14px;color:#0F172A;border-bottom:1px solid #F1F5F9;white-space:nowrap;">${escapeHtml(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    table = `<div style="overflow-x:auto;margin-top:14px;"><table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  return (
    `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #E4E9F0;">` +
    `<h2 style="margin:0 0 8px;font-size:15px;color:#24396A;">${escapeHtml(s.heading)}</h2>` +
    `<div style="display:flex;flex-wrap:wrap;gap:10px;">${stats}</div>` +
    table +
    (s.note ? `<p style="font-size:12px;color:#64748B;margin:12px 0 0;">${escapeHtml(s.note)}</p>` : "") +
    `</div>`
  );
}

export function approvalResultPage(opts: {
  tone: ResultTone;
  title: string;
  message: string;
  summary?: ResultSummary | null;
}): Response {
  const t = TONE[opts.tone];
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
</head><body style="margin:0;background:#EEF2F7;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
<div style="max-width:560px;margin:6vh auto;padding:0 12px;">
<div style="background:#FFFFFF;border:1px solid #E4E9F0;border-radius:16px;padding:clamp(20px,5vw,30px) clamp(16px,5vw,28px);box-shadow:0 20px 50px -20px rgba(15,23,42,.35);">
<div style="width:44px;height:44px;border-radius:12px;background:${t.soft};color:${t.accent};font-size:22px;font-weight:700;line-height:44px;text-align:center;margin-bottom:16px;">${t.icon}</div>
<h1 style="margin:0 0 8px;font-size:22px;color:${opts.tone === "info" ? "#0A1020" : t.accent};">${escapeHtml(opts.title)}</h1>
<p style="margin:0;color:#475569;font-size:15px;line-height:1.55;">${escapeHtml(opts.message)}</p>
${opts.summary ? renderSummaryHtml(opts.summary) : ""}
</div></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
