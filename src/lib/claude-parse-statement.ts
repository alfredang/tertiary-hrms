import { z } from "zod";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readWorkbookRows } from "@/lib/parse-excel-statement";

export interface ClaudeParsedTransaction {
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

const TxnSchema = z.object({
  paymentDate: z.string().describe("ISO date YYYY-MM-DD"),
  title: z
    .string()
    .describe(
      "Human label. For CREDITS use the payer/customer/company name (e.g. 'SkillsFuture Singapore Agency', 'Nutan Kumari Mishra'). For DEBITS use the payee/vendor name plus brief purpose (e.g. 'Peter Goh - Sharept Apr', 'Google Workspace'). NEVER use the transaction type marker ('Inward PayNow', 'FAST PAYMENT', 'INTERBANK GIRO') as the title.",
    ),
  amount: z.number().describe("Absolute SGD amount (always positive)"),
  direction: z.enum(["DEBIT", "CREDIT"]).describe("DEBIT = money out, CREDIT = money in"),
  paymentType: z
    .enum(["GIRO", "Bank Transfer", "PayNow", "CC", "Cash", "e-invoice"])
    .describe(
      "Payment method inferred primarily from Description 1 (descParts[0], the DBS transaction-type marker). PayNow: marker mentions PayNow. GIRO: marker says GIRO / INTERBANK GIRO / IBG GIRO / GIRO PAYROLL / GIRO PAYMENT / GIRO COLLECTION. CC: BAT/Business Advance Card/Stripe/Visa/Mastercard/Hitpay. Cash: cash withdrawal/disbursement. e-invoice: row references an invoice number (TC..-, INV-, PF-, FTB-) and isn't one of the above. Bank Transfer: default for FAST PAYMENT / FAST INWARD / INWARD TT / REMITTANCE / OUTWARD TT.",
    ),
  type: z
    .enum([
      "Trainer Fee",
      "Allowance",
      "Bank Charges",
      "Payroll",
      "CPF",
      "Income Tax",
      "Rental",
      "Subscription",
      "Vendor Payment",
      "Payment Processor",
      "General Expenses",
      "Grocery",
      "Entertainment",
      "Meal",
      "Refund",
      "Income",
      "Other",
    ])
    .describe("Best-fit category. Use 'Income' for credits unless a more specific income type fits."),
  paymentRef: z
    .string()
    .describe(
      "Bank's internal reference code for this transaction (e.g. 'EBGPP60505392144', 'MCT2026050100038833081', '20260504DBSSSGSGBRT6240060', 'FTB-2605-001321'). FTB-XXXX codes are bank references — always put them here, never in invoiceNo. Empty string if none visible.",
    ),
  invoiceNo: z
    .string()
    .describe(
      "Invoice number if the row references one (e.g. 'TC26-0501-000951', 'INV-19604', 'PF-100041159'). FTB-XXXX is a bank reference NOT an invoice — put it in paymentRef. Empty string if none.",
    ),
  remarks: z.string().describe("Source reference, e.g. statement filename + transaction ref"),
});

const ResponseSchema = z.object({
  transactions: z.array(TxnSchema),
});

function excelToCsv(buffer: Buffer): string {
  const sheets = readWorkbookRows(buffer);
  const lines: string[] = [];
  for (const { sheet, rows } of sheets) {
    lines.push(`# Sheet: ${sheet}`);
    for (const row of rows) {
      const cells = (row ?? []).map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).replace(/\s+/g, " ").trim();
      });
      if (cells.some((c) => c !== "")) {
        lines.push(cells.map((c) => (c.includes(",") ? `"${c.replace(/"/g, '""')}"` : c)).join(","));
      }
    }
  }
  return lines.join("\n");
}

