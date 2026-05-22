import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import {
  getQBCreds,
  getQBAccessToken,
  qboBase,
  qbQuery,
  qbCreate,
  findPaymentMethod,
} from "@/lib/qb-api";

export const dynamic = "force-dynamic";

// TC invoice pattern — handles hyphens, no-hyphens, and TCS typo; last segment 2–6 chars
const TC_INVOICE_RE = /TC[A-Z]?\d{2}[-\s]?[\w]{4}[-\s]?[\w]{2,6}/gi;

function normaliseInvoiceNo(raw: string): string {
  let s = raw.replace(/\s/g, "-").toUpperCase();
  // Remove accidental extra letter: TCS26-... → TC26-...
  s = s.replace(/^TC([A-Z])(\d{2}-)/, "TC$2");
  // Insert hyphens if missing: TC26051130 → TC26-0511-30, TC260516050377 → TC26-0516-050377
  if (!s.includes("-")) {
    s = s.replace(/^TC(\d{2})(\w{4})(\w+)/, "TC$1-$2-$3");
  }
  return s;
}

// Extract TC26-XXXX-XXXXXX style invoice number from invoiceNo column, then from title
function extractInvoiceNo(invoiceNo: string, title: string): string | null {
  if (invoiceNo?.trim()) return normaliseInvoiceNo(invoiceNo.trim());
  TC_INVOICE_RE.lastIndex = 0;
  const match = title?.match(TC_INVOICE_RE);
  return match ? normaliseInvoiceNo(match[0]) : null;
}

// Strip any TC invoice number pattern from a title to get the pure customer name portion
function extractCustomerName(title: string): string {
  if (!title) return "";
  TC_INVOICE_RE.lastIndex = 0;
  return title
    .replace(TC_INVOICE_RE, "")
    .replace(/^[\s\-|/\\]+|[\s\-|/\\]+$/g, "")
    .trim();
}

