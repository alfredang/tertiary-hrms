import { describe, it, expect } from "vitest";
import { pickRelevant, requestIdFromLink, linkWithRequest, type NotificationRow } from "@/lib/notification-relevance";

const now = new Date("2026-11-22T06:00:00Z"); // 14:00 SGT
let seq = 0;
const row = (type: string, hoursAgo: number, extra: Partial<NotificationRow> = {}): NotificationRow => ({
  id: `n${++seq}`, type, title: extra.title ?? type, message: extra.message ?? `m${seq}`,
  link: extra.link ?? null, read: false, createdAt: new Date(now.getTime() - hoursAgo * 3600_000),
});
const ids = (r: NotificationRow[]) => r.map((n) => n.id);

describe("notification relevance", () => {
  it("drops anything older than 30 days", () => {
    const keep = row("LEAVE_APPROVED", 24 * 29);
    const old = row("LEAVE_APPROVED", 24 * 31);
    expect(ids(pickRelevant([keep, old], () => true, now))).toEqual([keep.id]);
  });

  it("keeps an approval request only while it is pending, once per request", () => {
    const a1 = row("LEAVE_SUBMITTED", 1, { link: linkWithRequest("/leave", "L1") });
    const a2 = row("LEAVE_SUBMITTED", 2, { link: linkWithRequest("/leave", "L1"), message: "again" });
    const decided = row("EXPENSE_SUBMITTED", 3, { link: linkWithRequest("/expenses", "E9") });
    const r = pickRelevant([a1, a2, decided], (_t, id) => id === "L1", now);
    expect(ids(r)).toEqual([a1.id]);
  });

  it("keeps a request without an id for 3 days only", () => {
    const fresh = row("LEAVE_SUBMITTED", 24 * 2, { link: "/leave" });
    const stale = row("LEAVE_SUBMITTED", 24 * 4, { link: "/leave" });
    expect(ids(pickRelevant([fresh, stale], () => true, now))).toEqual([fresh.id]);
  });

  it("keeps only the newest snapshot alert of each type", () => {
    const today = row("ATTENDANCE_ROLLUP", 5);
    const yesterday = row("ATTENDANCE_ROLLUP", 29);
    const recon = row("BANK_RECONCILIATION", 48);
    expect(ids(pickRelevant([today, yesterday, recon], () => true, now))).toEqual([today.id, recon.id]);
  });

  it("shows 'today' alerts only on their day (Singapore time)", () => {
    const yesterdayAway = row("AWAY_TODAY", 20); // 18:00 SGT the day before
    const missedToday = row("ATTENDANCE_MISSED", 2);
    expect(ids(pickRelevant([missedToday, yesterdayAway], () => true, now))).toEqual([missedToday.id]);
  });

  it("drops exact repeats", () => {
    const a = row("INFO", 1, { title: "Hi", message: "Same" });
    const b = row("INFO", 2, { title: "Hi", message: "Same" });
    expect(ids(pickRelevant([a, b], () => true, now))).toEqual([a.id]);
  });

  it("reads the request id from a link", () => {
    expect(requestIdFromLink("/leave?request=abc")).toBe("abc");
    expect(requestIdFromLink("/expenses?tab=x&request=e%201")).toBe("e 1");
    expect(requestIdFromLink("/leave")).toBeNull();
    expect(linkWithRequest("/approvals?tab=leave", "z")).toBe("/approvals?tab=leave&request=z");
  });
});
