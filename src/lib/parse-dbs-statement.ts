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
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const DATE_RE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(.*)$/;
const NUM = /^-?[\d,]+\.\d{2}$/;

function parseDate(d: number, m: string, y: number): string {
  const mm = MONTHS[m];
  if (mm === undefined) return "";
  const dt = new Date(Date.UTC(y, mm, d));
  return dt.toISOString().slice(0, 10);
}

function num(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function categorize(desc: string): string {
  const u = desc.toUpperCase();
  if (u.includes("SERVICE CHARGE")) return "Bank Charges";
  if (u.includes("GIRO PAYROLL") || u.includes("PAYROLL")) return "Payroll";
  if (u.includes("CPF ")) return "CPF";
  if (u.includes("IRAS")) return "Tax";
  if (u.includes("ALLW") || u.includes("ALLOWANCE") || u.includes("INTERN ")) return "Allowance";
  if (u.includes("REFUND")) return "Refund";
  if (u.includes("STRIPE") || u.includes("HITPAY")) return "Payment Processor";
  if (u.includes("GOOGLE") || u.includes("PAYPAL") || u.includes("BUSINESS ADVANCE CARD")) return "Subscription";
  if (u.includes("RENTAL") || u.includes("N9 OFFICES") || u.includes("MGT CORP") || u.includes("MANAGEMENT CORPORATION")) return "Rent";
  if (u.includes("INTERBANK GIRO") || u.includes("REMITTANCE")) return "Vendor Payment";
  if (u.includes("FAST PAYMENT") && (u.includes("CLASS") || u.includes("CLASSES") || u.includes("FEES & CHARGES"))) return "Trainer Fee";
  if (u.includes("FAST PAYMENT")) return "Vendor Payment";
  return "Other";
}

/**
 * Parses a DBS bank statement PDF text into transactions.
 * Returns only DEBIT transactions (expenses) per requirements.
 */
export function parseDbsStatement(rawText: string): ParsedTransaction[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());

  // Locate "Opening Balance : <amount>" to anchor running-balance comparison.
  let prevBalance: number | null = null;
  for (const l of lines) {
    const m = l.match(/Opening Balance\s*:\s*([\d,]+\.\d{2})/);
    if (m) {
      prevBalance = num(m[1]);
      break;
    }
  }

  // Group lines into transaction blocks: each block starts with a line matching
  // "DD-MMM-YYYY DD-MMM-YYYY <description-start>".
  type Block = { dateLine: string; body: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  const skipPrefixes = [
    "Date Value Date Transaction Details",
    "Printed By",
    "Printed On",
    "Account Number",
    "Account Name",
    "Product Type",
    "Opening Balance",
    "Ledger Balance",
    "Available Balance",
    "Total Debit",
    "Total Credit",
    "Deposit Insurance",
    "Until 31 March",
    "Apr 2024",
    "and other investment",
    "Transactions performed",
    "If date requested",
    "**END OF REPORT**",
    "Account Details",
  ];

  for (const line of lines) {
    if (!line) continue;
    if (skipPrefixes.some((p) => line.startsWith(p))) continue;

    const dm = line.match(DATE_RE);
    if (dm) {
      if (current) blocks.push(current);
      current = { dateLine: line, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) blocks.push(current);

  const txns: ParsedTransaction[] = [];

  for (const block of blocks) {
    const dm = block.dateLine.match(DATE_RE)!;
    const date = parseDate(parseInt(dm[1], 10), dm[2], parseInt(dm[3], 10));
    const firstDescPart = dm[7].trim();

    // The last non-empty line should contain the amount + running balance,
    // e.g. "1,721.67  863,493.06". Some lines also have just the balance.
    // Walk from the bottom to find a line with two numeric tokens.
    let amount: number | null = null;
    let balance: number | null = null;
    let amountLineIdx = -1;
    for (let i = block.body.length - 1; i >= 0; i--) {
      const parts = block.body[i].split(/\s+/);
      const tail = parts.slice(-2);
      if (tail.length === 2 && NUM.test(tail[0]) && NUM.test(tail[1])) {
        amount = num(tail[0]);
        balance = num(tail[1]);
        amountLineIdx = i;
        break;
      }
    }

    if (amount === null || balance === null) {
      // Skip malformed
      continue;
    }

    // Description = first-line-tail + all body lines EXCEPT the amount line and
    // any trailing "SGD <num>" pre-summary line.
    const descLines: string[] = [firstDescPart];
    for (let i = 0; i < amountLineIdx; i++) {
      const l = block.body[i];
      // Strip the "SGD 1721.67" duplicate marker line
      if (/^SGD\s+[\d.,]+$/.test(l)) continue;
      descLines.push(l);
    }
    const rawDesc = descLines.join(" | ").trim();
    const title = descLines[0].slice(0, 120);

    let direction: "DEBIT" | "CREDIT" = "DEBIT";
    if (prevBalance !== null) {
      const diff = balance - prevBalance;
      // floating point tolerance
      if (Math.abs(diff - amount) < 0.01) direction = "CREDIT";
      else if (Math.abs(-diff - amount) < 0.01) direction = "DEBIT";
      else {
        // Fallback: if balance went down, it's debit
        direction = diff < 0 ? "DEBIT" : "CREDIT";
      }
    }
    prevBalance = balance;

    if (direction !== "DEBIT") continue;

    txns.push({
      paymentDate: date,
      title,
      amount,
      type: categorize(rawDesc),
      gstIncluded: false,
      recurring: "One Time",
      remarks: "",
      rawDescription: rawDesc,
      direction,
    });
  }

  return txns;
}