// Find QB invoice by DocNumber
async function findInvoiceByDocNumber(base: string, token: string, docNumber: string): Promise<any | null> {
  const safe = docNumber.replace(/'/g, "\\'");
  const res = await qbQuery(base, token, `SELECT * FROM Invoice WHERE DocNumber = '${safe}' MAXRESULTS 1`);
  return res?.QueryResponse?.Invoice?.[0] ?? null;
}

// Noise words and tokens that should never be used as customer name fragments
const NAME_NOISE = new Set([
  "SGD", "USD", "EUR", "GBP", "AUD", "MYR",
  "OTHER", "AND", "THE", "FOR", "VIA", "REF",
  "TRF", "TT", "FAST", "PAYNOW", "GIRO", "ATM",
  "INWARD", "OUTWARD", "TELEGRAPHIC", "TRANSFER",
  "PAYMENT", "RECEIPT", "CREDIT", "DEBIT",
]);

// Find QB customer by DisplayName using a sliding window over cleaned alphabetic words.
// Handles titles like "Jeffrey teo PIB26... C11... OTHER TEO LENG KWANG JEFFREY 2026..."
// by removing digit-containing tokens and trying every consecutive-word window (longest first).
async function findCustomerByName(base: string, token: string, name: string): Promise<any | null> {
  if (!name || !/[a-zA-Z]/.test(name)) return null;

  // Keep only purely alphabetic tokens of 2+ chars that aren't noise words
  const words = name.trim().split(/\s+/).filter(
    (w) => /^[a-zA-Z]+$/.test(w) && w.length >= 2 && !NAME_NOISE.has(w.toUpperCase()),
  );
  if (words.length === 0) return null;

  // Try all consecutive-word windows from longest to shortest (min 2 words)
  for (let size = words.length; size >= 2; size--) {
    for (let start = 0; start <= words.length - size; start++) {
      const search = words.slice(start, start + size).join(" ");
      const safe = search.replace(/'/g, "\\'").replace(/%/g, "\\%");
      const res = await qbQuery(
        base,
        token,
        `SELECT * FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 5`,
      );
      const customers: any[] = res?.QueryResponse?.Customer ?? [];
      if (customers.length > 0) return customers[0];
    }
  }
  return null;
}

// Find open invoice for a customer, prefer one with a matching amount
async function findInvoiceForCustomer(
  base: string,
  token: string,
  customerId: string,
  amount: number,
): Promise<any | null> {
  const res = await qbQuery(
    base,
    token,
    `SELECT * FROM Invoice WHERE CustomerRef = '${customerId}' AND Balance > '0' MAXRESULTS 20`,
  );
  const invoices: any[] = res?.QueryResponse?.Invoice ?? [];
  if (!invoices.length) return null;
  const exact = invoices.find((inv) => Math.abs(Number(inv.TotalAmt) - amount) < 0.01);
  return exact ?? invoices[0];
}

async function authorize(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  const role = (session.user as any).role as string | undefined;
  const roles = ((session.user as any).roles as string[] | undefined) ?? [];
  return hasAdminAccess(role) || roles.includes("ACCOUNTANT");
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorize())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Transaction id required" }, { status: 400 });

    const txn = await prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (txn.direction !== "CREDIT") {
      return NextResponse.json({ error: "Only income (CREDIT) records can receive QB payment" }, { status: 400 });
    }
    if (txn.status === "Settled" && txn.qbExpenseId) {
      return NextResponse.json({ ok: true, alreadySettled: true, qbPaymentNo: txn.qbExpenseNo });
    }

    const creds = await getQBCreds();
    if (!creds) {
      return NextResponse.json(
        { error: "QuickBooks credentials not configured. Go to Settings → Credentials." },
        { status: 503 },
      );
    }

    const token = await getQBAccessToken(creds);
    const base = qboBase(creds.realmId);

    const [bankRes, pmRes] = await Promise.all([
      qbQuery(base, token, "SELECT * FROM Account WHERE AccountType = 'Bank' MAXRESULTS 100"),
      qbQuery(base, token, "SELECT * FROM PaymentMethod MAXRESULTS 100"),
    ]);
    const bankAccounts: any[] = bankRes?.QueryResponse?.Account ?? [];
    const paymentMethods: any[] = pmRes?.QueryResponse?.PaymentMethod ?? [];

    // Deposit To: DBS Bank (static)
    const dbsAccount =
      bankAccounts.find((a: any) => String(a.Name ?? "").toLowerCase().includes("dbs")) ??
      bankAccounts[0];
    if (!dbsAccount) {
      return NextResponse.json({ error: "No bank account found in QuickBooks." }, { status: 422 });
    }

    const amount = Number(txn.amount);
    const dateStr = txn.paymentDate.toISOString().slice(0, 10);

    // 1. Extract invoice number from invoiceNo field or title
    const invoiceNo = extractInvoiceNo(txn.invoiceNo ?? "", txn.title);

    // 2. Find QB Invoice — by DocNumber first, then by customer name
    let qbInvoice: any = null;
    if (invoiceNo) {
      qbInvoice = await findInvoiceByDocNumber(base, token, invoiceNo);
    }
    if (!qbInvoice) {
      // Use customer name extracted from title (TC invoice pattern removed, skip if purely numeric)
      const customerName = extractCustomerName(txn.title);
      const customer = await findCustomerByName(base, token, customerName || txn.title);
      if (customer) {
        qbInvoice = await findInvoiceForCustomer(base, token, String(customer.Id), amount);
      }
    }

    if (!qbInvoice) {
      return NextResponse.json(
        {
          error: `No matching QuickBooks invoice found for "${txn.title}"${invoiceNo ? ` (invoice: ${invoiceNo})` : ""}`,
        },
        { status: 422 },
      );
    }

    const qbBalance = Number(qbInvoice.Balance ?? 0);
    const qbTotal = Number(qbInvoice.TotalAmt ?? 0);

    // Already fully paid in QB — just mark HRMS settled
    if (qbBalance <= 0.005) {
      await prisma.bankTransaction.update({
        where: { id },
        data: {
          status: "Settled",
          qbExpenseId: String(qbInvoice.Id),
          qbExpenseNo: qbInvoice.DocNumber ?? String(qbInvoice.Id),
        },
      });
      return NextResponse.json({
        ok: true,
        alreadyPaidInQB: true,
        qbPaymentNo: qbInvoice.DocNumber ?? String(qbInvoice.Id),
      });
    }

    // Verify QB invoice total covers the HRMS amount
    if (qbTotal < amount - 0.01) {
      return NextResponse.json(
        { error: `QB invoice total (${qbTotal.toFixed(2)}) is less than HRMS amount (${amount.toFixed(2)})` },
        { status: 422 },
      );
    }

    // Cap payment to remaining balance to avoid overpayment
    const paymentAmount = Math.min(amount, qbBalance);

    // QB doc_num limit is 21 chars — use bank ref when available, fall back to invoice number
    const rawRef = txn.paymentRef?.trim() || invoiceNo || qbInvoice.DocNumber || "";
    const paymentRefNum = rawRef.slice(0, 21);

    const qbPaymentMethod = findPaymentMethod(paymentMethods, txn.paymentType);

    const paymentBody: Record<string, any> = {
      CustomerRef: {
        value: String(qbInvoice.CustomerRef?.value ?? ""),
        name: String(qbInvoice.CustomerRef?.name ?? ""),
      },
      TxnDate: dateStr,
      TotalAmt: paymentAmount,
      DepositToAccountRef: { value: String(dbsAccount.Id), name: dbsAccount.Name },
      PaymentRefNum: paymentRefNum,
      Line: [
        {
          Amount: paymentAmount,
          LinkedTxn: [{ TxnId: String(qbInvoice.Id), TxnType: "Invoice" }],
        },
      ],
    };
    if (qbPaymentMethod) {
      paymentBody.PaymentMethodRef = { value: String(qbPaymentMethod.Id), name: qbPaymentMethod.Name };
    }

    const qbData = await qbCreate(base, token, "payment", paymentBody);
    const qbPaymentId = String(qbData?.Payment?.Id ?? qbData?.Id ?? "");
    const qbPaymentNo = paymentRefNum || qbInvoice.DocNumber || qbPaymentId;

    await prisma.bankTransaction.update({
      where: { id },
      data: { status: "Settled", qbExpenseId: qbPaymentId, qbExpenseNo: qbPaymentNo },
    });

    return NextResponse.json({ ok: true, qbPaymentNo, qbPaymentId });
  } catch (err: any) {
    console.error("[receive-payment]", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
