"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ChevronDown, ChevronUp } from "lucide-react";

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  defaultDays: number;
  internDefaultDays: number;
  carryOver: boolean;
  maxCarryOver: number;
  paid: boolean;
}

const CODE_LABEL: Record<string, string> = {
  AL: "Annual Leave",
  SL: "Sick Leave",
  MC: "Medical Leave",
  CL: "Compassionate Leave",
  NPL: "No Pay Leave",
};

const READONLY_CODES = new Set(["AL_OT"]);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  );
}

export default function LeavePolicyPage() {
  const { toast } = useToast();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<LeaveType>>>({});

  useEffect(() => {
    fetch("/api/settings/leave-types")
      .then((r) => r.json())
      .then((data: LeaveType[]) => {
        setLeaveTypes(data);
        const initial: Record<string, Partial<LeaveType>> = {};
        for (const lt of data) initial[lt.id] = { ...lt };
        setEdits(initial);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function update(id: string, field: keyof LeaveType, value: unknown) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function save(lt: LeaveType) {
    const patch = edits[lt.id];
    if (!patch) return;
    setSaving(lt.id);
    try {
      const res = await fetch("/api/settings/leave-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lt.id,
          defaultDays: Number(patch.defaultDays),
          internDefaultDays: Number(patch.internDefaultDays),
          carryOver: patch.carryOver,
          maxCarryOver: Number(patch.maxCarryOver),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const updated = await res.json();
      setLeaveTypes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEdits((prev) => ({ ...prev, [updated.id]: { ...updated } }));
      toast({ title: "Saved", description: `${lt.name} policy updated successfully.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-500 h-6 w-6" />
      </div>
    );
  }

  const visible = leaveTypes.filter((lt) => !READONLY_CODES.has(lt.code));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Leave Policy</h2>
        <p className="text-sm text-gray-400 mt-1">
          Set entitlements and carry-forward rules per leave type. Changes apply to new employees and future year-end rollovers only — existing balances are unaffected.
        </p>
      </div>

      {/* Proration note */}
      <div className="rounded-lg border border-blue-800 bg-blue-950/40 px-4 py-3 text-xs text-blue-300">
        <span className="font-semibold">Proration:</span> Annual leave accrues as{" "}
        <code className="bg-blue-900/60 px-1 rounded">ceil(days / 12 × months worked)</code>.
        Example — Feb join = ceil(7 ÷ 12 × 1) = <strong>1 day</strong>.
        Carried-forward days expire after <strong>1 year</strong> and cannot roll again.
      </div>

      <div className="space-y-3">
        {visible.map((lt) => {
          const patch = edits[lt.id] ?? lt;
          const isSaving = saving === lt.id;
          const carryOn = !!(patch.carryOver ?? lt.carryOver);

          return (
            <Card key={lt.id} className="bg-gray-900 border-gray-700">
              <CardContent className="p-0">
                {/* Header row */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white text-sm">
                      {CODE_LABEL[lt.code] ?? lt.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-gray-600 text-gray-400">
                      {lt.code}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${lt.paid ? "bg-emerald-900 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                      {lt.paid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                </div>

                {/* Fields */}
                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-5">
                  <Field label="Staff days / year">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={patch.defaultDays ?? lt.defaultDays}
                      onChange={(e) => update(lt.id, "defaultDays", e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white h-9"
                    />
                  </Field>

                  <Field label="Intern days / year" hint="0 = same as staff">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={patch.internDefaultDays ?? lt.internDefaultDays}
                      onChange={(e) => update(lt.id, "internDefaultDays", e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white h-9"
                    />
                  </Field>

                  <Field label="Max carry-forward days" hint="0 = unlimited">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      disabled={!carryOn}
                      value={carryOn ? (patch.maxCarryOver ?? lt.maxCarryOver) : 0}
                      onChange={(e) => update(lt.id, "maxCarryOver", e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white h-9 disabled:opacity-40"
                    />
                  </Field>

                  <Field label="Carry-forward" hint="Unused days roll to next year">
                    <button
                      type="button"
                      onClick={() => update(lt.id, "carryOver", !carryOn)}
                      className={`w-full h-9 rounded-md text-xs font-medium transition-colors border flex items-center justify-between px-3 ${
                        carryOn
                          ? "bg-emerald-900 border-emerald-700 text-emerald-300 hover:bg-emerald-800"
                          : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      <span>{carryOn ? "Enabled" : "Disabled"}</span>
                      {carryOn ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </Field>
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => save(lt)}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white min-w-[80px]"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
