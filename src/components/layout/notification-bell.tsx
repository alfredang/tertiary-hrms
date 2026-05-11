"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, CheckCheck, Clock, CalendarCheck, CalendarX, Briefcase, Info } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

const ADMIN_TYPES = new Set(["LEAVE_SUBMITTED", "OT_PENDING"]);
const EMPLOYEE_TYPES = new Set(["LEAVE_APPROVED", "LEAVE_REJECTED", "OT_APPROVED", "OT_REJECTED", "INFO"]);

const typeIcon: Record<string, React.ReactNode> = {
  LEAVE_APPROVED:  <CalendarCheck className="h-4 w-4 text-green-400" />,
  LEAVE_REJECTED:  <CalendarX className="h-4 w-4 text-red-400" />,
  LEAVE_SUBMITTED: <Clock className="h-4 w-4 text-blue-400" />,
  OT_APPROVED:     <Briefcase className="h-4 w-4 text-emerald-400" />,
  OT_REJECTED:     <Briefcase className="h-4 w-4 text-red-400" />,
  OT_PENDING:      <Briefcase className="h-4 w-4 text-amber-400" />,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface BellProps {
  viewAs?: string;
}

export function NotificationBell({ viewAs = "admin" }: BellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // IDs we've already fired a browser popup for — populated on first load to avoid
  // spamming the user with old notifications on page refresh
  const seenRef = useRef<Set<string> | null>(null);
  const isFirstLoad = useRef(true);

  const isAdminView = viewAs === "admin";
  const visible = notifications.filter((n) =>
    isAdminView ? ADMIN_TYPES.has(n.type) : EMPLOYEE_TYPES.has(n.type)
  );
  const unread = visible.filter((n) => !n.read).length;

  // Sync browser permission state on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const fireBrowserNotif = useCallback((n: Notification) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const notif = new Notification(n.title, {
      body: n.message,
      icon: "/favicon.ico",
      tag: n.id, // prevents duplicate popups for the same notification
    });
    notif.onclick = () => {
      window.focus();
      if (n.link) router.push(n.link);
      notif.close();
    };
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const fresh: Notification[] = await res.json();

      setNotifications(fresh);

      // On first load just seed seenRef — don't fire popups for existing items
      if (isFirstLoad.current) {
        seenRef.current = new Set(fresh.map((n) => n.id));
        isFirstLoad.current = false;
        return;
      }

      // On subsequent polls, fire browser notification for any brand-new unread items
      // that match the current role view
      const relevantTypes = isAdminView ? ADMIN_TYPES : EMPLOYEE_TYPES;
      for (const n of fresh) {
        if (!n.read && relevantTypes.has(n.type) && !seenRef.current?.has(n.id)) {
          seenRef.current?.add(n.id);
          fireBrowserNotif(n);
        }
      }
    } catch {
      // ignore
    }
  }, [isAdminView, fireBrowserNotif]);

  // Initial load + poll every 30s
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markOne = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAll = async () => {
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}/read`, { method: "POST" })));
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) await markOne(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const browserNotifSupported = typeof window !== "undefined" && "Notification" in window;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 sm:w-96 rounded-xl border border-gray-800 bg-gray-950 shadow-2xl overflow-hidden">

          {/* Browser push permission banner */}
          {browserNotifSupported && permission === "default" && (
            <div className="flex items-start gap-3 px-4 py-3 bg-blue-950/40 border-b border-blue-800/40">
              <Bell className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-200">Enable desktop notifications</p>
                <p className="text-[11px] text-blue-400 mt-0.5">
                  Get notified even when you&apos;re on another tab.
                </p>
              </div>
              <button
                onClick={requestPermission}
                className="shrink-0 rounded-md bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
              >
                Allow
              </button>
            </div>
          )}

          {browserNotifSupported && permission === "denied" && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900/60 border-b border-gray-800">
              <BellOff className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <p className="text-[11px] text-gray-500">
                Desktop notifications blocked. Enable them in your browser site settings to get popups.
              </p>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              Notifications
              {unread > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {unread} new
                </span>
              )}
              {permission === "granted" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-green-500">
                  <Check className="h-3 w-3" /> desktop on
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/60">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-gray-500">
                <Bell className="h-8 w-8 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              visible.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-900 transition-colors ${n.read ? "opacity-60" : ""}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {typeIcon[n.type] ?? <Info className="h-4 w-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold truncate ${n.read ? "text-gray-400" : "text-white"}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  {!n.read && <div className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-blue-500" />}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {visible.length > 0 && (
            <div className="border-t border-gray-800 px-4 py-2.5 text-center">
              <button
                onClick={() => { setOpen(false); router.push("/leave"); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                View leave page →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
