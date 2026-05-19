import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

export const dynamic = "force-dynamic";

const QBO_BASE_URL = "https://quickbooks.api.intuit.com";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

async function getQBCreds() {
  const rows = await prisma.companyCredential.findMany({
    where: {
      keyName: {
        in: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REFRESH_TOKEN", "QUICKBOOKS_REALM_ID"],
      },
    },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.keyName] = r.keyValue;
  const { QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN, QUICKBOOKS_REALM_ID } = map;
  if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET || !QUICKBOOKS_REFRESH_TOKEN || !QUICKBOOKS_REALM_ID) {
    return null;
  }
  return {
    clientId: QUICKBOOKS_CLIENT_ID,
    clientSecret: QUICKBOOKS_CLIENT_SECRET,
    refreshToken: QUICKBOOKS_REFRESH_TOKEN,
    realmId: QUICKBOOKS_REALM_ID,
  };
}

async function getAccessToken(creds: Awaited<ReturnType<typeof getQBCreds>> & {}) {
  const basic = Buffer.from(`${creds!.clientId}:${creds!.clientSecret}`).toString("base64");
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(creds!.refreshToken)}`,
  });
  if (!res.ok) throw new Error(`QB token refresh failed: ${res.status}`);
  const data = await res.json();
  if (data.refresh_token && data.refresh_token !== creds!.refreshToken) {
    await prisma.companyCredential.upsert({
      where: { keyName: "QUICKBOOKS_REFRESH_TOKEN" },
      update: { keyValue: data.refresh_token },
      create: { keyName: "QUICKBOOKS_REFRESH_TOKEN", keyValue: data.refresh_token },
    });
  }
  return data.access_token as string;
}

async function qbQuery(base: string, token: string, query: string) {
  const url = `${base}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`QB query failed: ${res.status}`);
  return res.json();
}

