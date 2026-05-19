"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Eye } from "lucide-react";

const PLACEHOLDERS: { name: string; description: string; sample: string }[] = [
  { name: "EMPLOYEE_NAME", description: "Employee full name", sample: "JANE DOE TAN" },
  { name: "NRIC", description: "Employee NRIC (if available)", sample: "S1234567A" },
  { name: "MONTH", description: "Pay-period month label, e.g. May 2026", sample: "May 2026" },
  { name: "BASIC_SALARY", description: "Basic salary, 2-decimal SGD", sample: "4,500.00" },
  { name: "GROSS_SALARY", description: "Gross salary, 2-decimal SGD", sample: "4,800.00" },
  { name: "CPF_EMPLOYEE", description: "Employee CPF deduction", sample: "960.00" },
  { name: "CPF_EMPLOYER", description: "Employer CPF contribution", sample: "816.00" },
  { name: "NET_SALARY", description: "Take-home pay", sample: "3,840.00" },
  { name: "PAYMENT_DATE", description: "Date payment is/was made", sample: "31 May 2026" },
];

function renderPreview(template: string): string {
  let out = template;
  for (const p of PLACEHOLDERS) {
    out = out.replaceAll(`{${p.name}}`, p.sample);
  }
  return out;
}

const DEFAULT_TEMPLATE = `This payslip was auto-generated on {PAYMENT_DATE} for {EMPLOYEE_NAME} (NRIC {NRIC}) for the month of {MONTH}.

For any discrepancies, please contact HR within 7 days.`;

const DEFAULT_TITLE = "Payslip for the Month {MONTH}";
const DEFAULT_HEADER_NOTE = "";

interface PayslipTemplateEditorProps {
  initialRemarks: string;
  initialTitle: string;
  initialHeaderNote: string;
  companyName: string;
  companyLogo: string | null;
}

const SAMPLE = {
  employeeName: "JANE DOE TAN",
  employeeId: "E0099",
  nric: "S1234567A",
  month: "May 2026",
  paymentDate: "31 May 2026",
  basic: "4,500.00",
  allowances: "300.00",
  gross: "4,800.00",
  cpfEmployee: "960.00",
  cpfEmployer: "816.00",
  net: "3,840.00",
};

