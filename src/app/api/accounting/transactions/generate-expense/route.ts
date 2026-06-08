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

const QB_PAYMENT_TYPE: Record<string, string> = {
  CC: "CreditCard",
  "Credit Card": "CreditCard",
  Cash: "Cash",
  Check: "Check",
  Cheque: "Check",
};
function toQbPaymentType(t: string): string {
  return QB_PAYMENT_TYPE[t] ?? "Cash";
}


const CATEGORY_ACCOUNT: Record<string, string[]> = {
  "Trainer Fee":      ["Trainer Fee", "Trainer Fees", "Professional Fees", "Subcontractors"],
  "Payroll":          ["Salaries", "Wages", "Payroll"],
  "CPF":              ["CPF", "Employee Benefits", "Employer Contributions"],
  "Income Tax":       ["Income Tax", "Taxes"],
  "Rental":           ["Rent", "Rental"],
  "Subscription":     ["Subscription", "Computer", "Internet", "Software"],
  "Bank Charges":     ["Bank Charges", "Bank Fees", "Service Charge"],
  "Allowance":        ["Allowance", "Employee Benefits"],
  "Vendor Payment":   ["Purchases", "Cost of Goods", "General"],
  "Payment Processor":["Merchant Fees", "Bank Charges"],
  "Grocery":          ["Meals", "Entertainment", "Office"],
  "Meal":             ["Meals", "Entertainment"],
  "Entertainment":    ["Entertainment"],
};

function findAccount(accounts: any[], keywords: string[]): any | null {
  // Exact name match first
  for (const kw of keywords) {
    const found = accounts.find(
      (a: any) =>
        String(a.Name ?? "").toLowerCase() === kw.toLowerCase() ||
        String(a.FullyQualifiedName ?? "").toLowerCase() === kw.toLowerCase(),
    );
    if (found) return found;
  }
  // Partial match fallback
  for (const kw of keywords) {
    const found = accounts.find(
      (a: any) =>
        String(a.Name ?? "").toLowerCase().includes(kw.toLowerCase()) ||
        String(a.FullyQualifiedName ?? "").toLowerCase().includes(kw.toLowerCase()),
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
  try {
    if (!(await authorize())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Transaction id required" }, { status: 400 });

    const txn = await prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    if (txn.direction !== "DEBIT") {
      return NextResponse.json({ error: "Only expense (DEBIT) records can be sent to QB" }, { status: 400 });
    }
    if ((txn.status === "Settled" || txn.status === "QB Created") && txn.qbExpenseId) {
      return NextResponse.json({ error: "Already sent to QuickBooks", qbExpenseNo: txn.qbExpenseNo }, { status: 409 });
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

    // Fetch bank accounts, expense accounts, and payment methods from QB in parallel
    const [bankRes, expRes, pmRes] = await Promise.all([
      qbQuery(base, token, "SELECT * FROM Account WHERE AccountType = 'Bank' MAXRESULTS 100"),
      qbQuery(base, token, "SELECT * FROM Account WHERE Classification = 'Expense' MAXRESULTS 200"),
      qbQuery(base, token, "SELECT * FROM PaymentMethod MAXRESULTS 100"),
    ]);

    const bankAccounts: any[] = bankRes?.QueryResponse?.Account ?? [];
    const expenseAccounts: any[] = expRes?.QueryResponse?.Account ?? [];
    const paymentMethods: any[] = pmRes?.QueryResponse?.PaymentMethod ?? [];

    const bankAccount =
      findAccount(bankAccounts, ["DBS", "Checking", "Current", "Operating"]) ?? bankAccounts[0];
    if (!bankAccount) {
      return NextResponse.json(
        { error: "No bank account found in QuickBooks. Please set up a bank account first." },
        { status: 422 },
      );
    }

    const categoryKeywords = CATEGORY_ACCOUNT[txn.type] ?? ["General", "Operating", "Administrative"];
    const expenseAccount =
      findAccount(expenseAccounts, categoryKeywords) ??
      findAccount(expenseAccounts, ["General", "Operating", "Administrative", "Expenses"]) ??
      expenseAccounts[0];
    if (!expenseAccount) {
      return NextResponse.json(
        { error: "No expense account found in QuickBooks. Please set up expense accounts first." },
        { status: 422 },
      );
    }

    const dateStr = txn.paymentDate.toISOString().slice(0, 10);
    const prefix = `TX${dateStr.slice(2, 4)}${dateStr.slice(5, 7)}${dateStr.slice(8, 10)}`;
    const sameDay = await prisma.bankTransaction.count({
      where: { qbExpenseNo: { startsWith: prefix } },
    });
    const docNumber = buildDocNumber(dateStr, sameDay + 1);

    const qbPaymentMethod = findPaymentMethod(paymentMethods, txn.paymentType);

    const purchaseBody: Record<string, any> = {
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
      PrivateNote: `HRMS · ${txn.paymentType} · ${txn.rawDescription.slice(0, 500)}`,
    };
    if (qbPaymentMethod) {
      purchaseBody.PaymentMethodRef = { value: String(qbPaymentMethod.Id), name: qbPaymentMethod.Name };
    }

    let qbExpenseId: string;
    let qbExpenseNo = docNumber;

    try {
      const qbData = await qbCreate(base, token, "purchase", purchaseBody);
      qbExpenseId = String(qbData?.Purchase?.Id ?? qbData?.Id ?? "");
    } catch (createErr: any) {
      // QB rejects duplicate DocNumbers — look up the existing expense and reuse it
      if (/duplicate/i.test(createErr.message)) {
        const searchRes = await qbQuery(
          base,
          token,
          `SELECT * FROM Purchase WHERE DocNumber = '${docNumber}' MAXRESULTS 1`,
        );
        const existing = searchRes?.QueryResponse?.Purchase?.[0];
        if (existing) {
          qbExpenseId = String(existing.Id);
        } else {
          // Try with sequence suffix in case of a prior partial attempt
          throw new Error(`QB duplicate DocNumber but could not locate existing expense: ${createErr.message}`);
        }
      } else {
        throw createErr;
      }
    }

    await prisma.bankTransaction.update({
      where: { id },
      data: { status: "QB Created", qbExpenseId, qbExpenseNo },
    });

    return NextResponse.json({ ok: true, qbExpenseNo, qbExpenseId });
  } catch (err: any) {
    console.error("[generate-expense]", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
