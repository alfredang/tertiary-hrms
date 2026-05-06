"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { XCircle } from "lucide-react";

const REASONS: Record<string, string> = {
  expired_link:   "This link has expired. Please ask HR to send a new invite.",
  missing_token:  "Invalid link. Please use the link from your invite email.",
  missing_params: "The Singpass callback was missing required parameters.",
  access_denied:  "You declined the Singpass authorisation. Please try again or contact HR.",
};

function ErrorContent() {
  const params = useSearchParams();
  const reason = params.get("reason") || "unknown_error";
  const message = REASONS[reason] || `An error occurred: ${reason}. Please contact HR.`;

  return (
    <div className="text-center max-w-sm w-full">
      <div className="flex justify-center mb-6">
        <XCircle className="h-16 w-16 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">Something went wrong</h1>
      <p className="text-gray-400">{message}</p>
    </div>
  );
}

export default function MyInfoErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Suspense fallback={<p className="text-gray-400">Loading…</p>}>
        <ErrorContent />
      </Suspense>
    </div>
  );
}
