# Plan: Fix All npm Security Vulnerabilities

## Context

After running `npm audit fix`, 15 vulnerabilities remain that require either breaking dependency changes or no-fix-available scenarios. This plan fixes all of them in 4 ordered phases, from safest to most complex.

**Starting state:** 15 vulnerabilities (2 critical, 4 high, 9 moderate)
**Target state:** 0 critical, 0 high, 0 moderate (1 dev-only advisory accepted)

---

## Phase 1: Patch Updates — `next` + `next-auth`
**Risk: Very Low | Fixes: 2 critical, 1 moderate**

Same-version-family bumps, no code changes needed.

```bash
npm install next@14.2.35 next-auth@5.0.0-beta.30
```

**Verify:**
```bash
npm run test     # 100 unit tests must pass
npm run build    # tsc + next build must be clean
```

---

## Phase 2: Replace `xlsx` with `exceljs`
**Risk: Low-Medium | Fixes: 2 high (no upstream fix for xlsx)**

### Install
```bash
npm uninstall xlsx
npm install exceljs
```

### File: `src/app/api/payroll/upload/route.ts` (lines 4, 32–36)

**Replace:**
```typescript
import * as XLSX from "xlsx";

// Inside POST handler:
const arrayBuffer = await file.arrayBuffer();
const workbook = XLSX.read(arrayBuffer, { type: "array" });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
```

**With:**
```typescript
import ExcelJS from "exceljs";

// Inside POST handler:
const arrayBuffer = await file.arrayBuffer();
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(arrayBuffer));
const worksheet = workbook.worksheets[0];
if (!worksheet) {
  return NextResponse.json(
    { error: "Excel file has no worksheets" },
    { status: 400 }
  );
}

// Build header map from row 1
const headers: Record<number, string> = {};
worksheet.getRow(1).eachCell((cell, col) => {
  headers[col] = String(cell.value ?? "").trim();
});

// Convert rows to Record<string, unknown>[]
const rows: Record<string, unknown>[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return; // skip header
  const rowData: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (headers[col]) {
      rowData[headers[col]] = typeof cell.value === "number"
        ? cell.value
        : cell.text || cell.value;
    }
  });
  rows.push(rowData);
});
```

Everything from line 38 onward (the `if (rows.length === 0)` check and all subsequent logic) is **unchanged** — `rows` is still `Record<string, unknown>[]` with the same column-name keys.

### File: `scripts/read-excel.ts` (dev script — replace XLSX.readFile pattern)

```typescript
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile("staff.xlsx");
const worksheet = workbook.worksheets[0];
const headers: Record<number, string> = {};
worksheet.getRow(1).eachCell((cell, col) => {
  headers[col] = String(cell.value ?? "").trim();
});
const data: Record<string, unknown>[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const obj: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (headers[col]) obj[headers[col]] = cell.text || cell.value;
  });
  data.push(obj);
});
```

### File: `scripts/import-staff.ts` (dev script — same pattern as above)
Replace `XLSX.readFile()` + `XLSX.utils.sheet_to_json()` with the ExcelJS readFile + header-map pattern. All Prisma logic after row parsing is unchanged.

**Verify:**
```bash
npm run test
npm run build
# Manual test: upload an Excel file at /payroll → Excel upload
```

---

## Phase 3: Fix `jspdf` DOMPurify Vulnerability via npm Overrides
**Risk: Very Low | Fixes: 1 moderate (DOMPurify XSS)**

Instead of upgrading jsPDF to v4 (which would break `jspdf-autotable` compatibility), force the vulnerable transitive dependency `dompurify` to a patched version using npm overrides.

### Edit `package.json` — add overrides section

```json
{
  "overrides": {
    "dompurify": "^3.2.4"
  }
}
```

Then apply it:
```bash
npm install
```

**No code changes needed.** `src/lib/pdf-generator.ts` stays exactly the same.

**Verify:**
```bash
npm run test
npm run build
npm audit    # dompurify advisory should be resolved
# Manual test: download a PDF payslip at /payroll and verify all 4 tables render correctly
```

---

