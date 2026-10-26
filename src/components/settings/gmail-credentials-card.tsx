"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Eye, EyeOff, Mail, CheckCircle2, FlaskConical, HardDrive, Loader2, LogIn, AlertTriangle, RefreshCw } from "lucide-react";

interface TokenStatus {
  status: "ok" | "expired" | "unconfigured" | "error";
  email?: string | null;
  hasDrive?: boolean;
  message: string;
}

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
  const [testing, setTesting] = useState(false);
  const [testingDrive, setTestingDrive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [callbackUri, setCallbackUri] = useState("");

  // Live health of the stored refresh token. This is the credential whose
  // expiry surfaces to employees as a login error on the web and mobile apps,
  // so it is checked on load rather than only when something breaks.
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const checkTokenStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/settings/google-oauth/status");
      setTokenStatus(await res.json());
    } catch {
      setTokenStatus({ status: "error", message: "Could not reach the status endpoint." });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkTokenStatus();
  }, []);

  // Result of the Google sign-in connect flow, passed back as query params by
  // /api/settings/google-oauth/callback.
  useEffect(() => {
    setCallbackUri(`${window.location.origin}/api/settings/google-oauth/callback`);
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("google");
    const error = params.get("google_error");
    if (!connected && !error) return;
    if (connected === "connected") {
      const email = params.get("email");
      toast({
        title: "Google connected",
        description: `New refresh token saved${email ? ` for ${email}` : ""}. Use Test / Test Drive to verify.`,
      });
    } else if (error) {
      toast({ title: "Google sign-in failed", description: error, variant: "destructive" });
    }
    router.replace("/settings/credentials");
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    setConnecting(true);
    window.location.href = "/api/settings/google-oauth/start";
  };

  // Paste-a-code renewal. Used when the OAuth client lives in a Google Cloud
  // project the admins cannot administer, so our own callback URL can't be
  // registered on it — Google's OAuth Playground redirect already is.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteCode, setPasteCode] = useState("");
  const [exchanging, setExchanging] = useState(false);

  const openConsent = async () => {
    try {
      const res = await fetch("/api/settings/google-oauth/paste");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build the sign-in link");
      setPasteOpen(true);
      window.open(data.consentUrl, "_blank", "noopener");
    } catch (e) {
      toast({
        title: "Could not start",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const submitCode = async () => {
    setExchanging(true);
    try {
      const res = await fetch("/api/settings/google-oauth/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pasteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({
        title: "Google reconnected",
        description: `New refresh token saved${data.email ? ` for ${data.email}` : ""}.`,
      });
      setPasteCode("");
      setPasteOpen(false);
      await checkTokenStatus();
      router.refresh();
    } catch (e) {
      toast({
        title: "Could not save the code",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setExchanging(false);
    }
  };
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

  const handleTest = async () => {
    if (!form.emailUser) {
      toast({ title: "No Gmail address set", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: form.emailUser }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Gmail working", description: data.message });
      } else {
        toast({
          title: `Gmail test failed (${data.step})`,
          description: data.hint || data.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Test request failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleTestDrive = async () => {
    setTestingDrive(true);
    try {
      const res = await fetch("/api/settings/test-drive", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Google Drive working", description: data.message });
      } else {
        toast({
          title: `Drive test failed (${data.step})`,
          description: data.hint || data.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Test request failed", variant: "destructive" });
    } finally {
      setTestingDrive(false);
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
            <CardTitle className="text-white">Google OAuth</CardTitle>
            {checking ? (
              <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking
              </span>
            ) : tokenStatus?.status === "ok" ? (
              <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </span>
            ) : tokenStatus?.status === "expired" ? (
              <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Token expired
              </span>
            ) : isConfigured ? (
              <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Needs attention
              </span>
            ) : null}
          </div>
          {!editing ? (
            <div className="flex items-center gap-2">
              {isConfigured && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="text-gray-400 hover:text-cyan-400 hover:bg-gray-800"
                >
                  {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />}
                  Test
                </Button>
              )}
              {isConfigured && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTestDrive}
                  disabled={testingDrive}
                  className="text-gray-400 hover:text-cyan-400 hover:bg-gray-800"
                >
                  {testingDrive ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <HardDrive className="h-4 w-4 mr-1" />}
                  Test Drive
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={checkTokenStatus}
                disabled={checking}
                className="text-gray-400 hover:text-cyan-400 hover:bg-gray-800"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${checking ? "animate-spin" : ""}`} />
                Re-check
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
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
          Google OAuth 2.0 credentials used to send OTP/payslip emails <em>and</em> to archive files to
          Google Drive (CPF statements, payslips). Configure via{" "}
          <span className="text-gray-300">Google Cloud Console</span> with the Gmail and Drive API scopes.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Live token health. Renewing is a one-click action here because an
            expired token blocks OTP email on both the web and mobile apps. */}
        {!checking && tokenStatus && tokenStatus.status !== "ok" && (
          <div className="rounded-md border border-red-900/60 bg-red-950/40 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-300">
                  {tokenStatus.status === "expired"
                    ? "Google token expired — employees cannot receive one-time codes"
                    : tokenStatus.status === "unconfigured"
                      ? "Google is not connected yet"
                      : "Google token check failed"}
                </p>
                <p className="text-xs text-red-200/80">{tokenStatus.message}</p>
              </div>
            </div>
            <Button
              onClick={handleConnect}
              disabled={connecting || !form.clientId || !form.clientSecret}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {connecting ? "Redirecting to Google..." : "Renew token now"}
            </Button>
          </div>
        )}
        {!checking && tokenStatus?.status === "ok" && (
          <div className="rounded-md border border-green-900/60 bg-green-950/30 px-4 py-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <p className="text-xs text-green-200/90">
              {tokenStatus.message}
              {tokenStatus.email ? ` Connected as ${tokenStatus.email}.` : ""}
            </p>
          </div>
        )}

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
            <div className="flex items-center gap-2">
              <p className="flex-1 text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800 break-all">
                {clientId ? (visible.clientId ? clientId : mask(clientId)) : <span className="text-gray-500">Not set</span>}
              </p>
              {clientId && (
                <button
                  type="button"
                  onClick={() => toggleVisible("clientId")}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label={visible.clientId ? "Hide Client ID" : "Show Client ID"}
                >
                  {visible.clientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              <p className="flex-1 text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800 break-all">
                {clientSecret ? (visible.clientSecret ? clientSecret : mask(clientSecret)) : <span className="text-gray-500">Not set</span>}
              </p>
              {clientSecret && (
                <button
                  type="button"
                  onClick={() => toggleVisible("clientSecret")}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label={visible.clientSecret ? "Hide Client Secret" : "Show Client Secret"}
                >
                  {visible.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
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
            <span className="text-xs text-gray-500 font-normal">(set automatically by “Sign in with Google” below)</span>
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
            <div className="flex items-center gap-2">
              <p className="flex-1 text-white font-mono text-sm bg-gray-900 rounded-md px-3 py-2 border border-gray-800 break-all">
                {form.refreshToken ? (visible.refreshToken ? form.refreshToken : mask(form.refreshToken)) : <span className="text-gray-500">Not set</span>}
              </p>
              {form.refreshToken && (
                <button
                  type="button"
                  onClick={() => toggleVisible("refreshToken")}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label={visible.refreshToken ? "Hide Refresh Token" : "Show Refresh Token"}
                >
                  {visible.refreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
          )}
          <Button
            onClick={handleConnect}
            disabled={connecting || !form.clientId || !form.clientSecret}
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
            {connecting ? "Redirecting to Google..." : "Sign in with Google to renew token"}
          </Button>

          {/* Fallback renewal for when our own callback URL is not registered on
              the OAuth client (its Google Cloud project may be administered by
              someone else). Google's OAuth Playground redirect is registered, so
              the admin signs in there and pastes the code back here. */}
          <div className="rounded-md border border-gray-800 bg-gray-900/50 p-3 space-y-2">
            <p className="text-xs text-gray-400">
              If the button above fails with <span className="font-mono">redirect_uri_mismatch</span>,
              renew it this way instead — no Google Cloud Console access needed.
            </p>
            {!pasteOpen ? (
              <Button
                variant="outline"
                onClick={openConsent}
                disabled={!form.clientId || !form.clientSecret}
                className="w-full border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Renew by pasting a code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">
                  A Google tab opened. Sign in, click Allow, then copy the{" "}
                  <span className="text-gray-300">code=</span> value from that page&rsquo;s URL and
                  paste it below.
                </p>
                <Input
                  value={pasteCode}
                  onChange={(e) => setPasteCode(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white font-mono text-xs"
                  placeholder="4/0A..."
                />
                <div className="flex gap-2">
                  <Button
                    onClick={submitCode}
                    disabled={exchanging || !pasteCode.trim()}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white"
                  >
                    {exchanging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {exchanging ? "Saving..." : "Save token"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setPasteOpen(false); setPasteCode(""); }}
                    className="text-gray-400 hover:text-white hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Sign in as the company account ({form.emailUser || "the Gmail sender"}) — the new refresh
            token (Gmail + Drive scopes) is saved automatically. One-time setup: the OAuth client in{" "}
            <span className="text-gray-400">Google Cloud Console</span> must list this redirect URI:{" "}
            <span className="text-gray-400 break-all">{callbackUri || "…/api/settings/google-oauth/callback"}</span>
          </p>
          <p className="text-xs text-gray-500">
            Manual alternative: generate at{" "}
            <span className="text-gray-400">developers.google.com/oauthplayground</span> (gear icon → use
            your own OAuth credentials) authorising BOTH scopes:{" "}
            <span className="text-gray-400">https://mail.google.com/</span> and{" "}
            <span className="text-gray-400">https://www.googleapis.com/auth/drive</span> — the same token
            sends email and uploads to Drive. If tokens keep expiring after ~7 days, publish the OAuth
            consent screen to Production in Google Cloud Console.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
