"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_NAME } from "@/lib/constants";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Could not start Google sign-in. Please try again or use email/password.",
  OAuthCallback: "Google sign-in was cancelled or failed. Please try again.",
  OAuthCreateAccount: "Could not create your account via Google. Please contact HR.",
  OAuthAccountNotLinked:
    "This email is already registered with a password. Please sign in with your email and password instead.",
  Callback: "Sign-in was interrupted. Please try again.",
  CredentialsSignin: "Invalid email or password.",
  AccessDenied: "Your account is inactive. Please contact HR.",
  Default: "An error occurred during sign-in. Please try again or contact HR.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Read OAuth error from URL query params
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(OAUTH_ERROR_MESSAGES[urlError] || OAUTH_ERROR_MESSAGES.Default);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

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
      // Check if running in native Capacitor app
      const { Capacitor } = await import("@capacitor/core");

      if (Capacitor.isNativePlatform()) {
        // Native mobile: use Capacitor Google Auth plugin
        const { GoogleAuth } = await import(
          "@codetrix-studio/capacitor-google-auth"
        );
        await GoogleAuth.initialize();
        const result = await GoogleAuth.signIn();

        if (!result.authentication?.idToken) {
          throw new Error("No ID token received from Google");
        }

        // Send the ID token to our backend for verification + session creation
        const res = await fetch("/api/auth/google-mobile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: result.authentication.idToken,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Authentication failed");
        }

        window.location.href = "/dashboard";
      } else {
        // Web: use standard NextAuth OAuth redirect flow
        await signIn("google", { callbackUrl: "/dashboard" });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed";
      setError(message + ". Please try again.");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo + Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-2xl font-bold text-white">HR</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400">
            Sign in to {COMPANY_NAME} HR Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
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
                <Label htmlFor="password" className="text-gray-300">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => setError("Please contact your HR administrator to reset your password.")}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
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
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-900 px-2 text-gray-500">
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
            onClick={handleGoogleSignIn}
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirecting to Google...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600">
          {COMPANY_NAME} HR Portal
        </p>
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6">
          <div className="space-y-4">
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
          </div>
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
