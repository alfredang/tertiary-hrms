"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Eye, EyeOff, Mail, CheckCircle2 } from "lucide-react";

interface GmailCredentialsCardProps {
  emailUser: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function GmailCredentialsCard({
  emailUser,
  clientId,
  clientSecret,
  refreshToken,
}: GmailCredentialsCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ emailUser, clientId, clientSecret, refreshToken });
  const [visible, setVisible] = useState({ clientId: false, clientSecret: false, refreshToken: false });

  const isConfigured = !!form.emailUser && !!form.refreshToken;

  const toggleVisible = (field: keyof typeof visible) =>
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));

  const handleCancel = () => {
    setForm({ emailUser, clientId, clientSecret, refreshToken });
    setEditing(false);
  };

  const handleSave = async () => {
    if (!form.emailUser.trim() || !form.clientId.trim() || !form.clientSecret.trim()) {
      toast({ title: "Error", description: "Email, Client ID and Client Secret are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          GMAIL_EMAIL_USER: form.emailUser.trim(),
          GMAIL_CLIENT_ID: form.clientId.trim(),
          GMAIL_CLIENT_SECRET: form.clientSecret.trim(),
          ...(form.refreshToken.trim() && { GMAIL_REFRESH_TOKEN: form.refreshToken.trim() }),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Credentials saved", description: "Gmail credentials updated." });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to save credentials", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const mask = (val: string) =>
    val ? val.slice(0, 4) + "•".repeat(Math.max(0, val.length - 8)) + val.slice(-4) : "—";

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-white">Gmail (OTP Email)</CardTitle>
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
          Gmail OAuth 2.0 credentials used to send OTP verification emails. Configure via{" "}
          <span className="text-gray-300">Google Cloud Console</span> with the Gmail API scope.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Email User */}
        <div className="space-y-2">
          <Label className="text-gray-300">Gmail Address</Label>
          {editing ? (
            <Input
              type="email"
              value={form.emailUser}
              onChange={(e) => setForm((p) => ({ ...p, emailUser: e.target.value }))}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="sender@gmail.com"
            />
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {form.emailUser || <span className="text-gray-500">Not set</span>}
            </p>
          )}
        </div>

        {/* Client ID */}
        <div className="space-y-2">
          <Label className="text-gray-300">Client ID</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible.clientId ? "text" : "password"}
                value={form.clientId}
                onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="Enter Client ID"
              />
              <button
                type="button"
                onClick={() => toggleVisible("clientId")}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {visible.clientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {clientId ? mask(clientId) : <span className="text-gray-500">Not set</span>}
            </p>
          )}
        </div>

        {/* Client Secret */}
        <div className="space-y-2">
          <Label className="text-gray-300">Client Secret</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible.clientSecret ? "text" : "password"}
                value={form.clientSecret}
                onChange={(e) => setForm((p) => ({ ...p, clientSecret: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="Enter Client Secret"
              />
              <button
                type="button"
                onClick={() => toggleVisible("clientSecret")}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {visible.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {clientSecret ? mask(clientSecret) : <span className="text-gray-500">Not set</span>}
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

        {/* Refresh Token */}
        <div className="border-t border-gray-800 pt-5 space-y-2">
          <Label className="text-gray-300">
            Refresh Token{" "}
            <span className="text-xs text-gray-500 font-normal">(enter manually from OAuth Playground)</span>
          </Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type={visible.refreshToken ? "text" : "password"}
                value={form.refreshToken}
                onChange={(e) => setForm((p) => ({ ...p, refreshToken: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="Enter Refresh Token"
              />
              <button
                type="button"
                onClick={() => toggleVisible("refreshToken")}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {visible.refreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800">
              {form.refreshToken ? mask(form.refreshToken) : <span className="text-gray-500">Not set</span>}
            </p>
          )}
          <p className="text-xs text-gray-500">
            Generate at{" "}
            <span className="text-gray-400">developers.google.com/oauthplayground</span> using the{" "}
            <span className="text-gray-400">https://mail.google.com/</span> scope.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
