import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * HARD RULE (Alfred, 26 Nov 2026): a payslip is never sent out in any form — no email, no
 * attachment, no copy in the person's Drive folder. People sign in to the HRMS web portal or
 * the apps to view and download it (/api/payroll/payslip/[id]/pdf builds it on request).
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("payslips are never sent out", () => {
  const files = sourceFiles(join(process.cwd(), "src"));

  it("no code emails a payslip or copies it to Drive", () => {
    const offenders = files.filter((f) =>
      /emailPayslip|sendPayslip|uploadPayslipToDrive|payslip-email|buildPayslipPdfBuffer[\s\S]{0,400}(sendEmail|attachments|uploadPdfToFolder)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("the PDF is only built in the signed-in download route", () => {
    const users = files.filter(
      (f) => !f.endsWith("payslip-drive.ts") && readFileSync(f, "utf8").includes("buildPayslipPdfBuffer"),
    );
    // Forward slashes first, so the check also passes on Windows.
    expect(users.map((f) => f.replace(/\\/g, "/").replace(/^.*\/src\//, "src/"))).toEqual(["src/app/api/payroll/payslip/[id]/pdf/route.ts"]);
  });
});
