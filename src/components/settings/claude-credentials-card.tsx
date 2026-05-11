"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Eye, EyeOff, CheckCircle2, Sparkles } from "lucide-react";

interface ClaudeCredentialsCardProps {
  apiKey: string;
}

export function ClaudeCredentialsCard({ apiKey }: ClaudeCredentialsCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(apiKey);
  const [visible, setVisible] = useState(false);

  const isConfigured = !!apiKey;

  const handleCancel = () => {
    setValue(apiKey);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!value.trim()) {
      toast({
        title: "Error",
        description: "API key is required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ CLAUDE_API_KEY: value.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Saved", description: "Claude API key updated." });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to save API key", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const mask = (val: string) =>
    val ? val.slice(0, 6) + "•".repeat(Math.max(0, val.length - 10)) + val.slice(-4) : "—";

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-white">Claude Subscription</CardTitle>
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
          Anthropic API token used for in-app Claude features.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-gray-300">API Token</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white font-mono"
                placeholder="sk-ant-..."
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
              {apiKey ? mask(apiKey) : <span className="text-gray-500">Not set</span>}
            </p>
          )}
        </div>

        {editing && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            {saving ? "Saving..." : "Save API Key"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
