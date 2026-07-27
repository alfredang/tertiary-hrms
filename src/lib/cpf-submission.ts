import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Parsing of a CPF EZPay "Confirm Employee Details" PDF into per-employee
 * contribution rows, so payroll can be generated from the figures actually
 * submitted to the CPF Board rather than recomputed locally.
 */

export const CPF_SUBMISSION_FOLDER_ID = "1MxYeWySFBfblSVn1qCoRK_XH445td731";

const MODEL = "claude-sonnet-5";

const RowSchema = z.object({
  cpfAccountNo: z.string().trim().min(1),
  name: z.string().trim().min(1),
  cpfToBePaid: z.number(),
  sdlToBePaid: z.number(),
  employerCpf: z.number(),
  employeeCpf: z.number(),
  ordinaryWages: z.number(),
  additionalWages: z.number(),
});

const ResponseSchema = z.object({
  cpfSubmissionNo: z.string().trim().nullable(),
  companyName: z.string().trim().nullable(),
  /** Contribution period as a month/year pair, e.g. JUL 2026 -> {month: 7, year: 2026}. */
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  totalCpfContributions: z.number().nullable(),
  totalSdl: z.number().nullable(),
  grandTotal: z.number().nullable(),
  employees: z.array(RowSchema),
});

export type CpfSubmissionRow = z.infer<typeof RowSchema>;
export type CpfSubmission = z.infer<typeof ResponseSchema>;

const SYSTEM_PROMPT = `You extract structured data from Singapore CPF Board "CPF EZPay" contribution statements (the "Confirm Employee Details" PDF).

The document has:
- A header block: CPF Submission No., Company Name, and "Contribution Details For" (a month and year, e.g. "JUL 2026").
- A summary table of contribution categories (Total CPF Contributions, SDL, MBMF/SINDA/CDAC/ECF donations, Grand Total).
- A per-employee table, possibly spanning several pages, with these columns:
  S/N | CPF Account No. | Name of Employee (as per NRIC) | CPF To Be Paid ($) | SDL To Be Paid ($) | Employer CPF ($) | Employee CPF ($) | Ordinary Wages ($) | Additional Wages ($) | Agency | Agency Fund ($)

Rules:
- Return EVERY employee row across ALL pages. Do not stop at the first page and do not summarise.
- Exclude the "Total Amount" footer row from the employees array.
- Strip thousands separators and currency symbols; return plain numbers (1,280.00 -> 1280.00).
- A dash "-" or blank in a numeric column means 0.
- Keep the employee name exactly as printed, in its original order and capitalisation.
- "Contribution Details For: JUL 2026" means month 7, year 2026.
- Reply with ONLY a single JSON object inside a \`\`\`json fenced code block. No prose before or after.

JSON shape:
{
  "cpfSubmissionNo": string|null,
  "companyName": string|null,
  "month": number,
  "year": number,
  "totalCpfContributions": number|null,
  "totalSdl": number|null,
  "grandTotal": number|null,
  "employees": [
    {
      "cpfAccountNo": string,
      "name": string,
      "cpfToBePaid": number,
      "sdlToBePaid": number,
      "employerCpf": number,
      "employeeCpf": number,
      "ordinaryWages": number,
      "additionalWages": number
    }
  ]
}`;