export async function parseStatementWithClaude(opts: {
  buffer?: Buffer;
  pdfBuffer?: Buffer;
  rawText?: string;
  apiKey: string;
  filename: string;
}): Promise<ClaudeParsedTransaction[]> {
  const anthropic = createAnthropic({ apiKey: opts.apiKey });

  const system = [
    "You are an accounting assistant that extracts bank statement transactions for a Singapore company.",
    "",
    "## EXTRACTION RULES",
    "- INCLUDE every transaction row, both DEBIT (money out) and CREDIT (money in).",
    "- Skip header/footer rows, summaries, opening/ledger/available balance lines, totals, and page footers.",
    "- 'amount' must be the absolute positive SGD value (no minus sign, no commas).",
    "- 'paymentDate' is ISO YYYY-MM-DD. DBS statements use DD MMM (e.g. '02 May') — use the statement year.",
    "",
    "## DIRECTION (DBS layout)",
    "- DBS statements have two amount columns: 'Withdrawal' (DEBIT) and 'Deposit' (CREDIT).",
    "- Any row with a value in the Deposit column => direction='CREDIT'.",
    "- Any row with a value in the Withdrawal column => direction='DEBIT'.",
    "- Common CREDIT cues: 'Inward PayNow', 'PayNow-Others Incoming', 'INWARD TT', 'GIRO COLLECTION', 'IBG GIRO Incoming', 'FAST INWARD', 'INWARD CREDIT'.",
    "- Common DEBIT cues: 'OUTWARD PAYNOW', 'PAYNOW TRANSFER', 'GIRO PAYMENT', 'FAST PAYMENT', 'INTERBANK GIRO', 'CHEQUE', 'BAT', 'Business Advance Card'.",
    "",
    "## TITLE",
    "- For CREDITS: use the payer/customer/company name (e.g. 'SkillsFuture Singapore Agency', 'Nutan Kumari Mishra', 'Acme Pte Ltd'). If invoice ref exists, append it: 'Acme Pte Ltd – INV-19604'.",
    "- For DEBITS: use the payee/vendor name plus brief purpose (e.g. 'Peter Goh – Sharept Apr', 'Google Workspace – May').",
    "- NEVER use the transaction type marker ('Inward PayNow', 'FAST PAYMENT', 'INTERBANK GIRO', 'GIRO PAYMENT') alone as the title.",
    "- Max 120 chars.",
    "",
    "## CATEGORY (type)",
    "CREDITS:",
    "  - 'Refund' if description says refund/reversal/chargeback.",
    "  - 'Income' for everything else (sales, training fees received, course fees, SkillsFuture credits, customer invoice settlements).",
    "DEBITS:",
    "  - 'Trainer Fee' – trainer/teacher/instructor/lecturer fee, course delivery, freelance training.",
    "  - 'Allowance' – intern/staff allowance, ALLW, stipend.",
    "  - 'Bank Charges' – service charge, bank fee, FX charge, GIRO fee.",
    "  - 'Payroll' – GIRO PAYROLL, salary, monthly pay run.",
    "  - 'CPF' – CPF Board contributions.",
    "  - 'Income Tax' – IRAS, GST payment, corporate tax, withholding tax.",
    "  - 'Rental' – landlord, property mgmt corp, office rental (e.g. N9 Offices, MGT Corp, Management Corporation, WSQ).",
    "  - 'Subscription' – SaaS (Google Workspace, Microsoft, OpenAI, Anthropic, GitHub, Notion, Vercel, AWS), PayPal subs, recurring software card charges.",
    "  - 'Payment Processor' – Stripe, Hitpay, PayPal (outgoing), 2C2P, fees from payment gateways.",
    "  - 'Vendor Payment' – supplier invoices via INTERBANK GIRO/FAST PAYMENT not matching another category.",
    "  - 'Grocery' – supermarket / minimart / food retail (NTUC, Sheng Siong, Cold Storage, FairPrice, Giant).",
    "  - 'Meal' – restaurants, food delivery (GrabFood, Deliveroo, Foodpanda), café, hawker, business meals.",
    "  - 'Entertainment' – cinema, events, KTV, club, recreation, corporate entertainment.",
    "  - 'General Expenses' – stationery, office supplies, small adhoc purchases, miscellaneous business spend.",
    "  - 'Other' – use only as a last resort when nothing above fits.",
    "",
    "## PAYMENT TYPE (always infer from Description 1 — the DBS transaction-type marker — first)",
    "Allowed values: GIRO | Bank Transfer | PayNow | CC | Cash | e-invoice. Detection order:",
    "- 'Cash' – marker says CASH WITHDRAWAL / CASH DISBURSEMENT / CASH.",
    "- 'PayNow' – marker contains PAYNOW (Inward PayNow, PayNow-Others Incoming, OUTWARD PAYNOW, PAYNOW TRANSFER, etc.).",
    "- 'GIRO' – marker contains GIRO (INTERBANK GIRO, IBG GIRO, GIRO PAYROLL, GIRO PAYMENT, GIRO COLLECTION).",
    "- 'CC' – BAT / Business Advance Card / Visa / Mastercard / Stripe / Hitpay anywhere in the description.",
    "- 'e-invoice' – references an invoice number (TC..-, INV-, PF-) and none of the above fit. FTB- is a bank reference, not an invoice — do NOT use e-invoice for FTB transactions.",
    "- 'Bank Transfer' – default for FAST PAYMENT / FAST INWARD / INWARD TT / REMITTANCE / OUTWARD TT and any marker not matching the others.",
    "",
    "## REFERENCES",
    "- 'paymentRef' – bank internal ref code if visible (e.g. 'EBGPP60505392144', 'MCT2026050100038833081', 'FTB-2605-001321'). FTB-XXXX are bank references — always goes here. Empty string if none.",
    "- 'invoiceNo' – invoice number referenced in the row (TC26-0501-000951, INV-19604, PF-100041159). FTB-XXXX is NOT an invoice number. Empty string if none.",
    "- 'remarks' – include the source filename plus any other useful reference info.",
    "",
    "## GST (Singapore)",
    "- DBS statements do not show GST separately. Set gstIncluded implicitly based on direction (outgoing supplier payments typically GST-inclusive; income may or may not be). The client maps DEBIT→GST included, CREDIT→not — do not override.",
    "",
    "Be conservative: when unsure, use type='Other'. Always return at least one transaction per visible statement row.",
  ].join("\n");

  if (opts.pdfBuffer) {
    // Drop the PDF on the local filesystem so the agent's Read tool can pick it up.
    // The Claude Agent SDK authenticates via the host's `claude` CLI session
    // (Claude subscription / OAuth) rather than a raw API key.
    const dir = await mkdtemp(join(tmpdir(), "stmt-"));
    const safeName = opts.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const pdfPath = join(dir, safeName);
    await writeFile(pdfPath, opts.pdfBuffer);

    const userPrompt = [
      `Read the PDF at ${pdfPath} (it's a DBS bank statement) and extract every transaction row from the tables —`,
      "both Withdrawal (DEBIT) and Deposit (CREDIT) columns. Do not skip credit rows.",
      "",
      "Return ONLY a single fenced ```json block (no other prose) with this exact shape:",
      "```json",
      '{"transactions":[{"paymentDate":"YYYY-MM-DD","title":"string","amount":number,' +
        '"direction":"DEBIT"|"CREDIT","paymentType":"GIRO"|"Bank Transfer"|"PayNow"|"CC"|"Cash"|"e-invoice",' +
        '"type":"Trainer Fee"|"Allowance"|"Bank Charges"|"Payroll"|"CPF"|"Tax"|"Rent"|"Subscription"|' +
        '"Vendor Payment"|"Payment Processor"|"Refund"|"Income"|"Other",' +
        '"paymentRef":"string","invoiceNo":"string","remarks":"string"}]}',
      "```",
    ].join("\n");

    let finalText = "";
    let apiErrorStatus: number | null | undefined;
    try {
      for await (const msg of query({
        prompt: userPrompt,
        options: {
          systemPrompt: { type: "preset", preset: "claude_code", append: system } as any,
          allowedTools: ["Read"],
          additionalDirectories: [dir],
          settingSources: [],
          permissionMode: "bypassPermissions",
        } as any,
      })) {
        if (msg.type === "result") {
          if (msg.subtype === "success") {
            finalText = msg.result;
          } else {
            apiErrorStatus = (msg as any).api_error_status;
            throw new Error(
              `Agent SDK result ${msg.subtype}` +
                (apiErrorStatus ? ` (api status ${apiErrorStatus})` : ""),
            );
          }
        }
      }
    } finally {
      await unlink(pdfPath).catch(() => {});
    }

    if (!finalText) throw new Error("Agent SDK returned no result text");

    const fenceMatch = finalText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenceMatch ? fenceMatch[1] : finalText;
    const jsonStart = candidate.indexOf("{");
    const jsonEnd = candidate.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) {
      throw new Error(`Agent SDK response did not contain JSON: ${finalText.slice(0, 200)}`);
    }
    const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1));
    const validated = ResponseSchema.parse(parsed);
    return mapTransactions(validated.transactions);
  }

  let body: string;
  let format: "csv" | "pdf-text";
  if (opts.rawText) {
    body = opts.rawText;
    format = "pdf-text";
  } else if (opts.buffer) {
    body = excelToCsv(opts.buffer);
    format = "csv";
  } else {
    throw new Error("Either pdfBuffer, buffer, or rawText is required");
  }

  const trimmed = body.length > 180_000 ? body.slice(0, 180_000) : body;

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: ResponseSchema,
    system,
    prompt: [
      `Source file: ${opts.filename}`,
      format === "pdf-text"
        ? "Bank statement text extracted from PDF. Each transaction block starts with a date like '30-Apr-2026 30-Apr-2026' and spans several lines. The amount and running balance appear at the end of the block."
        : "Bank statement rows (CSV):",
      format === "pdf-text" ? "```text" : "```csv",
      trimmed,
      "```",
      "Return every transaction row (both debits and credits) as a structured object.",
    ].join("\n"),
  });

  return mapTransactions(object.transactions);
}

