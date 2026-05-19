"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw } from "lucide-react";

const PLACEHOLDERS: { name: string; description: string }[] = [
  { name: "EMPLOYEE_NAME", description: "Employee full name" },
  { name: "NRIC", description: "Employee NRIC (if available)" },
  { name: "MONTH", description: "Pay-period month label, e.g. May 2026" },
  { name: "BASIC_SALARY", description: "Basic salary, 2-decimal SGD" },
  { name: "GROSS_SALARY", description: "Gross salary, 2-decimal SGD" },
  { name: "CPF_EMPLOYEE", description: "Employee CPF deduction" },
  { name: "CPF_EMPLOYER", description: "Employer CPF contribution" },
  { name: "NET_SALARY", description: "Take-home pay" },
  { name: "PAYMENT_DATE", description: "Date payment is/was made" },
];

const DEFAULT_TEMPLATE = `This payslip was auto-generated on {PAYMENT_DATE} for {EMPLOYEE_NAME} (NRIC {NRIC}) for the month of {MONTH}.

Gross Salary: SGD {GROSS_SALARY}
CPF Employee: SGD {CPF_EMPLOYEE}
CPF Employer: SGD {CPF_EMPLOYER}
Take Home Pay: SGD {NET_SALARY}

For any discrepancies, please contact HR within 7 days.`;

export function PayslipTemplateEditor({ initialRemarks }: { initialRemarks: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState(initialRemarks);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/payslip-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslipRemarks: body }),
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
          Editable footer / remarks text that appears at the bottom of every generated payslip PDF.
          The PDF layout above this section (company logo, title, employee details, salary tables, CPF, take-home pay)
          is fixed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Footer / Remarks</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="bg-gray-900 border-gray-800 text-white font-mono text-sm"
            placeholder="Enter the remarks shown at the bottom of every payslip..."
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBody(DEFAULT_TEMPLATE)}
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
