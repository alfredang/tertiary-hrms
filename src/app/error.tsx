"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
        <p className="mt-2 text-sm text-gray-400">
          An unexpected error occurred. Please try again.
        </p>
        <p className="mt-2 text-xs text-red-400 font-mono break-all">
          {error.message}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-gray-500">Digest: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
