import { describe, it, expect, vi } from "vitest";
import { normalizeQbTxn, pickDefaultBankAccount, signed } from "@/lib/quickbooks/bank-activity";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const BANK = "35"; // QBO Account.Id of "DBS Current"
const A = (value: string, name = "") => ({ value, name });

describe("normalizeQbTxn", () => {
  it("Purchase from the bank is a DEBIT; Credit=true (refund) is a CREDIT", () => {
    expect(normalizeQbTxn("Purchase", { Id: "1", TxnDate: "2026-11-03", TotalAmt: 120.5, AccountRef: A(BANK), EntityRef: A("9", "SMRT"), DocNumber: "E-1", PrivateNote: "fare" }, BANK)).toEqual({
      qbTxnType: "Purchase", qbTxnId: "1", date: "2026-11-03", amount: "120.50", direction: "DEBIT", docNumber: "E-1", payee: "SMRT", memo: "fare", linkedTxnIds: [],
    });
    expect(normalizeQbTxn("Purchase", { Id: "2", TxnDate: "2026-11-03", TotalAmt: 10, AccountRef: A(BANK), Credit: true }, BANK)!.direction).toBe("CREDIT");
    expect(normalizeQbTxn("Purchase", { Id: "3", TxnDate: "2026-11-03", TotalAmt: 10, AccountRef: A("99") }, BANK)).toBeNull();
  });

  it("Payment only counts when deposited straight to the bank (not Undeposited Funds)", () => {
    const p = { Id: "7", TxnDate: "2026-11-04", TotalAmt: 990, CustomerRef: A("3", "ACME"), PaymentRefNum: "EBGPP1", Line: [{ LinkedTxn: [{ TxnId: "INV9", TxnType: "Invoice" }] }] };
    expect(normalizeQbTxn("Payment", { ...p, DepositToAccountRef: A(BANK) }, BANK)).toMatchObject({ direction: "CREDIT", amount: "990.00", payee: "ACME", docNumber: "EBGPP1", linkedTxnIds: ["INV9"] });
    expect(normalizeQbTxn("Payment", { ...p, DepositToAccountRef: A("4", "Undeposited Funds") }, BANK)).toBeNull();
    expect(normalizeQbTxn("Payment", p, BANK)).toBeNull();
  });

  it("Deposit, SalesReceipt are CREDITs; RefundReceipt, BillPayment, CreditCardPayment are DEBITs", () => {
    expect(normalizeQbTxn("Deposit", { Id: "d", TxnDate: "2026-11-01", TotalAmt: "500.00", DepositToAccountRef: A(BANK), Line: [{ DepositLineDetail: { Entity: A("1", "SSG") } }] }, BANK)).toMatchObject({ direction: "CREDIT", payee: "SSG" });
    expect(normalizeQbTxn("SalesReceipt", { Id: "s", TxnDate: "2026-11-01", TotalAmt: 50, DepositToAccountRef: A(BANK) }, BANK)!.direction).toBe("CREDIT");
    expect(normalizeQbTxn("RefundReceipt", { Id: "r", TxnDate: "2026-11-01", TotalAmt: 50, DepositToAccountRef: A(BANK) }, BANK)!.direction).toBe("DEBIT");
    expect(normalizeQbTxn("BillPayment", { Id: "b", TxnDate: "2026-11-01", TotalAmt: 70, PayType: "Check", CheckPayment: { BankAccountRef: A(BANK) }, VendorRef: A("2", "Landlord") }, BANK)).toMatchObject({ direction: "DEBIT", payee: "Landlord" });
    expect(normalizeQbTxn("BillPayment", { Id: "b2", TxnDate: "2026-11-01", TotalAmt: 70, PayType: "CreditCard", CreditCardPayment: { CCAccountRef: A("77") } }, BANK)).toBeNull();
    expect(normalizeQbTxn("CreditCardPayment", { Id: "c", TxnDate: "2026-11-01", Amount: 900, BankAccountRef: A(BANK), CreditCardAccountRef: A("77", "DBS Visa") }, BANK)).toMatchObject({ direction: "DEBIT", payee: "DBS Visa" });
  });

  it("Transfer direction depends on which side the bank is", () => {
    expect(normalizeQbTxn("Transfer", { Id: "t", TxnDate: "2026-11-01", Amount: 1000, FromAccountRef: A(BANK), ToAccountRef: A("8", "Fixed Deposit") }, BANK)).toMatchObject({ direction: "DEBIT", payee: "Transfer to Fixed Deposit" });
    expect(normalizeQbTxn("Transfer", { Id: "t2", TxnDate: "2026-11-01", Amount: 1000, FromAccountRef: A("8", "Fixed Deposit"), ToAccountRef: A(BANK) }, BANK)!.direction).toBe("CREDIT");
  });

  it("JournalEntry nets the lines posting to the bank account", () => {
    const je = {
      Id: "j",
      TxnDate: "2026-11-30",
      Line: [
        { Amount: 15.5, Description: "Bank charges", JournalEntryLineDetail: { PostingType: "Credit", AccountRef: A(BANK) } },
        { Amount: 15.5, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: A("60", "Bank Charges") } },
      ],
    };
    expect(normalizeQbTxn("JournalEntry", je, BANK)).toMatchObject({ direction: "DEBIT", amount: "15.50", memo: "Bank charges" });
    expect(normalizeQbTxn("JournalEntry", { ...je, Line: [je.Line[1]] }, BANK)).toBeNull();
  });

  it("signed() and default account choice", () => {
    expect(signed("10.00", "CREDIT").toFixed(2)).toBe("10.00");
    expect(signed("10.00", "DEBIT").toFixed(2)).toBe("-10.00");
    const accts = [
      { id: "1", name: "OCBC", accountType: "Bank", currentBalance: "0.00", currency: "SGD", active: true },
      { id: "2", name: "DBS Current", accountType: "Bank", currentBalance: "0.00", currency: "SGD", active: true },
    ];
    expect(pickDefaultBankAccount(accts)!.id).toBe("2");
    expect(pickDefaultBankAccount([])).toBeNull();
  });
});
