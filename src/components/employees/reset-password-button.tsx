"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  employeeName: string;
}

export function ResetPasswordButton({ employeeId, employeeName }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!confirm(`Reset ${employeeName}'s password to the default (Password123)?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/reset-password`, { method: "POST" });
      if (res.ok) {
        setDone(true);
        setTimeout(() => setDone(false), 5000);
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to reset password.");
      }
    } catch {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReset}
      disabled={loading}
      className={done ? "border-green-700 text-green-400" : "border-gray-700 text-gray-400 hover:text-white"}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <KeyRound className="h-3.5 w-3.5 mr-1.5" />
      )}
      {done ? "Password Reset!" : "Reset Password"}
    </Button>
  );
}