async function qbCreate(base: string, token: string, entity: string, body: object) {
  const url = `${base}/${entity}?minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Message ?? `QB error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const QB_PAYMENT_TYPE: Record<string, string> = {
  CC: "CreditCard",
  Cash: "Cash",
};
function toQbPaymentType(t: string) {
  return QB_PAYMENT_TYPE[t] ?? "Check";
}

// Category → QB expense account name (best-effort match)
const CATEGORY_ACCOUNT: Record<string, string[]> = {
  "Trainer Fee": ["Trainer Fee", "Trainer Fees", "Professional Fees", "Subcontractors"],
  "Payroll": ["Salaries", "Wages", "Payroll"],
  "CPF": ["CPF", "Employee Benefits", "Employer Contributions"],
  "Income Tax": ["Income Tax", "Taxes"],
  "Rental": ["Rent", "Rental"],
  "Subscription": ["Computer", "Internet", "Software", "Subscription"],
  "Bank Charges": ["Bank Charges", "Bank Fees", "Service Charge"],
  "Allowance": ["Allowance", "Employee Benefits"],
  "Vendor Payment": ["Purchases", "Cost of Goods Sold", "General"],
  "Payment Processor": ["Merchant Fees", "Bank Charges"],
  "Grocery": ["Meals", "Entertainment", "Office Supplies"],
  "Meal": ["Meals", "Entertainment"],
  "Entertainment": ["Entertainment"],
};

function findQbAccount(accounts: any[], keywords: string[]): any | null {
  for (const kw of keywords) {
    const found = accounts.find((a: any) =>
      (a.Name as string).toLowerCase().includes(kw.toLowerCase()) ||
      (a.FullyQualifiedName as string ?? "").toLowerCase().includes(kw.toLowerCase()),
    );
    if (found) return found;
  }
  return null;
}

function buildDocNumber(dateStr: string, seq: number): string {
  const d = new Date(dateStr);
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const base = `TX${yy}${mm}${dd}`;
  return seq > 1 ? `${base}-${seq}` : base;
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
  if (!(await authorize())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Transaction id required" }, { status: 400 });

  const txn = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (txn.direction !== "DEBIT") return NextResponse.json({ error: "Only expense (DEBIT) records can be sent to QB" }, { status: 400 });
  if (txn.status === "Settled" && txn.qbExpenseId) {
    return NextResponse.json({ error: "Already settled in QuickBooks", qbExpenseNo: txn.qbExpenseNo }, { status: 409 });
  }

  const creds = await getQBCreds();
  if (!creds) return NextResponse.json({ error: "QuickBooks credentials not configured. Go to Settings → Credentials." }, { status: 503 });

  let token: string;
  try {
    token = await getAccessToken(creds);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  const base = `${QBO_BASE_URL}/v3/company/${creds.realmId}`;

  // Fetch QB accounts
  let bankAccounts: any[] = [];
  let expenseAccounts: any[] = [];
  try {
    const bankRes = await qbQuery(base, token, "SELECT * FROM Account WHERE AccountType = 'Bank' MAXRESULTS 100");
    bankAccounts = bankRes?.QueryResponse?.Account ?? [];
    const expRes = await qbQuery(base, token, "SELECT * FROM Account WHERE Classification = 'Expense' MAXRESULTS 200");
    expenseAccounts = expRes?.QueryResponse?.Account ?? [];
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to fetch QB accounts: ${e.message}` }, { status: 502 });
  }

  // Find bank account — prefer DBS, fallback to first bank account
  const bankAccount =
    findQbAccount(bankAccounts, ["DBS", "Checking", "Current"]) ?? bankAccounts[0];
  if (!bankAccount) {
    return NextResponse.json({ error: "No bank account found in QuickBooks. Please set up a bank account first." }, { status: 422 });
  }

  // Find expense account based on category
  const categoryKeywords = CATEGORY_ACCOUNT[txn.type] ?? ["General", "Expenses", "Operating"];
  const expenseAccount =
    findQbAccount(expenseAccounts, categoryKeywords) ??
    findQbAccount(expenseAccounts, ["General", "Operating", "Administrative", "Expenses"]) ??
    expenseAccounts[0];
  if (!expenseAccount) {
    return NextResponse.json({ error: "No expense account found in QuickBooks. Please set up expense accounts first." }, { status: 422 });
  }

  // Build DocNumber TXYYMMDD with sequence for same-day duplicates
  const dateStr = txn.paymentDate.toISOString().slice(0, 10);
  const sameDay = await prisma.bankTransaction.count({
    where: { qbExpenseNo: { startsWith: `TX${dateStr.slice(2, 4)}${dateStr.slice(5, 7)}${dateStr.slice(8, 10)}` } },
  });
  const docNumber = buildDocNumber(dateStr, sameDay + 1);

  const purchaseBody = {
    DocNumber: docNumber,
    TxnDate: dateStr,
    PaymentType: toQbPaymentType(txn.paymentType),
    AccountRef: { value: String(bankAccount.Id), name: bankAccount.Name },
    Line: [
      {
        Amount: Number(txn.amount),
        DetailType: "AccountBasedExpenseLineDetail",
        Description: txn.title.slice(0, 4000),
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: String(expenseAccount.Id), name: expenseAccount.Name },
          BillableStatus: "NotBillable",
        },
      },
    ],
    PrivateNote: `HRMS import · ${txn.paymentType} · ${txn.rawDescription.slice(0, 500)}`,
  };

  let qbData: any;
  try {
    qbData = await qbCreate(base, token, "purchase", purchaseBody);
  } catch (e: any) {
    return NextResponse.json({ error: `QuickBooks error: ${e.message}` }, { status: 502 });
  }

  const qbExpenseId = String(qbData?.Purchase?.Id ?? qbData?.Id ?? "");
  const qbExpenseNo = docNumber;

  await prisma.bankTransaction.update({
    where: { id },
    data: { status: "Settled", qbExpenseId, qbExpenseNo },
  });

  return NextResponse.json({ ok: true, qbExpenseNo, qbExpenseId });
}
