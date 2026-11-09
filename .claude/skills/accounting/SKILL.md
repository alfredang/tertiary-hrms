---
name: accounting
description: "How to process a DBS bank-statement XLS/XLSX upload correctly for the Tertiary Infotech HRMS. Use this skill whenever you touch the bank import path: src/app/api/accounting/parse-statement/route.ts, src/lib/parse-excel-statement.ts, src/lib/claude-parse-statement.ts, the income/expense tracking pages, or anything that reads or writes BankTransaction rows. Encodes the column conventions, dedupe contract, and LLM enrichment rules that aren't obvious from reading the code."
---

# DBS XLS Upload Processing (Tertiary Infotech Academy)

The accounting module imports a DBS Business Account (SGD) statement, exported from iBanking as Excel. The pipeline is **deterministic parse → Claude Agent SDK enrichment → dedupe-checked save**. Everything below is about getting that flow right.

## ⚠️ Top rule: avoid duplicates

Every imported row gets a stable `dedupeKey = {paymentDate}|{direction}|{amount.toFixed(2)}|{normalisedRawDescription}` and `BankTransaction.dedupeKey` has a UNIQUE index. The save route runs a **pre-insert check** (queries existing keys and filters them out) and a **post-insert verify** (re-counts by `importBatchId`) — see [src/app/api/accounting/transactions/route.ts](src/app/api/accounting/transactions/route.ts). Both hooks must stay in place. Anti-duplication rules:

1. **Never `createMany` into `BankTransaction` without the pre-dedupe filter.** The unique index will reject, but you'll lose the accurate `skipped` count and the post-insert verification will misfire.
2. **Never compute the key inline.** Always call `computeDedupeKey()` from [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts). Keeping one definition guarantees that re-imports of the same statement collide.
3. **Direction is part of the key.** A row mis-classified as DEBIT and then re-imported as CREDIT will create TWO rows. Fix misclassifications by deleting the bad rows first; never rely on "the system will dedupe."
4. **`rawDescription` is part of the key.** Changing how `descParts` are joined (currently `" | "`) silently invalidates every existing row's key. Treat any change as a migration.
5. **Enrichment does NOT touch the dedupe fields.** `title`, `type`, `paymentType`, `paymentRef`, `invoiceNo` are not in the key, so re-running enrichment on saved rows is safe.
6. **Two uploads of the same statement should report `saved: 0, skipped: N`.** That's the contract. If a user sees the same row twice in Income/Expense Tracking, that is a P1 bug — investigate the key, not the UI.
7. **No bulk truncate, no "force re-import" flag.** If a re-import is genuinely needed, delete the affected rows by `importBatchId` first.


## Accepted file formats

- `.xlsx` — modern zipped Office Open XML. Magic bytes: `50 4B 03 04` (`PK\x03\x04`).
- `.xls` — legacy CFB/OLE2. Magic bytes: `D0 CF 11 E0 A1 B1 1A E1`. Still emitted by some DBS exports.

Always sniff magic bytes in addition to checking the filename. Users rename files. SheetJS (`xlsx` package) handles both formats with the same API.

**Reject PDFs.** PDF support was removed because: (a) `pdf-parse` mangles column alignment and (b) Claude native-PDF takes 60–90s and burns subscription quota. Don't add it back.

## DBS workbook layout

After header/metadata rows, the transaction table has these columns (header text varies slightly per export):

| Position | Header (examples) | Use for |
|----------|-------------------|---------|
| Date | `Transaction Date`, `Date`, `Value Date`, `Posting Date` | `paymentDate` (ISO `YYYY-MM-DD`) |
| Bank ref | `Reference` | Usually empty / not useful — actual refs are inside the description cells |
| Withdrawal | `Debit`, `Debit Amount`, `Withdrawal`, `Withdrawal Amount` | DEBIT amount (positive number) |
| Deposit | `Credit`, `Credit Amount`, `Deposit`, `Deposit Amount` | CREDIT amount (positive number) |
| Balance | `Balance`, `Running Balance` | **Always skip** — not a transaction field |
| **Description 1** | `Transaction Details`, `Description`, etc. | Transaction-type marker (e.g. `Inward PayNow`, `FAST PAYMENT`, `INTERBANK GIRO`, `GIRO PAYMENT`, `Service Charge…`) — **never use this as the title** |
| **Description 2** | (next desc column) | **Counterparty name — customer for CREDIT, vendor for DEBIT. This is the field that becomes `title`.** |
| Description 3+ | (further desc columns) | Refs, invoice numbers, purpose notes |

