"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Eye, EyeOff, CheckCircle2, Bot, RefreshCw } from "lucide-react";

interface AgentApiKeyCardProps {
  apiKey: string;
}

/** 32 random bytes as hex — same shape as `openssl rand -hex 32`. */
function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bearer key external AI agents send to /api/agent/* (e.g. the monthly
 * leave & MC summary). Rotating it here takes effect immediately — the agent
 * must be given the new key.
 */
export function AgentApiKeyCard({ apiKey }: AgentApiKeyCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(apiKey);
  const [visible, setVisible] = useState(false);

  const isConfigured = !!apiKey;

  const handleCancel = () => {
    setValue(apiKey);
    setVisible(false);
    setEditing(false);
  };

  const handleGenerate = () => {
    setValue(generateKey());
    setVisible(true);
  };

  const handleSave = async () => {
    if (value.trim().length < 32) {
      toast({
        title: "Error",
        description: "Key must be at least 32 characters — use Generate",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ AGENT_API_KEY: value.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Saved", description: "AI agent API key updated. Give the new key to your agent." });
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
            <Bot className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-white">AI Agent API Key</CardTitle>
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
          Bearer key for external AI agents calling{" "}
          <span className="font-mono text-gray-300">/api/agent/leave-summary</span> (monthly leave
          &amp; MC summary). Anyone with this key can read staff leave records.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-gray-300">API Key</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white font-mono"
                placeholder="Click Generate"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Generate
              </Button>
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
