"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, KeyRound } from "lucide-react";

type Step = "email" | "otp" | "password";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Could not start Google sign-in. Please try again or use email/password.",
  OAuthCallback: "Google sign-in was cancelled or failed. Please try again.",
  OAuthCreateAccount: "Could not create your account via Google. Please contact HR.",
  OAuthAccountNotLinked:
    "This email is already registered with a password. Please sign in with your email and password instead.",
  Callback: "Sign-in was interrupted. Please try again.",
  CredentialsSignin: "Invalid credentials. Please try again.",
  AccessDenied: "Your account is inactive. Please contact HR.",
  Default: "An error occurred during sign-in. Please try again or contact HR.",
};

const REMEMBER_EMAIL_KEY = "hrms_remembered_email";
const REMEMBER_FLAG_KEY = "hrms_remember_email";

function LoginForm() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [skipLoadingRole, setSkipLoadingRole] = useState<string | null>(null);
  const [branding, setBranding] = useState<{ name: string; shortName: string | null; logo: string | null }>({
    name: "",
    shortName: null,
    logo: null,
  });

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Fetch company branding (name, short name, logo) from public endpoint
  useEffect(() => {
    fetch("/api/public/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBranding({ name: data.name, shortName: data.shortName, logo: data.logo });
      })
      .catch(() => { /* fall back to defaults */ });
  }, []);

  const displayName = branding.shortName || branding.name || "HR Portal";
  const footerName = branding.name || "HR Portal";
  const logoInitials = (branding.shortName || branding.name || "HR")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Load remembered email on mount
  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_FLAG_KEY) === "true";
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
    setRememberEmail(remembered);
    if (remembered && savedEmail) setEmail(savedEmail);
  }, []);

  // Read OAuth error from URL
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(OAUTH_ERROR_MESSAGES[urlError] || OAUTH_ERROR_MESSAGES.Default);
    }
  }, [searchParams]);

  // Auto-focus OTP input when entering OTP step
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  const handleRememberChange = (checked: boolean) => {
    setRememberEmail(checked);
    localStorage.setItem(REMEMBER_FLAG_KEY, String(checked));
    if (!checked) localStorage.removeItem(REMEMBER_EMAIL_KEY);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (isLoading) return;
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();

      if (result.success) {
        if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, email.toLowerCase().trim());
        setOtp("");
        setStep("otp");
        setSuccessMessage(
          result.emailConfigured === false
            ? "OTP generated. Email delivery not yet configured — please use password login or ask your admin."
            : result.message || "OTP sent to your email."
        );
      } else {
        setError(result.error || "Failed to send OTP. Please try again.");
      }
    } catch {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    setError("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccessMessage("A new OTP has been sent to your email.");
        setTimeout(() => setSuccessMessage(""), 10000);
      } else {
        setError(result.error || "Failed to resend OTP.");
      }
    } catch {
      setError("Failed to resend OTP.");
    } finally {
      setTimeout(() => setIsResending(false), 5000);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);
    try {
      const result = await signIn("otp", { email, otp, redirect: false });
      if (result?.error) {
        setError("Invalid or expired OTP. Please request a new one.");
        setOtp("");
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, email.toLowerCase().trim());
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password.");
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setIsGoogleLoading(false);
    }
  };

  const handleSkipLogin = async (role: "admin" | "staff" | "staff2") => {
    setError("");
    setSkipLoadingRole(role);
    const testPassword = process.env.NEXT_PUBLIC_TEST_PASSWORD || "123456";
    const emails: Record<string, string> = {
      admin: "admin@tertiaryinfotech.com",
      staff: "staff@tertiaryinfotech.com",
      staff2: "staff2@tertiaryinfotech.com",
    };
    try {
      const result = await signIn("credentials", {
        email: emails[role],
        password: testPassword,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid credentials. Make sure test accounts exist (run prisma seed).");
        setSkipLoadingRole(null);
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Skip login failed.");
      setSkipLoadingRole(null);
    }
  };

  const goToPassword = () => {
    setStep("password");
    setError("");
    setSuccessMessage("");
  };

  const goToEmail = () => {
    setStep("email");
    setError("");
    setSuccessMessage("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo + Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            {branding.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo}
                alt={`${displayName} logo`}
                className="w-14 h-14 rounded-2xl object-contain bg-white shadow-lg shadow-primary/20"
              />
            ) : (
              <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-2xl font-bold text-white">{logoInitials}</span>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400">Sign in to {displayName} HR Portal</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="bg-green-950/50 border border-green-800 text-green-400 text-sm p-3 rounded-lg">
              {successMessage}
            </div>
          )}

          {/* ── Step: Email (Send OTP) ─────────────────────────────────────── */}
          {step === "email" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-otp" className="text-gray-300">
                  Email
                </Label>
                <Input
                  id="email-otp"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember-email"
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => handleRememberChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-primary"
                />
                <label htmlFor="remember-email" className="text-sm text-gray-400 cursor-pointer">
                  Remember my email
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending OTP...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" />Send OTP</>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={goToPassword}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Sign in with password instead
                </button>
              </div>
            </form>
          )}

          {/* ── Step: OTP Verify ───────────────────────────────────────────── */}
          {step === "otp" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={goToEmail}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <div className="text-center space-y-1">
                <p className="text-white font-medium">Verify your identity</p>
                <p className="text-sm text-gray-400">
                  An OTP has been sent to{" "}
                  <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <label className="sr-only" htmlFor="otp-input">Enter OTP</label>
                  <Input
                    id="otp-input"
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                    maxLength={6}
                    placeholder="000000"
                    className="bg-gray-800 border-gray-700 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-gray-600 focus:border-primary"
                    required
                    disabled={isLoading}
                  />
                </div>

                <p className="text-xs text-gray-500 text-center">
                  Check your spam/junk folder if you don&apos;t see the email in your inbox.
                </p>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
                  ) : (
                    "Verify & Sign In"
                  )}
                </Button>
              </form>

              <div className="flex items-center justify-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className="text-primary hover:text-primary/80 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                  {isResending ? "Resending..." : "Resend OTP"}
                </button>
                <span className="text-gray-600">|</span>
                <button
                  type="button"
                  onClick={goToPassword}
                  className="text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Use password instead
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Password ──────────────────────────────────────────────── */}
          {step === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <button
                type="button"
                onClick={goToEmail}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <div className="space-y-2">
                <Label htmlFor="email-pw" className="text-gray-300">
                  Email
                </Label>
                <Input
                  id="email-pw"
                  type="email"
                  autoComplete="username"
                  placeholder="name@company.com"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password-input" className="text-gray-300">
                    Password
                  </Label>
                  <span className="text-xs text-gray-500">Default: Password123</span>
                </div>
                <div className="relative">
                  <Input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pr-10 focus:border-primary"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember-email-pw"
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => handleRememberChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-primary"
                />
                <label htmlFor="remember-email-pw" className="text-sm text-gray-400 cursor-pointer">
                  Remember my email
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in...</>
                ) : (
                  <><KeyRound className="h-4 w-4 mr-2" />Sign In</>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={goToEmail}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Sign in with OTP instead
                </button>
              </div>
            </form>
          )}

          {/* ── Divider ────────────────────────────────────────────────────── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-900 px-2 text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* ── Google Sign-In ──────────────────────────────────────────────── */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
            onClick={handleGoogleSignIn}
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecting to Google...</>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-600">Powered by {footerName}</p>
        </div>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-gray-800 rounded-2xl animate-pulse" />
          </div>
          <div className="h-7 bg-gray-800 rounded w-48 mx-auto animate-pulse" />
          <div className="h-5 bg-gray-800 rounded w-64 mx-auto animate-pulse" />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
