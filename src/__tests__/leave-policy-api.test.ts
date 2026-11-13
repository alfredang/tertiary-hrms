import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// API-level enforcement of the leave policy (rules 2–4) on POST /api/leave.

const { mockPrisma, mockAuth, state } = vi.hoisted(() => {
  const state = {
    leaveTypeCode: "AL",
    roles: ["STAFF"] as string[],
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    balance: { entitlement: 7, used: 0, pending: 0, carriedOver: 0, earned: 0, autoDeducted: 0 },
    nplRows: [] as Array<{ days: number; status: string }>,
  };
  return {
    state,
    mockAuth: vi.fn(),
    mockPrisma: {
      publicHoliday: { findMany: vi.fn().mockResolvedValue([]) },
      leaveType: { findUnique: vi.fn() },
      employee: { findUnique: vi.fn() },
      leaveRequest: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      leaveBalance: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/approval-email", () => ({ sendLeaveApprovalEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/drive", () => ({ getEmployeeSubfolderId: vi.fn(), getDriveClient: vi.fn() }));

import { POST as submitLeave } from "@/app/api/leave/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Mon 16 Nov – Fri 20 Nov 2026 = 5 working days; Mon 16 Nov alone = 1.
const FIVE_DAYS = { leaveTypeId: "lt", startDate: "2026-11-16", endDate: "2026-11-20" };
const ONE_DAY = { leaveTypeId: "lt", startDate: "2026-11-16", endDate: "2026-11-16" };
const THREE_DAYS = { leaveTypeId: "lt", startDate: "2026-11-16", endDate: "2026-11-18" };

beforeEach(() => {
  vi.clearAllMocks();
  // 9 Nov 2026: someone who joined 1 Sep has served Sep + Oct = 2 months.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 9, 10));

  state.leaveTypeCode = "AL";
  state.roles = ["STAFF"];
  state.startDate = new Date("2026-09-01T00:00:00.000Z");
  state.balance = { entitlement: 7, used: 0, pending: 0, carriedOver: 0, earned: 0, autoDeducted: 0 };
  state.nplRows = [];

  mockAuth.mockResolvedValue({ user: { id: "u1", role: "STAFF", employeeId: "emp1" } });
  mockPrisma.publicHoliday.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.leaveType.findUnique.mockImplementation(async () => ({ id: "lt", code: state.leaveTypeCode, name: state.leaveTypeCode, defaultDays: 7 }));
  mockPrisma.employee.findUnique.mockImplementation(async () => ({
    startDate: state.startDate,
    endDate: null,
    monthlyLeaveRate: null,
    user: { roles: state.roles },
  }));
  mockPrisma.leaveRequest.findMany.mockImplementation(async (args: { where?: { leaveType?: { code?: string } } }) =>
    args?.where?.leaveType?.code === "NPL" ? state.nplRows : [],
  );
  mockPrisma.leaveBalance.findUnique.mockImplementation(async () => ({ id: "b1", ...state.balance }));
  mockPrisma.leaveBalance.findFirst.mockResolvedValue(null);
  mockPrisma.leaveBalance.update.mockResolvedValue({});
  mockPrisma.leaveRequest.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    leaveType: { name: state.leaveTypeCode, code: state.leaveTypeCode },
    employee: { name: "Test" },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Rule 2 — AL beyond the available balance must be No Pay Leave", () => {
  it("rejects AL beyond the earned balance with NPL guidance (7 × 2/12 = 1 day earned)", async () => {
    const res = await submitLeave(req(FIVE_DAYS));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("AL_EXCEEDS_BALANCE");
    expect(body.excessDays).toBe(4);
    expect(body.suggestedLeaveTypeCode).toBe("NPL");
    expect(body.error).toMatch(/No Pay Leave/);
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("accepts AL within the earned balance and records no deficit", async () => {
    const res = await submitLeave(req(ONE_DAY));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ days: 1, deficitDays: 0 }) }),
    );
  });

  it("with advance AL on, allows up to the full-year entitlement (Sep–Dec = 4 months → 2 days) but no more", async () => {
    const two = await submitLeave(req({ ...ONE_DAY, endDate: "2026-11-17", useAdvance: true }));
    expect(two.status).toBe(201);
    const five = await submitLeave(req({ ...FIVE_DAYS, useAdvance: true }));
    expect(five.status).toBe(400);
    expect((await five.json()).excessDays).toBe(3);
  });
});

