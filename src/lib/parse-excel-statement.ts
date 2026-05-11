import * as XLSX from "xlsx";

export interface ParsedTransaction {
  paymentDate: string;
  title: string;
  amount: number;
  type: string;
  gstIncluded: boolean;
  recurring: string;
  remarks: string;
  rawDescription: string;
  direction: "DEBIT" | "CREDIT";
  paymentType: string;
  paymentRef: string;
  invoiceNo: string;
}

function extractInvoiceNo(desc: string): string {
  // Common invoice patterns: TC26-0501-000951, INV-19604, Invoice TC25-1028-08, PF-100041159
  const patterns = [
    /\b(TC\d{2}-\d{3,4}-[A-Z0-9]+)\b/i,
    /\b(INV-\d{3,8})\b/i,
    /\b(PF-\d{4,10})\b/i,
    /\b(FTB-\d{4}-\d{3,6})\b/i,
    /Invoice\s+([A-Z0-9-]{5,30})/i,
    /Inv\s+([A-Z0-9-]{5,30})/i,
  ];
  for (const re of patterns) {
    const m = desc.match(re);
    if (m && m[1]) return m[1].slice(0, 60);
  }
  return "";
}

function extractPaymentRef(parts: string[]): string {
  // DBS refs look like EBGPP6050..., EBLVT604..., MCT202605..., IPS7785...,
  // 20260504DBSSSGSGBRT..., long alphanumeric, often >= 18 chars.
  const candidates: string[] = [];
  for (const p of parts) {
    const tokens = p.split(/\s+/);
    for (const t of tokens) {
      if (/^[A-Z0-9]{14,}$/i.test(t)) candidates.push(t);
    }
  }
  if (candidates.length === 0) return "";
  // Prefer the longest token (most specific ref)
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].slice(0, 80);
}

/**
 * Payment type is inferred primarily from Description 1 (the DBS transaction-
 * type marker, i.e. `descParts[0]`), falling back to the full description.
 * Allowed values: GIRO | Bank Transfer | PayNow | CC | Cash | e-invoice.
 */
export function detectPaymentType(descParts: string[], rawDescription: string): string {
  const marker = (descParts[0] ?? "").toUpperCase();
  const full = rawDescription.toUpperCase();
  const test = (re: RegExp) => re.test(marker) || re.test(full);

  // Card-processor signals win over Cash because "CASH DISBURSEMENT" often
  // appears as boilerplate in counterparty descriptions (e.g. Stripe payouts)
  // when the real marker is FAST PAYMENT. Order matters here.
  if (test(/BUSINESS ADVANCE CARD|CREDIT CARD|\bBAT\b|STRIPE|VISA|MASTERCARD|HITPAY/)) {
    return "CC";
  }
  if (test(/PAYNOW/)) return "PayNow";
  if (test(/\bGIRO\b|INTERBANK GIRO|IBG GIRO|GIRO PAYROLL|GIRO PAYMENT|GIRO COLLECTION/)) {
    return "GIRO";
  }
  // Cash only when the marker explicitly says so — don't let stray "CASH" text
  // inside a description trigger this.
  if (/\bCASH\b|CASH DISBURSEMENT|CASH WITHDRAWAL/.test(marker)) return "Cash";
  if (/INVOICE PAYMENT|FAST PAYMENT INVOICE/i.test(marker)) return "Bank Transfer";
  if (/INVOICE|INV-|\bTC\d{2}-|\bPF-\d|\bFTB-\d/i.test(rawDescription)) return "e-invoice";
  return "Bank Transfer";
}

/**
 * Picks the most human-meaningful label out of a transaction's description
 * parts: prefers a payer/payee name (capitalised words, not the txn-type marker).
 */
/**
 * Strip a trailing identifier (UEN, NRIC, SkillsFuture claim ID, bank ref,
 * long numeric ref) from a counterparty name. Returns `{ name, ref }` so the
 * caller can route the ref to `paymentRef`.
 */
