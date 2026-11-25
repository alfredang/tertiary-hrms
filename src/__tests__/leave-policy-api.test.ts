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
    employmentType: "FULL_TIME" as string,
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
  state.employmentType = "FULL_TIME";

  mockAuth.mockResolvedValue({ user: { id: "u1", role: "STAFF", employeeId: "emp1" } });
  mockPrisma.publicHoliday.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.leaveType.findUnique.mockImplementation(async () => ({ id: "lt", code: state.leaveTypeCode, name: state.leaveTypeCode, defaultDays: 7 }));
  mockPrisma.employee.findUnique.mockImplementation(async () => ({
    startDate: state.startDate,
    endDate: null,
    monthlyLeaveRate: null,
    employmentType: state.employmentType,
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

  it("refuses advance AL even when asked: AL never goes negative (1 day earned, 2 asked → 1 needs NPL)", async () => {
    const two = await submitLeave(req({ ...ONE_DAY, endDate: "2026-11-17", useAdvance: true }));
    expect(two.status).toBe(400);
    expect(await two.json()).toMatchObject({ code: "AL_EXCEEDS_BALANCE", excessDays: 1, suggestedLeaveTypeCode: "NPL" });
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
  });
});

describe("Rule 3 — No Pay Leave capped at 14 days/year, not prorated", () => {
  beforeEach(() => {
    state.leaveTypeCode = "NPL";
  });

  it("gives a Sep joiner the full 14 days (no proration): 5 days are accepted", async () => {
    const res = await submitLeave(req(FIVE_DAYS));
    expect(res.status).toBe(201);
  });

  it("rejects NPL beyond the 14-day cap", async () => {
    state.nplRows = [{ days: 10, status: "APPROVED" }];
    const res = await submitLeave(req(FIVE_DAYS));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("NPL_CAP_EXCEEDED");
    expect(body.npl).toEqual({ cap: 14, used: 10, pending: 0, remaining: 4 });
  });

  it("accepts NPL within the cap even though the NPL balance row only holds 7 days", async () => {
    state.balance = { ...state.balance, entitlement: 7, used: 7 };
    const res = await submitLeave(req(THREE_DAYS));
    expect(res.status).toBe(201);
  });

  it("counts NPL already taken and pending against the cap", async () => {
    state.nplRows = [{ days: 12, status: "APPROVED" }, { days: 1.5, status: "PENDING" }];
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

  it("reports 10 days needing NPL for the 14-day Dec–Jan request: 2 earned + 2 OIL, no advance", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-12-11", endDate: "2027-01-01", useAdvance: true, otDaysUsed: 2 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "AL_EXCEEDS_BALANCE", alAvailable: 4, excessDays: 10 });
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("reserves only 2 AL days and 2 OIL days for a covered 4-working-day request", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-12-11", endDate: "2026-12-16", otDaysUsed: 2 }));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      days: 4, balanceDays: 2, balanceYear: 2026, otDaysUsed: 2,
    }) }));
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_leaveTypeId_year: { employeeId: "emp1", leaveTypeId: "lt", year: 2026 } },
      data: { pending: { increment: 2 } },
    }));
  });

  it("refuses AL ahead of accrual on a contract pool (2 earned left, 3 asked)", async () => {
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2026-12-14", endDate: "2026-12-16", useAdvance: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "AL_EXCEEDS_BALANCE", alAvailable: 2, excessDays: 1 });
  });

  it("continues to reserve against the 2026 ledger for a request submitted in January", async () => {
    vi.setSystemTime(new Date("2027-01-04T10:00:00Z"));
    // 4 Jan 2027: 9 of 11 contract months complete → 7 × 9/11 = 5.5 earned, 2 used → 3.5 left.
    const res = await submitLeave(req({ leaveTypeId: "lt", startDate: "2027-01-04", endDate: "2027-01-06" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ balanceYear: 2026, balanceDays: 3 }) }));
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

  it("files an MC from an intern (roles exactly [INTERN]) as No Pay Leave automatically", async () => {
    state.roles = ["INTERN"];
    mockPrisma.leaveType.findUnique.mockImplementation(async (args: { where: { code?: string } }) => args.where.code === "NPL"
      ? { id: "npl", code: "NPL", name: "No Pay Leave", defaultDays: 14 }
      : { id: "lt", code: "MC", name: "Medical Leave", defaultDays: 14 });
    const res = await submitLeave(req({ ...ONE_DAY, reason: "fever" }));
    expect(res.status).toBe(201);
    expect((await res.json()).convertedToNpl).toBe(true);
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      leaveTypeId: "npl", days: 1, reason: "Sick leave (MC) — fever",
    }) }));
  });

  it("refuses AL, MC, No Pay Leave and compassionate leave from part-time staff (Alfred, 24 Nov 2026)", async () => {
    state.employmentType = "PART_TIME";
    for (const code of ["AL", "MC", "NPL", "CL"]) {
      state.leaveTypeCode = code;
      const res = await submitLeave(req(ONE_DAY));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("PART_TIME_NO_LEAVE");
    }
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
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