export function PayslipTemplateEditor({ initialRemarks, initialTitle, initialHeaderNote, companyName, companyLogo }: PayslipTemplateEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState(initialRemarks?.trim() ? initialRemarks : DEFAULT_TEMPLATE);
  const [title, setTitle] = useState(initialTitle?.trim() ? initialTitle : DEFAULT_TITLE);
  const [headerNote, setHeaderNote] = useState(initialHeaderNote ?? DEFAULT_HEADER_NOTE);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/payslip-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payslipRemarks: body,
          payslipTitle: title,
          payslipHeaderNote: headerNote,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast({ title: "Saved", description: "Payslip template updated." });
      router.refresh();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-white">Payslip Template</CardTitle>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Edit the title, header note, and footer remarks shown on every generated payslip PDF.
          The company logo, employee details, salary tables, CPF rows, and take-home pay are rendered structurally from payroll data.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-gray-900 border-gray-800 text-white font-mono text-sm"
            placeholder="Payslip for the Month {MONTH}"
          />
          <p className="text-xs text-gray-500">Use <code className="text-amber-300">{`{MONTH}`}</code> to insert the pay-period month.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Header Note <span className="text-gray-500 font-normal">(optional)</span></label>
          <Input
            value={headerNote}
            onChange={(e) => setHeaderNote(e.target.value)}
            className="bg-gray-900 border-gray-800 text-white text-sm"
            placeholder="e.g. Confidential — for internal use only"
          />
          <p className="text-xs text-gray-500">Appears centered just under the company name. Leave blank to hide.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Footer / Remarks</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="bg-gray-900 border-gray-800 text-white font-mono text-sm"
            placeholder="Enter the remarks shown at the bottom of every payslip..."
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBody(DEFAULT_TEMPLATE);
              setTitle(DEFAULT_TITLE);
              setHeaderNote(DEFAULT_HEADER_NOTE);
            }}
            className="text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Use default template
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-gray-300">Payslip Preview</h3>
            <span className="text-xs text-gray-500">(dummy values)</span>
          </div>
          <div className="bg-white text-gray-900 rounded-md border border-gray-300 p-8 max-h-[40rem] overflow-y-auto shadow-sm">
            {/* Header: logo + company name */}
            <div className="flex items-center gap-4 border-b border-gray-300 pb-4">
              {companyLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogo} alt={companyName} className="h-14 w-auto object-contain" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-blue-700 text-white font-bold text-2xl flex items-center justify-center">
                  T
                </div>
              )}
              <div className="flex-1">
                <p className="text-lg font-bold leading-tight">{companyName}</p>
                {headerNote.trim() && (
                  <p className="text-xs text-gray-600 mt-1">{headerNote}</p>
                )}
              </div>
            </div>

            {/* Title (editable) */}
            <h2 className="text-center text-xl font-bold mt-6 mb-6 tracking-wide">
              {(title || DEFAULT_TITLE).replaceAll("{MONTH}", SAMPLE.month)}
            </h2>

            {/* Employee details */}
            <table className="w-full text-sm mb-6">
              <tbody>
                <tr>
                  <td className="py-1 font-semibold text-gray-700 w-40">Employee Name</td>
                  <td className="py-1">{SAMPLE.employeeName}</td>
                  <td className="py-1 font-semibold text-gray-700 w-40">Employee ID</td>
                  <td className="py-1">{SAMPLE.employeeId}</td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-gray-700">NRIC</td>
                  <td className="py-1">{SAMPLE.nric}</td>
                  <td className="py-1 font-semibold text-gray-700">Payment Date</td>
                  <td className="py-1">{SAMPLE.paymentDate}</td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-gray-700">Month of Payment</td>
                  <td className="py-1" colSpan={3}>{SAMPLE.month}</td>
                </tr>
              </tbody>
            </table>

            {/* Salary breakdown */}
            <table className="w-full text-sm border border-gray-300 mb-4">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-gray-300">Description</th>
                  <th className="text-right px-3 py-2 border-b border-gray-300 w-40">Amount (SGD)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-1.5 border-b border-gray-200">Basic Salary</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 text-right">{SAMPLE.basic}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 border-b border-gray-200">Allowances</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 text-right">{SAMPLE.allowances}</td>
                </tr>
                <tr className="font-semibold bg-gray-50">
                  <td className="px-3 py-1.5 border-b border-gray-200">Gross Salary</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 text-right">{SAMPLE.gross}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 border-b border-gray-200">CPF Employee Contribution</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 text-right">({SAMPLE.cpfEmployee})</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 border-b border-gray-200">CPF Employer Contribution</td>
                  <td className="px-3 py-1.5 border-b border-gray-200 text-right">{SAMPLE.cpfEmployer}</td>
                </tr>
                <tr className="font-bold bg-blue-50">
                  <td className="px-3 py-2">Take Home Pay</td>
                  <td className="px-3 py-2 text-right">SGD {SAMPLE.net}</td>
                </tr>
              </tbody>
            </table>

            {/* Editable footer/remarks */}
            <div className="border-t border-gray-300 pt-4 mt-6">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Remarks</p>
              <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700 leading-relaxed">
                {renderPreview(body) || <span className="text-gray-400 italic">Footer is empty.</span>}
              </pre>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Logo, employee details, salary table, and CPF / take-home rows are rendered from payroll data. The <span className="text-gray-300">Title</span>, <span className="text-gray-300">Header Note</span>, and <span className="text-gray-300">Remarks</span> above are editable.
          </p>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Available placeholders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {PLACEHOLDERS.map((p) => (
              <div key={p.name} className="flex items-start gap-2 bg-gray-900 border border-gray-800 rounded px-2 py-1.5">
                <code className="text-amber-300 font-mono whitespace-nowrap">{`{${p.name}}`}</code>
                <span className="text-gray-400">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
