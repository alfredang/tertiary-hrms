"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InternCompensationCardProps {
  employeeId: string;
  initialAllowance: number;
  canEdit: boolean;
}

export function InternCompensationCard({
  employeeId,
  initialAllowance,
  canEdit,
}: InternCompensationCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [allowance, setAllowance] = useState<string>(String(initialAllowance ?? 0));
  const [saving, setSaving] = useState(false);

  const original = String(initialAllowance ?? 0);
  const dirty = allowance !== original;

  const save = async () => {
    const value = Number(allowance);
    if (!Number.isFinite(value) || value < 0) {
      toast({
        title: "Invalid allowance",
        description: "Allowance must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/intern-allowance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowance: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const data = await res.json();
      toast({
        title: "Allowance saved",
        description: data.payslipUpdated
          ? `Current-month payslip regenerated (SGD ${value.toFixed(2)}).`
          : `Saved. No active pay period to regenerate.`,
      });
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
          Compensation
        </CardTitle>
        <p className="text-xs text-gray-400 mt-1">
          Interns are paid via monthly allowance. No CPF contribution applies.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">Monthly Allowance (SGD)</label>
          {canEdit ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
                className="bg-gray-900 border-gray-800 text-white"
                placeholder="0.00"
              />
              <Button
                onClick={save}
                disabled={!dirty || saving}
                size="sm"
                className="shrink-0"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          ) : (
            <p className="text-2xl font-bold text-white">
              ${Number(initialAllowance).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-gray-800 text-sm text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>CPF Employee</span>
            <span className="text-gray-500">$0.00</span>
          </div>
          <div className="flex justify-between">
            <span>CPF Employer</span>
            <span className="text-gray-500">$0.00</span>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800">
          <p className="text-sm text-gray-400">Net Take-Home (Monthly)</p>
          <p className="text-xl font-bold text-green-400 mt-1">
            ${Number(allowance || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        {canEdit && (
          <p className="text-xs text-gray-500">
            Saving regenerates the current-month payslip automatically and replaces the Drive PDF.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
