"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Smartphone, CheckCircle2 } from "lucide-react";

interface MobileSignInCardProps {
  iosClientId: string;
  androidClientId: string;
}

/**
 * Google Sign-In client ids for the native iOS/Android apps.
 *
 * These are the audiences `/api/auth/google-mobile` accepts. They are public
 * values — a native OAuth client has no secret, and the backend still verifies
 * every id_token with Google — so they are shown in full rather than masked.
 */
export function MobileSignInCard({ iosClientId, androidClientId }: MobileSignInCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ iosClientId, androidClientId });

  const configured = !!form.iosClientId || !!form.androidClientId;

  const handleCancel = () => {
    setForm({ iosClientId, androidClientId });
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.iosClientId.trim() && { GOOGLE_IOS_CLIENT_ID: form.iosClientId.trim() }),
          ...(form.androidClientId.trim() && {
            GOOGLE_ANDROID_CLIENT_ID: form.androidClientId.trim(),
          }),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({
        title: "Mobile sign-in updated",
        description: "The native apps can now sign in with Google.",
      });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to save client IDs", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: "iosClientId" | "androidClientId",
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <Label className="text-gray-300">{label}</Label>
      {editing ? (
        <Input
          value={form[key]}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          className="bg-gray-900 border-gray-700 text-white"
          placeholder={placeholder}
        />
      ) : (
        <p className="text-white font-mono text-xs bg-gray-900 rounded-md px-3 py-2 border border-gray-800 break-all">
          {form[key] || <span className="text-gray-500">Not set</span>}
        </p>
      )}
    </div>
  );

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-white">Mobile Sign-In (Google)</CardTitle>
            {configured && (
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
          OAuth client IDs the native iOS and Android apps use for “Continue with Google”. Employees
          who sign in this way don’t need a one-time email code, so this keeps mobile login working
          even if Gmail sending is down.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {field("iOS Client ID", "iosClientId", "…apps.googleusercontent.com")}
        {field("Android Client ID", "androidClientId", "…apps.googleusercontent.com")}

        {editing && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            {saving ? "Saving..." : "Save Client IDs"}
          </Button>
        )}

        <p className="text-xs text-gray-500">
          Create these in{" "}
          <span className="text-gray-400">Google Cloud Console → Credentials → Create OAuth
          client ID</span>, choosing application type <span className="text-gray-400">iOS</span> or{" "}
          <span className="text-gray-400">Android</span>. The iOS client needs the app’s bundle ID{" "}
          <span className="text-gray-400">com.tertiaryinfotech.hrportal</span>. These are public
          values — native OAuth clients carry no secret, and the server independently verifies every
          sign-in with Google.
        </p>
      </CardContent>
    </Card>
  );
}
