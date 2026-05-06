"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";

function AuthorizeContent() {
  const params = useSearchParams();
  const token  = params.get("token");

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400">Invalid link. Please ask HR to resend the invite.</p>
      </div>
    );
  }

  return (
    <div className="text-center max-w-md w-full mx-auto">
      {/* Singpass-style logo area */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <span className="text-2xl font-bold text-white">Singpass</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white mb-2">Complete Your Employee Profile</h1>
          <p className="text-gray-400 text-sm">
            Authorise Singpass to securely share your personal information with your HR team.
            No manual entry needed.
          </p>
        </div>

        <div className="bg-gray-800/60 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Data that will be retrieved
          </p>
          {[
            "Full name",
            "Date of birth",
            "Gender",
            "Nationality",
            "Mobile number",
            "Registered address",
            "Education level",
            "NRIC",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <a
          href={`/api/myinfo/auth?token=${encodeURIComponent(token)}`}
          className="block w-full py-3 rounded-xl font-semibold text-white text-center"
          style={{ background: "#c0152b" }}
        >
          Connect via Singpass
        </a>

        <p className="text-xs text-gray-500">
          You will be redirected to the official Singpass website. Your data is protected under the
          Personal Data Protection Act (PDPA).
        </p>
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Suspense fallback={<p className="text-gray-400">Loading…</p>}>
        <AuthorizeContent />
      </Suspense>
    </div>
  );
}
