"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

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
  AL_OT: "Accumulated Leave (OT)",
};

const READONLY_CODES = new Set(["AL_OT"]);

export default function LeavePolicyPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<LeaveType>>>({});

  useEffect(() => {
    fetch("/api/settings/leave-types")
      .then((r) => r.json())
      .then((data) => {
        setLeaveTypes(data);
        const initial: Record<string, Partial<LeaveType>> = {};
        for (const lt of data) initial[lt.id] = { ...lt };
        setEdits(initial);
        setLoading(false);
      });
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
          defaultDays: patch.defaultDays,
          internDefaultDays: patch.internDefaultDays,
          carryOver: patch.carryOver,
          maxCarryOver: patch.maxCarryOver,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setLeaveTypes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEdits((prev) => ({ ...prev, [updated.id]: { ...updated } }));
      toast.success(`${lt.name} updated`);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400 h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Leave Policy</h2>
        <p className="text-sm text-gray-400 mt-1">
          Configure default entitlements, intern allocations, and carry-forward rules.
          Changes apply to new employees and future rollover cycles — existing balances are not retroactively adjusted.
        </p>
      </div>

      <div className="grid gap-4">
        {leaveTypes
          .filter((lt) => !READONLY_CODES.has(lt.code))
          .map((lt) => {
            const patch = edits[lt.id] ?? lt;
            const isSaving = saving === lt.id;

            return (
              <Card key={lt.id} className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base text-white">
                      {CODE_LABEL[lt.code] ?? lt.name}
                    </CardTitle>
                    <Badge variant={lt.paid ? "default" : "secondary"} className="text-xs">
                      {lt.paid ? "Paid" : "Unpaid"}
                    </Badge>
                    <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                      {lt.code}
                    </Badge>
                  </div>
                  {lt.description && (
                    <p className="text-xs text-gray-500">{lt.description}</p>
                  )}
                </CardHeader>

                <Separator className="bg-gray-700" />

                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-400">Staff Default (days/year)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={patch.defaultDays ?? lt.defaultDays}
                        onChange={(e) => update(lt.id, "defaultDays", Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-400">
                        Intern Default (days/year)
                        <span className="ml-1 text-gray-600">0 = same as staff</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={patch.internDefaultDays ?? lt.internDefaultDays}
                        onChange={(e) => update(lt.id, "internDefaultDays", Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-400">Max Carry-Forward (days)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        disabled={!(patch.carryOver ?? lt.carryOver)}
                        value={patch.carryOver ?? lt.carryOver ? (patch.maxCarryOver ?? lt.maxCarryOver) : 0}
                        onChange={(e) => update(lt.id, "maxCarryOver", Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white h-8 text-sm disabled:opacity-40"
                      />
                      <p className="text-xs text-gray-600">0 = unlimited</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-400">Allow Carry-Forward</Label>
                      <div className="flex items-center gap-2 h-8">
                        <Switch
                          checked={patch.carryOver ?? lt.carryOver}
                          onCheckedChange={(v) => update(lt.id, "carryOver", v)}
                        />
                        <span className="text-xs text-gray-400">
                          {patch.carryOver ?? lt.carryOver ? "Yes" : "No"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">Unused days roll to next year only</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => save(lt)}
                      disabled={isSaving}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Card className="bg-gray-900 border-gray-700 border-dashed">
        <CardContent className="py-4">
          <p className="text-xs text-gray-500">
            <strong className="text-gray-400">Proration rule:</strong> Annual leave is prorated as{" "}
            <code className="bg-gray-800 px-1 rounded">ceil(staffDays / 12 × months worked)</code>.
            Carried-forward days expire after one year (they are not rolled forward again).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