/** Resolve the Anthropic API key from CompanyCredential, falling back to env. */
export async function getClaudeApiKey(): Promise<string | null> {
  const row = await prisma.companyCredential.findUnique({
    where: { keyName: "CLAUDE_API_KEY" },
  });
  return row?.keyValue?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/**
 * Send the raw PDF bytes to Claude as a native `document` content block and
 * parse the per-employee CPF contribution rows out of the response.
 */
export async function parseCpfSubmissionPdf(opts: {
  pdfBuffer: Buffer;
  filename: string;
  apiKey: string;
}): Promise<CpfSubmission> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: opts.pdfBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `Extract every employee contribution row from this CPF EZPay statement (source file: ${opts.filename}).`,
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  if (!text.trim()) {
    throw new Error("Claude returned an empty response for the CPF statement");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    throw new Error("Could not parse JSON out of the CPF statement response");
  }

  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected CPF statement structure: ${parsed.error.message}`);
  }
  if (parsed.data.employees.length === 0) {
    throw new Error("No employee rows found in the CPF statement");
  }
  return parsed.data;
}

/** Normalise a name for fuzzy matching: uppercase, alphanumeric words only. */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(name: string): Set<string> {
  return new Set(normaliseName(name).split(" ").filter(Boolean));
}

/** Levenshtein distance, bounded by `max` for an early exit. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Whether two name parts are close enough to be the same name romanised
 * differently.
 *
 * A one-letter *substitution* is only accepted on longer tokens, because among
 * short names a single swapped letter usually means a different family
 * altogether (TAN vs TAM vs ANG). A one-letter *insertion* is accepted at any
 * length — it is the common romanisation difference (KIM vs KHIM) and cannot
 * turn a short name into an unrelated one of the same length.
 */
function isNearToken(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === b.length) {
    return a.length > 3 && editDistance(a, b, 1) <= 1;
  }
  return editDistance(a, b, 1) <= 1;
}

export interface MatchCandidate {
  id: string;
  name: string;
  nric: string | null;
}

export interface NameMatch {
  employeeId: string | null;
  employeeName: string | null;
  /** "nric" | "exact" | "tokens" | null */
  method: "nric" | "exact" | "tokens" | null;
  ambiguous: boolean;
}

/**
 * Match a CPF statement row to an Employee.
 *
 * The CPF account number IS the NRIC/FIN, so that is tried first and is
 * authoritative. Otherwise names are compared after normalisation, then by
 * token overlap — CPF prints names as per NRIC, which often reorders or drops
 * parts relative to the HRMS record (e.g. "SHO CHOON KIM" vs
 * "JASMINE SHO CHOOK KHIM").
 */
export function matchEmployee(
  row: { cpfAccountNo: string; name: string },
  candidates: MatchCandidate[],
): NameMatch {
  const none: NameMatch = {
    employeeId: null,
    employeeName: null,
    method: null,
    ambiguous: false,
  };

  const acct = row.cpfAccountNo.trim().toUpperCase();
  if (acct) {
    const byNric = candidates.filter((c) => (c.nric ?? "").trim().toUpperCase() === acct);
    if (byNric.length === 1) {
      return {
        employeeId: byNric[0].id,
        employeeName: byNric[0].name,
        method: "nric",
        ambiguous: false,
      };
    }
  }

  const target = normaliseName(row.name);
  const exact = candidates.filter((c) => normaliseName(c.name) === target);
  if (exact.length === 1) {
    return {
      employeeId: exact[0].id,
      employeeName: exact[0].name,
      method: "exact",
      ambiguous: false,
    };
  }
  if (exact.length > 1) return { ...none, ambiguous: true };

  // Token overlap: require at least two shared name parts, and take the single
  // best scorer. Anything tied or weaker is reported as unmatched so an admin
  // resolves it rather than payroll silently landing on the wrong person.
  //
  // Tokens count as shared when they are equal or near-equal — CPF prints names
  // as per NRIC, whose romanisation often differs by a letter from the HRMS
  // record (CHOON/CHOOK, KIM/KHIM). A near match scores less than an exact one
  // so a truly identical name always outranks a fuzzy one.
  const targetTokens = Array.from(nameTokens(row.name));
  const scored = candidates
    .map((c) => {
      const tokens = Array.from(nameTokens(c.name));
      let shared = 0;
      for (const t of targetTokens) {
        if (tokens.includes(t)) shared += 1;
        else if (tokens.some((u) => isNearToken(t, u))) shared += 0.75;
      }
      return { candidate: c, shared };
    })
    .filter((s) => s.shared >= 2)
    .sort((a, b) => b.shared - a.shared);

  if (scored.length === 0) return none;
  if (scored.length > 1 && scored[0].shared === scored[1].shared) {
    return { ...none, ambiguous: true };
  }
  return {
    employeeId: scored[0].candidate.id,
    employeeName: scored[0].candidate.name,
    method: "tokens",
    ambiguous: false,
  };
}