describe("Rule 3 — No Pay Leave capped at 21 days/year, prorated (21 × 2/12 = 3.5)", () => {
  beforeEach(() => {
    state.leaveTypeCode = "NPL";
  });

  it("rejects NPL beyond the prorated cap", async () => {
    const res = await submitLeave(req(FIVE_DAYS));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("NPL_CAP_EXCEEDED");
    expect(body.npl).toEqual({ cap: 3.5, used: 0, pending: 0, remaining: 3.5 });
  });

  it("accepts NPL within the cap even though the NPL balance row only holds 7 days", async () => {
    state.balance = { ...state.balance, entitlement: 7, used: 7 };
    const res = await submitLeave(req(THREE_DAYS));
    expect(res.status).toBe(201);
  });

  it("counts NPL already taken and pending against the cap", async () => {
    state.nplRows = [{ days: 2, status: "APPROVED" }, { days: 1, status: "PENDING" }];
    const res = await submitLeave(req(ONE_DAY));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.npl.remaining).toBe(0.5);
  });
});

describe("Configured internship AL pool", () => {
  const contract = { id: "contract", year: 2026, entitlement: 7, used: 2, pending: 0, carriedOver: 0, earned: 0, autoDeducted: 0,
    periodStart: new Date("2026-03-30T00:00:00Z"), periodEnd: new Date("2027-02-26T00:00:00Z") };
  beforeEach(() => {
    state.roles = ["INTERN"];
    state.startDate = contract.periodStart;
    mockPrisma.leaveBalance.findFirst.mockResolvedValue(contract);
    mockPrisma.leaveType.findUnique.mockImplementation(async (args) => args.where.code === "AL_OT"
      ? { id: "ot", code: "AL_OT", name: "Off In Lieu", defaultDays: 0 }
      : { id: "lt", code: "AL", name: "Annual Leave", defaultDays: 7 });
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({ year: 2026, earned: 3, used: 1, pending: 0, autoDeducted: 0 });
  });

  it("reports 7 days needing NPL for the 14-day Dec–Jan request, after 3 advance and 2 OIL days", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-12-11", endDate: "2027-01-01", useAdvance: true, otDaysUsed: 2 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "AL_EXCEEDS_BALANCE", alAvailable: 7, excessDays: 7 });
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("reserves only 5 AL days and 2 OIL days for a covered 7-working-day request", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-12-11", endDate: "2026-12-21", useAdvance: true, otDaysUsed: 2 }));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      days: 7, balanceDays: 5, balanceYear: 2026, otDaysUsed: 2,
    }) }));
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_leaveTypeId_year: { employeeId: "emp1", leaveTypeId: "lt", year: 2026 } },
      data: { pending: { increment: 5 } },
    }));
  });

  it("continues to reserve against the 2026 ledger for a request submitted in January", async () => {
    vi.setSystemTime(new Date("2027-01-04T10:00:00Z"));
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2027-01-04", endDate: "2027-01-08", useAdvance: true }));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ balanceYear: 2026, balanceDays: 5 }) }));
    expect(mockPrisma.leaveBalance.create).not.toHaveBeenCalled();
  });

  it("does not extend a fixed internship entitlement past the contract end", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2027-03-01", endDate: "2027-03-01", useAdvance: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/internship entitlement period/);
  });

  it("uses the audited prior allocation for new requests, without requiring advance a second time", async () => {
    mockPrisma.leaveBalance.findFirst.mockResolvedValue({ ...contract, earned: 5.5, used: 5 });
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-11-16", endDate: "2026-11-16", dayType: "AM_HALF", useAdvance: false }));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ days: 0.5, balanceDays: 0.5 }) }));
  });
});

describe("Rule 4 — interns have no paid MC", () => {
  beforeEach(() => {
    state.leaveTypeCode = "MC";
    state.balance = { ...state.balance, entitlement: 14 };
  });

  it("rejects an MC from an intern (roles exactly [INTERN]) and points to NPL", async () => {
    state.roles = ["INTERN"];
    const res = await submitLeave(req(ONE_DAY));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("INTERN_MC_NOT_PAID");
    expect(body.suggestedLeaveTypeCode).toBe("NPL");
  });

  it("does not treat an admin who also holds INTERN as an intern", async () => {
    state.roles = ["ADMIN", "INTERN"];
    state.startDate = new Date("2024-01-01T00:00:00.000Z"); // 10 months → 14 × 10/12 = 11.5 MC
    const res = await submitLeave(req(ONE_DAY));
    expect(res.status).toBe(201);
  });

  it("prorates staff MC strictly: 14 × 2/12 = 2 days earned, so 3 days is refused", async () => {
    const res = await submitLeave(req(THREE_DAYS));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.available).toBe(2);
  });
});