/**
 * XLSX-first flow: deterministically parse the workbook locally, then send the
 * rows to Claude Agent SDK for a single batch enrichment pass to improve
 * title (customer/vendor name), type (category), and paymentType.
 * Numbers/dates/direction stay deterministic — never touched by the LLM.
 */
export async function enrichTransactionsWithAgent(
  rows: ClaudeParsedTransaction[],
  filename: string,
): Promise<ClaudeParsedTransaction[]> {
  if (rows.length === 0) return rows;

  const compact = rows.map((r, idx) => {
    // parseExcelStatement joins description cells with " | " — split back so
    // the LLM can use column position (DBS column 2 is the customer/vendor name).
    const descParts = r.rawDescription.split(" | ").map((s) => s.trim()).filter(Boolean);
    return {
      i: idx,
      date: r.paymentDate,
      dir: r.direction,
      amt: r.amount,
      descParts: descParts.slice(0, 6),
      curTitle: r.title,
      curType: r.type,
      curPayType: r.paymentType,
      curRef: r.paymentRef,
      curInv: r.invoiceNo,
    };
  });

  const system = [
    "You are an accounting assistant for a Singapore company. Enrich pre-parsed bank rows.",
    "DO NOT change date, dir, or amt — only refine title / type / paymentType / paymentRef / invoiceNo.",
    "",
    "TITLE rules:",
    "- DBS layout: descParts[0] is the transaction-type marker (e.g. 'Inward PayNow', 'FAST PAYMENT', 'INTERBANK GIRO'); descParts[1] (the SECOND description field) holds the COUNTERPARTY NAME — customer for CREDITs, vendor for DEBITs. The title comes from descParts[1].",
    "- TITLE MUST BE A CLEAN NAME ONLY. No trailing refs, no UENs, no NRIC/FIN, no invoice numbers, no bank codes.",
    "- Strip leading code prefixes from descParts[1] before using: 'OTHR/', 'OTHER/', 'ALLW/', 'SAL/', 'INV/'.",
    "",
    "GIRO PAYMENT special format (DBS):",
    "- When descParts[0] = 'GIRO PAYMENT', descParts[1] follows this format: '{DD/MM/YYYY} {seq_no} {vendor_name + purpose} {bank_AP_ref}'",
    "- Example: '15/05/2026 80000 Samuel Huang Jan classesx3 260514103137AP0038633'",
    "  Step 1: Strip the leading date → '80000 Samuel Huang Jan classesx3 260514103137AP0038633'",
    "  Step 2: Strip the leading sequence number (3–6 digits) → 'Samuel Huang Jan classesx3 260514103137AP0038633'",
    "  Step 3: Strip the trailing bank/AP reference (long digit string optionally ending in AP+digits) → 'Samuel Huang Jan classesx3'",
    "  Step 4: title = 'Samuel Huang – Jan classesx3', paymentRef = '260514103137AP0038633'",
    "- The AP ref pattern is: 10+ digits, optionally followed by 'AP' + more digits (e.g. '260514103137AP0038633', 'AP0038633')",
    "- If the purpose words include 'class', 'classes', 'classesx', 'training', 'course' → type = 'Trainer Fee'",
    "",
    "- Strip trailing identifiers separated by ' - ', ' – ', ' — ', '-', or ' / ' from the name:",
    "    * Numeric refs: 'SMRT Trains Ltd – 3400000845' → title 'SMRT Trains Ltd', paymentRef '3400000845'.",
    "    * Singapore UEN/NRIC/FIN (9 digits + letter, or letter + 7 digits + letter): 'Tan Yong Peng – 201200696W' → title 'Tan Yong Peng', paymentRef '201200696W'.",
    "    * SkillsFuture claim IDs (10-digit): 'SkillsFuture Singapore Agency – 4000539601' → title 'SkillsFuture Singapore Agency', paymentRef '4000539601'.",
    "    * Bank ref codes (long alphanumeric ≥14 chars).",
    "- Never use the transaction-type marker (FAST PAYMENT, INTERBANK GIRO, PAYNOW, GIRO PAYMENT) as the title.",
    "- If descParts[1] is missing/empty/junk, fall back to the next descriptive part.",
    "- Max 120 chars.",
    "",
    "PAYMENT REF rules:",
    "- Move any trailing identifier you stripped from the title INTO paymentRef.",
    "- If a long alphanumeric bank code appears in descParts[2+], use that as paymentRef instead.",
    "- Prefer the most specific / longest ref when multiple candidates exist.",
    "- Empty string if nothing identifiable. Never invent refs.",
    "",
    "TYPE (category) — pick exactly one:",
    "  CREDITs: Income, Refund.",
    "  DEBITs: Trainer Fee, Allowance, Bank Charges, Payroll, CPF, Income Tax, Rental, Subscription, Payment Processor, Vendor Payment, Grocery, Meal, Entertainment, General Expenses, Other.",
    "  Hints:",
    "    - SaaS / Google / Microsoft / OpenAI / Anthropic / GitHub / Vercel / AWS → Subscription.",
    "    - Stripe / Hitpay / PayPal outgoing → Payment Processor.",
    "    - NTUC / Sheng Siong / FairPrice / Cold Storage / Giant → Grocery.",
    "    - GrabFood / Deliveroo / Foodpanda / restaurants / cafés / hawker → Meal.",
    "    - Cinema / events / KTV / club / recreation → Entertainment.",
    "    - N9 Offices / MGT Corp / Management Corporation / WSQ / landlord → Rental.",
    "    - IRAS / GST / corporate tax → Income Tax.",
    "  Use 'Other' only when nothing else fits.",
    "",
    "PAYMENT TYPE — INFER FROM descParts[0] (Description 1, the DBS transaction-type marker) FIRST.",
    "Allowed values: GIRO | Bank Transfer | PayNow | CC | Cash | e-invoice.",
    "  - Cash if descParts[0] says CASH WITHDRAWAL / CASH DISBURSEMENT / CASH.",
    "  - PayNow if descParts[0] contains PAYNOW.",
    "  - GIRO if descParts[0] contains GIRO (INTERBANK GIRO, IBG GIRO, GIRO PAYROLL, GIRO PAYMENT, GIRO COLLECTION).",
    "  - CC if BAT / Business Advance Card / Visa / Mastercard / Stripe / Hitpay anywhere in the row.",
    "  - e-invoice if an invoice ref (TC..-, INV-, PF-) appears and none of the above fit. FTB- is a bank ref not an invoice.",
    "  - else Bank Transfer (default for FAST PAYMENT / INWARD TT / REMITTANCE / etc.).",
    "",
    "REFS:",
    "  - paymentRef: bank ref code (long alphanumeric ≥14 chars). Empty string if none.",
    "  - invoiceNo: invoice number if visible. Empty string if none.",
  ].join("\n");

  const userPrompt = [
    `Source: ${filename}. ${rows.length} rows pre-parsed.`,
    "Enrich each row. Return ONLY a single fenced ```json block with shape:",
    '{"rows":[{"i":number,"title":string,"type":string,"paymentType":string,"paymentRef":string,"invoiceNo":string}]}',
    "Include every row, keyed by 'i'.",
    "",
    "INPUT:",
    "```json",
    JSON.stringify(compact),
    "```",
  ].join("\n");

  let finalText = "";
  for await (const msg of query({
    prompt: userPrompt,
    options: {
      systemPrompt: { type: "preset", preset: "claude_code", append: system } as any,
      allowedTools: [],
      settingSources: [],
      permissionMode: "bypassPermissions",
    } as any,
  })) {
    if (msg.type === "result") {
      if (msg.subtype === "success") {
        finalText = msg.result;
      } else {
        const status = (msg as any).api_error_status;
        throw new Error(
          `Agent SDK enrichment ${msg.subtype}` + (status ? ` (api ${status})` : ""),
        );
      }
    }
  }

  if (!finalText) throw new Error("Agent SDK returned no result text");

  const fence = finalText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : finalText;
  const jsonStart = candidate.indexOf("{");
  const jsonEnd = candidate.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Agent SDK enrichment did not contain JSON: ${finalText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as {
    rows: Array<{
      i: number;
      title?: string;
      type?: string;
      paymentType?: string;
      paymentRef?: string;
      invoiceNo?: string;
    }>;
  };

  const enrichments = new Map<number, (typeof parsed.rows)[number]>();
  for (const r of parsed.rows) enrichments.set(r.i, r);

  return rows.map((row, idx) => {
    const e = enrichments.get(idx);
    if (!e) return row;
    return {
      ...row,
      title: (e.title ?? row.title).slice(0, 120),
      type: e.type ?? row.type,
      paymentType: e.paymentType ?? row.paymentType,
      paymentRef: e.paymentRef ?? row.paymentRef,
      invoiceNo: e.invoiceNo ?? row.invoiceNo,
    };
  });
}

function mapTransactions(
  txns: z.infer<typeof ResponseSchema>["transactions"],
): ClaudeParsedTransaction[] {
  return txns.map((t) => ({
    paymentDate: t.paymentDate,
    title: t.title.slice(0, 120),
    amount: Math.abs(Number(t.amount) || 0),
    type: t.type,
    gstIncluded: t.direction === "DEBIT",
    recurring: "One Time",
    remarks: t.remarks?.slice(0, 500) ?? "",
    rawDescription: t.title,
    direction: t.direction,
    paymentType: t.paymentType ?? "Bank Transfer",
    paymentRef: t.paymentRef ?? "",
    invoiceNo: t.invoiceNo ?? "",
  }));
}