export function splitNameAndRef(label: string): { name: string; ref: string } {
  const trimmed = label.trim();

  // Don't try to split when the tail contains an invoice-like pattern
  // (TC26-0501-000951, INV-19604, PF-100041159, FTB-2605-001321) — those should
  // be routed to invoiceNo by extractInvoiceNo(), not chopped in half here.
  const invoicePattern = /\b(TC\d{2}-\d{3,4}-[A-Z0-9]+|INV-\d{3,8}|PF-\d{4,10}|FTB-\d{4}-\d{3,6})\b/i;
  if (invoicePattern.test(trimmed)) {
    // Strip the invoice ref off the name if it sits at the tail.
    const m = trimmed.match(
      /^(.*?)\s*[–\-—\/]\s*(TC\d{2}-\d{3,4}-[A-Z0-9]+|INV-\d{3,8}|PF-\d{4,10}|FTB-\d{4}-\d{3,6})\s*$/i,
    );
    if (m && m[1].trim()) return { name: m[1].trim(), ref: "" };
    return { name: trimmed, ref: "" };
  }

  // Identifier-tail patterns: numeric ref, UEN/NRIC/FIN, long alphanumeric.
  const sep = trimmed.match(/^(.*?)\s*[–\-—\/]\s*([A-Z0-9]{6,})\s*$/i);
  if (!sep) return { name: trimmed, ref: "" };
  const name = sep[1].trim();
  const ref = sep[2].trim();
  const isIdLike =
    /^\d{6,}$/.test(ref) ||
    /^\d{8,9}[A-Z]$/i.test(ref) ||
    /^[STFG]\d{7}[A-Z]$/i.test(ref) ||
    /^[A-Z0-9]{8,}$/i.test(ref);
  if (!isIdLike || !name) return { name: trimmed, ref: "" };
  return { name, ref };
}

function pickTitle(parts: string[], rawDesc: string): string {
  const isJunk = (s: string) => {
    const u = s.toUpperCase().trim();
    if (!u) return true;
    if (u.length < 4) return true;
    if (/^SGD\s/i.test(s)) return true;
    if (/^\d/.test(s)) return true; // ref codes / amounts
    if (/^[A-Z0-9]{16,}$/.test(s)) return true; // long alphanumeric refs
    if (
      [
        "OTHER",
        "OTHR",
        "ALLW",
        "CASH DISBURSEMENT",
        "INWARD PAYNOW",
        "PAYNOW TRANSFER",
        "FAST PAYMENT",
        "INTERBANK GIRO",
        "GIRO",
        "GIRO PAYROLL",
        "GIRO PAYMENT",
        "REMITTANCE TRANSFER OF FUNDS",
        "SERVICE CHARGE FOR PAYNOW PAYMENTS",
        "SERVICE CHARGE FOR FAST PAYMENT",
        "SERVICE CHARGE FOR PROCESSING OF IDEAL TRANSACTIONS",
        "BUSINESS ADVANCE CARD TRANSACTION",
        "PAYMENT OF FEES & CHARGES",
        "INVOICE PAYMENT",
        "SUPPLIER PAYMENT",
        "BUSINESS EXPENSES",
        "REFUND",
      ].includes(u)
    )
      return true;
    return false;
  };
  const candidate = parts.find((p) => !isJunk(p));
  if (candidate) return candidate.slice(0, 120);
  // Fallback to first non-empty part, then raw
  return (parts[0] ?? rawDesc).slice(0, 120) || "Transaction";
}

export function computeDedupeKey(t: {
  paymentDate: string;
  amount: number;
  direction: string;
  rawDescription: string;
}): string {
  const norm = t.rawDescription.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
  return `${t.paymentDate}|${t.direction}|${t.amount.toFixed(2)}|${norm}`;
}

export function categorize(desc: string): string {
  const u = desc.toUpperCase();
  if (u.includes("SERVICE CHARGE")) return "Bank Charges";
  if (u.includes("GIRO PAYROLL") || u.includes("PAYROLL")) return "Payroll";
  if (u.includes("CPF ") || u.includes("CPF BOARD")) return "CPF";
  if (u.includes("IRAS")) return "Income Tax";
  if (u.includes("ALLW") || u.includes("ALLOWANCE") || u.includes("INTERN ")) return "Allowance";
  if (u.includes("REFUND")) return "Refund";
  if (u.includes("STRIPE") || u.includes("HITPAY") || u.includes("2C2P")) return "Payment Processor";
  if (
    u.includes("GOOGLE") ||
    u.includes("MICROSOFT") ||
    u.includes("OPENAI") ||
    u.includes("ANTHROPIC") ||
    u.includes("GITHUB") ||
    u.includes("NOTION") ||
    u.includes("VERCEL") ||
    u.includes("AWS ") ||
    u.includes("PAYPAL") ||
    u.includes("BUSINESS ADVANCE CARD")
  ) {
    return "Subscription";
  }
  if (
    u.includes("RENTAL") ||
    u.includes("N9 OFFICES") ||
    u.includes("MGT CORP") ||
    u.includes("MANAGEMENT CORPORATION") ||
    u.includes("WSQ MF")
  ) {
    return "Rental";
  }
  if (u.includes("NTUC") || u.includes("SHENG SIONG") || u.includes("FAIRPRICE") || u.includes("COLD STORAGE") || u.includes("GIANT ")) {
    return "Grocery";
  }
  if (u.includes("GRABFOOD") || u.includes("DELIVEROO") || u.includes("FOODPANDA") || u.includes("RESTAURANT") || u.includes("CAFE")) {
    return "Meal";
  }
  if (u.includes("CINEMA") || u.includes(" KTV") || u.includes(" CLUB ")) return "Entertainment";
  if (u.includes("INTERBANK GIRO") || u.includes("REMITTANCE")) return "Vendor Payment";
  if (u.includes("FAST PAYMENT") && (u.includes("CLASS") || u.includes("CLASSES") || u.includes("FEES & CHARGES"))) return "Trainer Fee";
  if (u.includes("FAST PAYMENT")) return "Vendor Payment";
  return "Other";
}

