"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, Loader2, Save, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffCompensationCardProps {
  employeeId: string;
  initial: {
    basicSalary: number;
    allowances: number;
    cpfApplicable: boolean;
    cpfEmployeeRate: number;
    cpfEmployerRate: number;
    payNow: string | null;
  };
  canEdit: boolean;
  hasSalaryInfo: boolean;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function StaffCompensationCard({
  employeeId,
  initial,
  canEdit,
  hasSalaryInfo,
}: StaffCompensationCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [basicSalary, setBasicSalary] = useState<string>(String(initial.basicSalary ?? 0));
  const [saving, setSaving] = useState(false);

  const basic = Number(basicSalary) || 0;
  const allow = initial.allowances;
  const cpfApplicable = initial.cpfApplicable;
  const eeRate = initial.cpfEmployeeRate;
  const erRate = initial.cpfEmployerRate;
  const gross = basic + allow;
  const cpfEE = cpfApplicable ? (basic * eeRate) / 100 : 0;
  const cpfER = cpfApplicable ? (basic * erRate) / 100 : 0;
  const net = gross - cpfEE;

  const cancel = () => {
    setBasicSalary(String(initial.basicSalary ?? 0));
    setEditing(false);
  };

  const save = async () => {
    if (basic < 0) {
      toast({
        title: "Invalid salary",
        description: "Basic salary must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/salary-info`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basicSalary: basic }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const data = await res.json();
      toast({
        title: "Basic salary saved",
        description: data.payslipUpdated
          ? "Current-month payslip regenerated."
          : "Saved. No active pay period to regenerate.",
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <DollarSign className="h-5 w-5" />
          Compensation &amp; CPF
        </CardTitle>
        {!hasSalaryInfo && canEdit && (
          <p className="text-xs text-amber-400 mt-1">
            No salary info entered yet — click the pencil to set the basic salary.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Basic Salary (Monthly)</p>
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="p-1 text-gray-400 hover:text-white"
                title="Edit basic salary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {editing ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={basicSalary}
                onChange={(e) => setBasicSalary(e.target.value)}
                className="bg-gray-900 border-gray-800 text-white"
                autoFocus
              />
              <Button onClick={save} disabled={saving} size="sm" className="shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
              <Button onClick={cancel} disabled={saving} size="sm" variant="outline" className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-white mt-1">${fmt(basic)}</p>
          )}
        </div>

        {allow > 0 && (
          <div>
            <p className="text-sm text-gray-400">Allowances (Monthly)</p>
            <p className="text-lg font-medium text-gray-300">${fmt(allow)}</p>
          </div>
        )}

        <div className="pt-2 border-t border-gray-800">
          <p className="text-sm text-gray-400">Gross Salary (Monthly)</p>
          <p className="text-xl font-bold text-white mt-1">${fmt(gross)}</p>
        </div>

        {initial.payNow && (
          <div>
            <p className="text-sm text-gray-400">PayNow</p>
            <p className="font-medium text-white mt-1">{initial.payNow}</p>
          </div>
        )}

        {cpfApplicable && (
          <>
            <div className="pt-2 border-t border-gray-800">
              <p className="text-sm font-medium text-gray-300 mb-2">CPF Contributions</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Employee ({eeRate}%)</span>
                  <span className="text-orange-400 font-medium">-${fmt(cpfEE)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Employer ({erRate}%)</span>
                  <span className="text-blue-400 font-medium">+${fmt(cpfER)}</span>
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-800">
              <p className="text-sm text-gray-400">Take Home Pay</p>
              <p className="text-2xl font-bold text-green-400 mt-1">${fmt(net)}</p>
            </div>
          </>
        )}

        {canEdit && editing && (
          <p className="text-xs text-gray-500">
            Saving regenerates the current-month payslip and replaces the Drive PDF.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