`parseExcelStatement` in [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts):

1. Scans the first 30 rows for the header row — the first row that contains a recognized date header AND both a debit-style and credit-style header.
2. Records the column indices.
3. For each subsequent row, collects every non-key, non-balance column into `descParts` **in original column order** — so `descParts[0]` is always the type marker and `descParts[1]` is always the counterparty name. This ordering is the contract the LLM enrichment depends on.
4. Joins them as `rawDescription = descParts.join(" | ")`.

If you ever change the join separator, also update the splitter in `enrichTransactionsWithAgent` ([src/lib/claude-parse-statement.ts](src/lib/claude-parse-statement.ts)) — and remember it's part of the dedupe key, so existing rows become un-dedupeable.

## Direction

- `Withdrawal > 0` → `direction = "DEBIT"`.
- `Deposit > 0` → `direction = "CREDIT"`.
- A row with both > 0 → emit two rows (defensive; DBS shouldn't produce these).
- **Do not infer direction from the description.** Always use the column values.

## Title extraction (the column-2 rule)

The single most important enrichment rule:

> `title` comes from `descParts[1]`. Not `descParts[0]`. Not the whole `rawDescription`. The SECOND description column.

**Title must be a clean counterparty name only.** No trailing refs, no UENs, no NRIC/FIN, no SkillsFuture claim IDs, no bank ref codes, no invoice numbers. Anything stripped from the tail belongs in `paymentRef` (or `invoiceNo` if it's an invoice pattern).

Cleanup steps:

1. **Strip leading prefixes**: `OTHR/`, `OTHER/`, `ALLW/`, `SAL/`, `INV/`.
2. **Split on trailing separator** (` – `, ` - `, ` — `, ` / `) and move the tail to `paymentRef` when the tail looks identifier-like:
   - Numeric refs ≥6 digits: `SMRT Trains Ltd – 3400000845` → title `SMRT Trains Ltd`, paymentRef `3400000845`.
   - Singapore UEN (9 digits + letter): `Tan Yong Peng – 201200696W` → title `Tan Yong Peng`, paymentRef `201200696W`.
   - Singapore NRIC/FIN (`S/T/F/G` + 7 digits + letter).
   - SkillsFuture 10-digit claim IDs: `SkillsFuture Singapore Agency – 4000539601` → title `SkillsFuture Singapore Agency`, paymentRef `4000539601`.
   - Long alphanumeric tokens ≥8 chars.
3. If `descParts[1]` is missing/empty/pure junk, fall back to the next non-junk part.
4. Cap at 120 chars.

The deterministic helper `splitNameAndRef()` in [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts) does this split; the Agent SDK enrichment prompt mirrors the same rules so the LLM and the fallback path produce consistent output.

## Reference extraction

Two distinct ID fields — **do not conflate**:

- `paymentRef` — bank-side internal code. DBS shape: long alphanumeric ≥14 chars (`EBGPP60505392144`, `MCT2026050100038833081`, `20260504DBSSSGSGBRT…`). `extractPaymentRef()` walks `descParts` for tokens matching `/^[A-Z0-9]{14,}$/i` and picks the longest.
- `invoiceNo` — invoice number on either side of the transaction. Patterns in `extractInvoiceNo()`: `TC..-`, `INV-`, `PF-`, `FTB-`. Add new vendor patterns there, not inline elsewhere.

Empty string when missing — never `null`, never `"N/A"`. The dedupe key and the Prisma types both assume string.

## Categories (`type`)

Fixed enum, in sync between the LLM prompt, the deterministic `categorize()` fallback, and the table filters. Do not invent new strings.

**CREDIT:** `Income` (default), `Refund` (when desc says refund/reversal/chargeback).

**DEBIT:**
- `Trainer Fee` — trainer/teacher/instructor/lecturer fee, course delivery, freelance training.
- `Allowance` — intern/staff allowance, `ALLW`, stipend.
- `Bank Charges` — service charge, FX charge, GIRO fee.
- `Payroll` — `GIRO PAYROLL`, salary.
- `CPF` — `CPF Board` contributions.
- `Income Tax` — `IRAS`, GST payment, corporate tax, withholding tax.
- `Rental` — landlord, property mgmt corp, office rental (e.g. `N9 OFFICES`, `MGT CORP`, `MANAGEMENT CORPORATION`, `WSQ`).
- `Subscription` — recurring SaaS (Google Workspace, Microsoft, OpenAI, Anthropic, GitHub, Notion, Vercel, AWS), PayPal subs, card-charged recurring software.
- `Payment Processor` — Stripe, Hitpay, 2C2P, PayPal outgoing.
- `Vendor Payment` — supplier invoices via INTERBANK GIRO / FAST PAYMENT not matching above.
- `Grocery` — supermarket / minimart / food retail (NTUC, Sheng Siong, Cold Storage, FairPrice, Giant).
- `Meal` — restaurants, food delivery (GrabFood, Deliveroo, Foodpanda), café, hawker, business meals.
- `Entertainment` — cinema, events, KTV, club, recreation, corporate entertainment.
- `General Expenses` — stationery, office supplies, small adhoc purchases, miscellaneous business spend.
- `Other` — last resort; use sparingly.

Renamed/added since the original enum: `Rent` → `Rental`, `Tax` → `Income Tax`. Added `Grocery`, `Meal`, `Entertainment`, `General Expenses`. The deterministic `categorize()` in [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts), the Zod enum + system prompts in [src/lib/claude-parse-statement.ts](src/lib/claude-parse-statement.ts), and the dropdowns in [src/components/accounting/transactions-table.tsx](src/components/accounting/transactions-table.tsx) must stay in sync — when adding a new category, touch all three.

## Payment type

Fixed enum: `GIRO | Bank Transfer | PayNow | CC | Cash | e-invoice`.

**Infer from Description 1 (`descParts[0]`, the DBS transaction-type marker) first**, only falling back to the full row when no marker keyword matches. Detection order (first match wins):

1. `Cash` — marker says `CASH WITHDRAWAL` / `CASH DISBURSEMENT` / standalone `CASH`.
2. `PayNow` — marker contains `PAYNOW` (e.g. `Inward PayNow`, `PayNow-Others Incoming`, `OUTWARD PAYNOW`, `PAYNOW TRANSFER`).
3. `GIRO` — marker contains `GIRO` (e.g. `INTERBANK GIRO`, `IBG GIRO`, `GIRO PAYROLL`, `GIRO PAYMENT`, `GIRO COLLECTION`).
4. `CC` — `BAT`, `Business Advance Card`, `Visa`, `Mastercard`, `Stripe`, or `Hitpay` anywhere in the row.
5. `e-invoice` — invoice ref (`TC..-`, `INV-`, `PF-`, `FTB-`) appears and none of the above fit.
6. `Bank Transfer` — default for `FAST PAYMENT` / `FAST INWARD` / `INWARD TT` / `REMITTANCE` / `OUTWARD TT` and anything not matching the others.

`GIRO` and `Bank Transfer` are intentionally distinct — DBS itself separates them and reconciliation downstream depends on the split.

## Pipeline (the path the upload takes)

[src/app/api/accounting/parse-statement/route.ts](src/app/api/accounting/parse-statement/route.ts):

1. **Magic-byte check** → confirm xlsx or xls.
2. **`parseExcelStatement(buffer)`** → deterministic rows. Date, amount, direction, `descParts` (joined into `rawDescription`), plus first-pass heuristic title/type/paymentType/refs from the regex helpers.
3. **`enrichTransactionsWithAgent(rows, filename)`** → one batch Claude Agent SDK call that refines `title` / `type` / `paymentType` / `paymentRef` / `invoiceNo` only. Numbers and dates are never sent to the LLM as something it could change.
4. **Save** via `POST /api/accounting/transactions` — pre-dedupe check + insert + post-insert verification.

Failure of step 3 is non-fatal: the route returns the deterministic rows with `engine: "xls-rules"` and a `warning` field. The import still works without Claude.

## LLM enrichment contract

`enrichTransactionsWithAgent` in [src/lib/claude-parse-statement.ts](src/lib/claude-parse-statement.ts):

- Auth: **Claude Agent SDK using the host's `claude` CLI subscription session.** No API key. The OAuth token stored in `CompanyCredential.CLAUDE_API_KEY` (currently `sk-ant-oat01…`) is rejected by the public Messages API with 401 — the Agent SDK path is the only working option until someone supplies a real `sk-ant-api03-…` key.
- `allowedTools: []` — text generation only. Do NOT grant `Read`, `Bash`, or anything else here.
- One round-trip, batch of all rows. **Never per-row** — that's what made the PDF flow slow.
- LLM **must not** alter `paymentDate`, `amount`, or `direction`. The compact payload sent to the model does include them (as context), but the response schema only carries `i / title / type / paymentType / paymentRef / invoiceNo`, and the merge code keeps the workbook values verbatim.
- Output: single fenced ```json``` block keyed by row index `i`. The parser tolerates surrounding prose but prefers strict JSON.

## Dedupe contract (do not break)

`computeDedupeKey()` in [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts):

```
key = `${paymentDate}|${direction}|${amount.toFixed(2)}|${normalisedRawDescription}`
```

`BankTransaction.dedupeKey` has a UNIQUE index. The save route (`src/app/api/accounting/transactions/route.ts`):

- **Pre-insert hook** — selects existing keys from the incoming batch, partitions `fresh` vs `existing`, returns an accurate `skipped` count.
- **Post-insert hook** — re-counts by `importBatchId`, returns `verified: persisted === fresh.length === result.count`.

Implications:
- `direction` is part of the key → a misclassified row imported as DEBIT and then re-imported as CREDIT will produce TWO rows. Delete misclassifications before re-running, don't just re-upload.
- `rawDescription` is part of the key → changing the `descParts` join format silently invalidates every existing row. Treat as a migration.
- Re-running enrichment on already-saved rows is safe: the enrichment-only fields (`title`, `type`, `paymentType`, `paymentRef`, `invoiceNo`) are not in the key.

## Things to refuse

- Re-introducing PDF parsing for bank statements.
- Per-row LLM calls during import (only batched).
- Granting the enrichment agent any tools beyond text generation.
- Inventing new `type` values without updating the enum, the deterministic `categorize()` fallback, and the table filters in lockstep.
- Storing transaction amounts as `number` anywhere — `Prisma.Decimal` in DB, `decimal.js` in TS, `formatCurrency()` only at the render boundary.
- Bulk-truncating `BankTransaction` from a UI button. Per-row delete only, audited.
- Adding a second currency without also adding `currency` to the dedupe key.

## Bank reconciliation (statement vs QuickBooks)

`/accounting/reconciliation` matches `BankTransaction` rows against QBO bank activity for one QBO bank account. QuickBooks is **read-only** on this path.

- QBO client: [src/lib/quickbooks/client.ts](src/lib/quickbooks/client.ts) (GET only, SELECT-only queries, token refresh + retry, proxy mode). Never add write methods to it; the write paths (generate-expense, receive-payment) stay in `qb-api.ts`.
- Bank-side normalisation: [src/lib/quickbooks/bank-activity.ts](src/lib/quickbooks/bank-activity.ts). Direction follows `BankTransaction`: DEBIT = money out, CREDIT = money in. A Payment parked in Undeposited Funds is skipped; its Deposit carries it.
- Matcher: [src/lib/reconciliation/matcher.ts](src/lib/reconciliation/matcher.ts). Order: manual pairs, then `qbExpenseId` links (Purchase id for DEBIT; Payment id, or the Invoice it settles, for CREDIT), then exact amount within ±N days ranked by description/reference similarity, then same-transaction-different-amount (AMOUNT_MISMATCH). Amounts are decimal.js only.
- Summary maths: [src/lib/reconciliation/summary.ts](src/lib/reconciliation/summary.ts) (adjusted bank vs adjusted QuickBooks balance, unexplained difference).
- Manual match/unmatch/review decisions carry into later runs that cover the same rows. Un-matched pairs are never auto-paired again.
- Agents: `/api/cron/quickbooks-health` (daily) and `/api/cron/bank-reconciliation` (weekly), listed in `src/lib/cron-jobs.ts` with `logsRuns: true` and logged via `runLoggedCronJob` in [src/lib/cron-run-log.ts](src/lib/cron-run-log.ts).

## Quick references

- Upload route: [src/app/api/accounting/parse-statement/route.ts](src/app/api/accounting/parse-statement/route.ts)
- Save route + hooks: [src/app/api/accounting/transactions/route.ts](src/app/api/accounting/transactions/route.ts)
- Deterministic parser + dedupe + regex helpers: [src/lib/parse-excel-statement.ts](src/lib/parse-excel-statement.ts)
- Agent SDK enrichment: [src/lib/claude-parse-statement.ts](src/lib/claude-parse-statement.ts)
- Upload UI: [src/components/accounting/accounting-client.tsx](src/components/accounting/accounting-client.tsx)
- Table + edit modal: [src/components/accounting/transactions-table.tsx](src/components/accounting/transactions-table.tsx)