function normHeader(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
      .toISOString()
      .slice(0, 10);
  }
  const s = String(value).trim();
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  let m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{4})$/);
  if (m) {
    const mm = months[m[2].toLowerCase()];
    if (mm !== undefined) {
      return new Date(Date.UTC(parseInt(m[3]), mm, parseInt(m[1]))).toISOString().slice(0, 10);
    }
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
      .toISOString()
      .slice(0, 10);
  }
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])))
      .toISOString()
      .slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[,\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const DATE_HEADERS = ["transaction date", "date", "txn date", "value date", "posting date"];
const DEBIT_HEADERS = ["debit", "debit amount", "withdrawal", "withdrawal amount", "amount debit"];
const CREDIT_HEADERS = ["credit", "credit amount", "deposit", "deposit amount", "amount credit"];
const DESC_HEADERS_PREFIX = [
  "transaction details",
  "transaction description",
  "description",
  "details",
  "narrative",
  "particulars",
  "reference",
];

/**
 * Reads .xls or .xlsx via SheetJS. Returns rows as arrays of cells (strings/Dates/numbers).
 */
export function readWorkbookRows(buffer: Buffer): { sheet: string; rows: unknown[][] }[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
    return { sheet: name, rows };
  });
}

export async function parseExcelStatement(buffer: Buffer): Promise<ParsedTransaction[]> {
  const sheets = readWorkbookRows(buffer);
  const transactions: ParsedTransaction[] = [];

  for (const { rows } of sheets) {
    // Find header row by scanning first 30 rows
    let headerIdx = -1;
    let cols: { date: number; debit: number; credit: number; desc: number[] } | null = null;

    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const headers = (rows[r] ?? []).map(normHeader);
      const dateIdx = headers.findIndex((h) => h && DATE_HEADERS.includes(h));
      const debitIdx = headers.findIndex((h) => h && DEBIT_HEADERS.includes(h));
      const creditIdx = headers.findIndex((h) => h && CREDIT_HEADERS.includes(h));
      const descIdxs = headers
        .map((h, i) => (h && DESC_HEADERS_PREFIX.some((p) => h.startsWith(p)) ? i : -1))
        .filter((i) => i >= 0);

      if (dateIdx >= 0 && debitIdx >= 0 && creditIdx >= 0) {
        headerIdx = r;
        cols = {
          date: dateIdx,
          debit: debitIdx,
          credit: creditIdx,
          desc: descIdxs.length ? descIdxs : [],
        };
        break;
      }
    }

    if (headerIdx < 0 || !cols) continue;

    // Fallback for description: take all other non-key, non-running-balance cols
    if (cols.desc.length === 0) {
      const headers = (rows[headerIdx] ?? []).map(normHeader);
      for (let i = 0; i < headers.length; i++) {
        if (i === cols.date || i === cols.debit || i === cols.credit) continue;
        if (headers[i].includes("running balance") || headers[i].includes("balance")) continue;
        cols.desc.push(i);
      }
    }

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const date = parseExcelDate(row[cols.date]);
      if (!date) continue;

      const debit = toNumber(row[cols.debit]);
      const credit = toNumber(row[cols.credit]);
      if (debit <= 0 && credit <= 0) continue;

      const descParts: string[] = [];
      for (const c of cols.desc) {
        const v = row[c];
        if (v !== null && v !== undefined && String(v).trim()) {
          descParts.push(String(v).trim());
        }
      }
      const rawDescription = descParts.join(" | ");
      const rawTitle = pickTitle(descParts, rawDescription);
      const split = splitNameAndRef(rawTitle);
      const title = split.name;
      const paymentType = detectPaymentType(descParts, rawDescription);
      const paymentRef = extractPaymentRef(descParts) || split.ref;
      const invoiceNo = extractInvoiceNo(rawDescription);

      if (debit > 0) {
        transactions.push({
          paymentDate: date,
          title,
          amount: debit,
          type: categorize(rawDescription),
          gstIncluded: true,
          recurring: "One Time",
          remarks: "",
          rawDescription,
          direction: "DEBIT",
          paymentType,
          paymentRef,
          invoiceNo,
        });
      }
      if (credit > 0) {
        transactions.push({
          paymentDate: date,
          title,
          amount: credit,
          type: "Income",
          gstIncluded: false,
          recurring: "One Time",
          remarks: "",
          rawDescription,
          direction: "CREDIT",
          paymentType,
          paymentRef,
          invoiceNo,
        });
      }
    }
  }

  return transactions;
}
