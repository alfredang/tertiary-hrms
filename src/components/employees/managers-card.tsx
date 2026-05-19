"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Trash2, Plus, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  position: string | null;
}

interface ManagersCardProps {
  employeeId: string;
  initialManagers: ManagerOption[];
  candidates: ManagerOption[]; // all potential managers (excluding self)
  canEdit: boolean;
}

export function ManagersCard({
  employeeId,
  initialManagers,
  candidates,
  canEdit,
}: ManagersCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [managers, setManagers] = useState<ManagerOption[]>(initialManagers);
  const [pendingId, setPendingId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const persist = async (nextIds: string[]) => {
    const res = await fetch(`/api/employees/${employeeId}/managers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerIds: nextIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Save failed");
    }
  };

  const addManager = async () => {
    if (!pendingId) return;
    if (managers.some((m) => m.id === pendingId)) {
      toast({ title: "Already added", description: "That person is already a manager." });
      return;
    }
    const candidate = candidates.find((c) => c.id === pendingId);
    if (!candidate) return;
    setSaving(true);
    try {
      const nextIds = [...managers.map((m) => m.id), candidate.id];
      await persist(nextIds);
      setManagers([...managers, candidate].sort((a, b) => a.name.localeCompare(b.name)));
      setPendingId("");
      toast({ title: "Manager added", description: `${candidate.name} can now approve.` });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to add",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeManager = async (id: string) => {
    setRemovingId(id);
    try {
      const nextIds = managers.filter((m) => m.id !== id).map((m) => m.id);
      await persist(nextIds);
      setManagers(managers.filter((m) => m.id !== id));
      toast({ title: "Manager removed" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to remove",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const availableCandidates = candidates.filter(
    (c) => !managers.some((m) => m.id === c.id),
  );

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Users className="h-5 w-5" />
          Manager(s)
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Approval emails for leave / MC / expense claims are sent to these people.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {managers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No manager assigned. Approval emails will fall back to the company default approver.
          </p>
        ) : (
          <ul className="space-y-2">
            {managers.map((m) => (
              <li
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.name}</p>
                  {m.position && <p className="text-xs text-gray-500 truncate">{m.position}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400 font-mono truncate">{m.email}</p>
                  {canEdit && (
                    <button
                      onClick={() => removeManager(m.id)}
                      disabled={removingId === m.id}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50"
                      title="Remove manager"
                    >
                      {removingId === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && availableCandidates.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
            <div className="flex-1 min-w-0">
              <Select value={pendingId} onValueChange={setPendingId}>
                <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="Select a manager to add..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCandidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.position ? ` — ${c.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addManager} disabled={!pendingId || saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>
        )}

        {canEdit && availableCandidates.length === 0 && managers.length > 0 && (
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-800">
            All eligible employees are already assigned as managers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
