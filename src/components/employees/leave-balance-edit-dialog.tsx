"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  employeeId: string;
  leaveBalanceId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  currentEntitlement: number;
  currentCarriedOver: number;
}

export function LeaveBalanceEditDialog({
  employeeId,
  leaveBalanceId,
  leaveTypeName,
  leaveTypeCode,
  currentEntitlement,
  currentCarriedOver,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entitlement, setEntitlement] = useState(String(currentEntitlement));
  const [carriedOver, setCarriedOver] = useState(String(currentCarriedOver));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setEntitlement(String(currentEntitlement));
    setCarriedOver(String(currentCarriedOver));
    setError(null);
    setOpen(true);
  };

  const handleSave = async () => {
    const entitlementNum = parseFloat(entitlement);
    const carriedOverNum = parseFloat(carriedOver);

    if (isNaN(entitlementNum) || entitlementNum < 0) {
      setError("Entitlement must be a valid non-negative number.");
      return;
    }
    if (isNaN(carriedOverNum) || carriedOverNum < 0) {
      setError("Carried over must be a valid non-negative number.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/leave-balance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveBalanceId,
          entitlement: entitlementNum,
          carriedOver: carriedOverNum,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update leave balance.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-gray-500 hover:text-white"
        onClick={handleOpen}
        title={`Edit ${leaveTypeName}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-sm bg-gray-950 border border-gray-800 rounded-xl p-6 text-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-base font-semibold text-white">
                Edit {leaveTypeName}{" "}
                <span className="text-gray-400 text-sm font-normal">({leaveTypeCode})</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="text-gray-400 hover:text-white transition-colors rounded-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-gray-300">Entitlement (days)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={entitlement}
                  onChange={(e) => setEntitlement(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300">Carried Over (days)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={carriedOver}
                  onChange={(e) => setCarriedOver(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="border-gray-700 text-gray-300"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving…</> : "Save Changes"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