## Phase 4: Upgrade `ai` SDK v3 → v6 + all `@ai-sdk/*` providers
**Risk: Medium | Fixes: 2 moderate (filetype bypass + jsondiffpatch XSS)**

The chat widget has no API keys configured (inactive in production), so regressions here have zero user impact.

### Install
```bash
npm install zod@^3.25.76
npm install ai@6.0.108
npm install @ai-sdk/google@latest @ai-sdk/openai@latest @ai-sdk/anthropic@latest
```

Note: `ai@6` requires `zod >= 3.25.76`. The zod update is a patch within 3.x — all existing schemas continue to work.

### File: `src/app/api/chat/route.ts`

**Change 1:** Remove `await` from all 3 `streamText()` calls (lines 69, 82, 95).
In v6, `streamText` is synchronous — it returns a stream directly, not a Promise.

```typescript
// Before:
result = await streamText({ model: google("gemini-1.5-flash"), system: systemPrompt, messages });

// After:
result = streamText({ model: google("gemini-1.5-flash"), system: systemPrompt, messages });
```
Apply to all three blocks (Gemini, OpenAI, Anthropic).

**Change 2:** `result.toDataStreamResponse()` — verify this still exists after install.
If TypeScript errors show it was renamed, replace with `result.toUIMessageStreamResponse()`.

### File: `src/components/chat/chat-widget.tsx`

The `useChat` hook API changed significantly between v3 and v6. After installing, run `npm run build` — TypeScript will surface the exact errors. Expected changes:

| v3 (current) | v6 pattern |
|---|---|
| `import { useChat } from "ai/react"` | May need `"@ai-sdk/react"` |
| `input, handleInputChange, handleSubmit` | May need manual `useState` + `append()` |
| `message.content` (string) | May become `message.parts` array |

**Fallback pattern if `input`/`handleInputChange`/`handleSubmit` are removed:**

```typescript
const [inputValue, setInputValue] = useState("");
const { messages, append, isLoading } = useChat({ api: "/api/chat" });

const handleSend = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!inputValue.trim()) return;
  const text = inputValue;
  setInputValue("");
  await append({ role: "user", content: text });
};
```

Then update the JSX: replace `value={input}` → `value={inputValue}`, `onChange={handleInputChange}` → `onChange={e => setInputValue(e.target.value)}`, `onSubmit={handleSubmit}` → `onSubmit={handleSend}`.

For `message.content`: if TypeScript errors show it's now `UIMessage`, use `message.parts?.[0]?.type === "text" ? message.parts[0].text : ""` instead of `message.content`.

**Strategy:** Run `npm run build` after install and fix errors as they appear — TypeScript will be the guide.

**Verify:**
```bash
npm run test
npm run build    # Critical gate — must be clean
npm audit        # All 15 vulnerabilities should be gone
```

---

## Accepted Advisory (Won't Fix)

**`glob` in `eslint-config-next@14.x`** (High — Command injection via CLI flag)
Fix requires `eslint-config-next@16` which pulls in Next.js 15 — out of scope.
This only affects the ESLint dev toolchain, not the running application. Zero runtime risk.

---

## Commit Strategy

One commit per phase (allows individual revert):
```
fix: upgrade next to 14.2.35 and next-auth to beta.30 (critical CVE fixes)
fix: replace xlsx with exceljs (prototype pollution, no upstream fix available)
fix: force dompurify@3.2.4 via npm overrides (jspdf transitive XSS)
fix: upgrade ai SDK to v6 and @ai-sdk/* providers (filetype bypass + jsondiffpatch XSS)
```

---

## Critical Files

- `src/app/api/payroll/upload/route.ts` — xlsx → exceljs migration (lines 4, 32–36)
- `scripts/read-excel.ts` — xlsx → exceljs (dev script)
- `scripts/import-staff.ts` — xlsx → exceljs (dev script)
- `src/app/api/chat/route.ts` — remove `await` from streamText (lines 69, 82, 95)
- `src/components/chat/chat-widget.tsx` — useChat hook API update
- `package.json` — overrides section + all version bumps
