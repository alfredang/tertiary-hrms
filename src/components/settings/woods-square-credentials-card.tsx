"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Eye, EyeOff, CheckCircle2, Building2 } from "lucide-react";

interface WoodsSquareCredentialsCardProps {
  username: string;
  password: string;
}

export function WoodsSquareCredentialsCard({ username, password }: WoodsSquareCredentialsCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(username);
  const [pass, setPass] = useState(password);
  const [visible, setVisible] = useState(false);

  const isConfigured = !!username && !!password;

  const handleCancel = () => {
    setUser(username);
    setPass(password);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user.trim() || !pass.trim()) {
      toast({
        title: "Error",
        description: "Username and password are both required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ HABITAP_USERNAME: user.trim(), HABITAP_PASSWORD: pass.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Saved", description: "Woods Square credentials updated." });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to save credentials", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const maskPass = (val: string) => (val ? "•".repeat(Math.min(val.length, 12)) : "—");

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-white">Woods Square Access</CardTitle>
            {isConfigured && (
              <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Configured
              </span>
            )}
          </div>
          {!editing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Occupant-portal login used to send building-access invites.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-gray-300">Username (email)</Label>
          {editing ? (
            <Input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white font-mono"
              placeholder="name@company.com"
              autoComplete="off"
            />
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {username || <span className="text-gray-500">Not set</span>}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-gray-300">Password</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white font-mono"
                placeholder="••••••••"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {password ? maskPass(password) : <span className="text-gray-500">Not set</span>}
            </p>
          )}
        </div>

        {editing && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            {saving ? "Saving..." : "Save Credentials"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
