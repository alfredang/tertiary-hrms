"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ViewToggle() {
  const router = useRouter();
  const [currentView, setCurrentView] = useState("admin");

  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("viewAs="));
    if (cookie) {
      setCurrentView(cookie.split("=")[1]);
    }
  }, []);

  const handleToggle = (view: string) => {
    document.cookie = `viewAs=${view};path=/;max-age=${60 * 60 * 24 * 365}`;
    setCurrentView(view);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
      <button
        onClick={() => handleToggle("admin")}
        className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
          currentView === "admin"
            ? "bg-primary text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <span className="sm:hidden">Admin</span>
        <span className="hidden sm:inline">Show as Admin</span>
      </button>
      <button
        onClick={() => handleToggle("staff")}
        className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
          currentView === "staff"
            ? "bg-primary text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <span className="sm:hidden">Staff</span>
        <span className="hidden sm:inline">Show as Staff</span>
      </button>
    </div>
  );
}
