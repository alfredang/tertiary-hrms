"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit {leaveTypeName}{" "}
              <span className="text-gray-400 text-sm font-normal">({leaveTypeCode})</span>
            </DialogTitle>
          </DialogHeader>

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

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-gray-700 text-gray-300"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
