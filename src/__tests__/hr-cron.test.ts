import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockSendEmail, insights } = vi.hoisted(() => ({
  mockPrisma: {
    companySettings: { findUnique: vi.fn().mockResolvedValue({ name: "Tertiary" }) },
    notification: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin1" }, { id: "admin2" }]) },
    cronJobRun: { create: vi.fn().mockResolvedValue({ id: "run1" }), update: vi.fn().mockResolvedValue({}) },
  },
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
  insights: {
    getActiveInterns: vi.fn(),
    getMissedPunches: vi.fn(),
    getLeaveOverview: vi.fn(),
    getInternAttendance: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/send-email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/hr-insights", () => insights);

import { GET as missedClockOut } from "@/app/api/cron/missed-clock-out/route";
import { GET as hrCompliance } from "@/app/api/cron/hr-compliance/route";

const intern = { id: "e1", name: "Ivy", employeeCode: "I0013", email: "ivy@x.com", userId: "u1", workdays: [1, 2, 3, 4, 5] };

function cronReq(path: string, secret = "s3cret") {
  return new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${secret}` } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  delete process.env.HR_ALERT_EMAILS;
  mockPrisma.user.findMany.mockResolvedValue([{ id: "admin1" }, { id: "admin2" }]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });
  mockPrisma.cronJobRun.create.mockResolvedValue({ id: "run1" });
  insights.getActiveInterns.mockResolvedValue([intern]);
});

describe("Rule 5 — /api/cron/missed-clock-out", () => {
  it("requires the cron secret", async () => {
    const res = await missedClockOut(cronReq("/api/cron/missed-clock-out", "wrong"));
    expect(res.status).toBe(401);
  });

  it("reminder: notifies and emails each intern who forgot to clock out", async () => {
    insights.getMissedPunches.mockResolvedValue([{ employeeId: "e1", date: "2026-11-09", kind: "NO_CLOCK_OUT" }]);
    const res = await missedClockOut(cronReq("/api/cron/missed-clock-out"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "reminder", missedClockOut: 1, notified: 1, emailed: 1 });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", type: "ATTENDANCE_MISSED", link: "/attendance" }),
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ivy@x.com", cc: ["tansc@tertiaryinfotech.com", "angch@tertiaryinfotech.com"] }),
    );
    expect(mockPrisma.cronJobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS" }) }),
    );
  });

  it("rollup: one summary to Alfred Ang and Tan Soik Ching", async () => {
    insights.getMissedPunches.mockResolvedValue([
      { employeeId: "e1", date: "2026-11-06", kind: "NO_CLOCK_OUT" },
      { employeeId: "e1", date: "2026-11-05", kind: "NO_CLOCK_IN" },
    ]);
    const res = await missedClockOut(cronReq("/api/cron/missed-clock-out?mode=rollup"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "rollup", noClockOut: 1, noClockIn: 1, notified: 2, emailed: 2 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "tansc@tertiaryinfotech.com", cc: ["angch@tertiaryinfotech.com"] }),
    );
  });

  it("rollup is silent when nothing was missed", async () => {
    insights.getMissedPunches.mockResolvedValue([]);
    const body = await (await missedClockOut(cronReq("/api/cron/missed-clock-out?mode=rollup"))).json();
    expect(body.missed).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("Rule 7 — /api/cron/hr-compliance", () => {
  beforeEach(() => {
    insights.getLeaveOverview.mockResolvedValue([
      {
        id: "p1", name: "Pat", employeeCode: "E0011", isIntern: false,
        al: { earned: 5.5, full: 7, carried: 0, used: 0, pending: 0, allowed: 7 },
        mc: { earned: 11.5, used: 0, pending: 0 },
        npl: { cap: 17.5, used: 18, pending: 0 },
        mcLeaves: [], deficitDays: 0,
      },
    ]);
    insights.getInternAttendance.mockResolvedValue([]);
  });

  it("dryRun returns findings without alerting", async () => {
    const body = await (await hrCompliance(cronReq("/api/cron/hr-compliance?dryRun=1"))).json();
    expect(body.counts.high).toBe(1);
    expect(body.findings[0].category).toBe("NPL");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("emails and notifies both admins with the weekly summary", async () => {
    const body = await (await hrCompliance(cronReq("/api/cron/hr-compliance"))).json();
    expect(body).toMatchObject({ ok: true, notified: 2, emailed: 2 });
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ type: "HR_COMPLIANCE" })]),
    });
  });
});
