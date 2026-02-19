"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Application error</h2>
            <p className="mt-2 text-sm text-gray-600">
              The app encountered an unrecoverable error.
            </p>
            <p className="mt-2 text-xs text-gray-500">{error.message}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
