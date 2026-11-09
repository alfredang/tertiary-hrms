"use client";

import { useState } from "react";

/** NRIC shown masked; "Show" reveals the full number on this page only. */
export function NricReveal({ masked, full }: { masked: string; full: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{shown ? full : masked}</span>
      <button type="button" onClick={() => setShown(!shown)} className="text-xs text-primary hover:underline">
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}
