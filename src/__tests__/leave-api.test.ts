import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks (using vi.hoisted to avoid hoisting issues) ----

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    employee: { findFirst: vi.fn(), findUnique: vi.fn() },
    leaveType: { findUnique: vi.fn() },
    leaveRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    leaveBalance: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    calendarEvent: {
      create: vi.fn(),
    },
  },
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

// Import route handlers after mocking
import { POST as submitLeave } from "@/app/api/leave/route";
import { POST as approveLeave } from "@/app/api/leave/[id]/approve/route";
import { POST as rejectLeave } from "@/app/api/leave/[id]/reject/route";

// ---- Helpers ----

function makeRequest(body: Record<string, unknown>, url = "http://localhost/api/leave") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEmptyRequest(url = "http://localhost/api/leave") {
  return new NextRequest(url, { method: "POST" });
}

const EMPLOYEE_ID = "emp_001";
const LEAVE_TYPE_ID = "lt_annual";
const LEAVE_REQUEST_ID = "lr_001";
const APPROVER_EMPLOYEE_ID = "emp_admin";

// ---- Test Suites ----

describe("Leave Submission (POST /api/leave)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated staff user
    mockAuth.mockResolvedValue({
      user: { id: "user_001", email: "staff@test.com", role: "STAFF", employeeId: EMPLOYEE_ID },
    });
    // Default: no overlapping leaves
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
  });

  it("should create a PENDING leave request and increment pending balance", async () => {
    // Setup: sufficient balance
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      id: "bal_001",
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      year: new Date().getFullYear(),
      entitlement: 14,
      used: 2,
      pending: 0,
      carriedOver: 0,
    });
    mockPrisma.leaveType.findUnique.mockResolvedValue({ id: LEAVE_TYPE_ID, code: "CL" });
    mockPrisma.employee.findUnique.mockResolvedValue({ startDate: new Date("2025-01-01") });

    const createdRequest = {
      id: "lr_new",
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: new Date("2026-03-02"),
      endDate: new Date("2026-03-04"),
      days: 3,
      reason: "Family trip",
      status: "PENDING",
      leaveType: { name: "Annual Leave" },
      employee: { name: "John Doe" },
    };
    mockPrisma.leaveRequest.create.mockResolvedValue(createdRequest);
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
      reason: "Family trip",
    });

    const res = await submitLeave(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.status).toBe("PENDING");
    expect(data.reason).toBe("Family trip");

    // Verify leave request was created with PENDING status
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: EMPLOYEE_ID,
          leaveTypeId: LEAVE_TYPE_ID,
          days: 3,
          status: "PENDING",
          reason: "Family trip",
        }),
      })
    );

    // Verify pending balance was incremented
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: EMPLOYEE_ID,
          leaveTypeId: LEAVE_TYPE_ID,
          year: new Date().getFullYear(),
        },
      },
      data: { pending: { increment: 3 } },
    });
  });

  it("should reject submission when insufficient balance", async () => {
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      id: "bal_001",
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      year: new Date().getFullYear(),
      entitlement: 14,
      used: 10,
      pending: 3,
      carriedOver: 0,
    });
    mockPrisma.leaveType.findUnique.mockResolvedValue({ id: LEAVE_TYPE_ID, code: "CL" });
    mockPrisma.employee.findUnique.mockResolvedValue({ startDate: new Date("2025-01-01") });

    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-02",
      endDate: "2026-03-06", // 5 days, but only 1 available
    });

    const res = await submitLeave(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Insufficient leave balance");
    expect(data.available).toBe(1);
    expect(data.requested).toBe(5);

    // Verify no leave request was created
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("should reject unauthenticated user with 401", async () => {
    mockAuth.mockResolvedValue(null);
    // Ensure SKIP_AUTH is not set for this test
    const origSkipAuth = process.env.SKIP_AUTH;
    process.env.SKIP_AUTH = "false";

    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-02",
      endDate: "2026-03-04",
    });

    const res = await submitLeave(req);

    expect(res.status).toBe(401);
    expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();

    process.env.SKIP_AUTH = origSkipAuth;
  });

  it("should reject when end date is before start date", async () => {
    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-04",
      endDate: "2026-03-02",
    });

    const res = await submitLeave(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("End date must be on or after start date");
  });

  it("should calculate leave balance forecast correctly", async () => {
    // entitlement=14, used=3, pending=2, carriedOver=0 → available=9
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      entitlement: 14,
      used: 3,
      pending: 2,
      carriedOver: 0,
    });
    mockPrisma.leaveType.findUnique.mockResolvedValue({ id: LEAVE_TYPE_ID, code: "CL" });
    mockPrisma.employee.findUnique.mockResolvedValue({ startDate: new Date("2025-01-01") });

    // Requesting 10 days (more than 9 available)
    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-02",
      endDate: "2026-03-11", // 10 days
    });

    const res = await submitLeave(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Insufficient leave balance");
    expect(data.available).toBe(9); // 14 - 3 - 2 = 9
    expect(data.requested).toBe(10);
  });

  it("should force FULL_DAY for non-AL leave type even if AM_HALF is sent", async () => {
    // MC leave type — half-day not allowed
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      entitlement: 14,
      used: 0,
      pending: 0,
      carriedOver: 0,
    });
    mockPrisma.leaveType.findUnique.mockResolvedValue({ id: LEAVE_TYPE_ID, code: "MC" });
    mockPrisma.employee.findUnique.mockResolvedValue({ startDate: new Date("2025-01-01") });
    mockPrisma.leaveRequest.create.mockResolvedValue({
      id: "lr_mc",
      status: "PENDING",
      days: 1,
      dayType: "FULL_DAY",
      halfDayPosition: null,
      leaveType: { name: "Medical Leave" },
      employee: { name: "John Doe" },
    });
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      dayType: "AM_HALF", // Client sends AM_HALF but MC should be forced to FULL_DAY
    });

    const res = await submitLeave(req);
    expect(res.status).toBe(201);

    // Verify: dayType forced to FULL_DAY, days = 1 (not 0.5)
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dayType: "FULL_DAY",
          halfDayPosition: null,
          days: 1,
        }),
      })
    );

    // Verify: pending incremented by 1 (not 0.5)
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pending: { increment: 1 } },
      })
    );
  });
});

describe("Leave Approval (POST /api/leave/[id]/approve)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: admin user
    mockAuth.mockResolvedValue({
      user: {
        id: "user_admin",
        email: "admin@test.com",
        role: "ADMIN",
        employeeId: APPROVER_EMPLOYEE_ID,
      },
    });
  });

  it("should approve a pending leave request and update balance", async () => {
    const pendingRequest = {
      id: LEAVE_REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: new Date("2026-03-02"),
      endDate: new Date("2026-03-04"),
      days: 3,
      status: "PENDING",
      employee: { name: "John Doe" },
      leaveType: { name: "Annual Leave" },
    };

    mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingRequest);
    mockPrisma.leaveRequest.update.mockResolvedValue({
      ...pendingRequest,
      status: "APPROVED",
      approverId: APPROVER_EMPLOYEE_ID,
      approvedAt: new Date(),
    });
    mockPrisma.leaveBalance.update.mockResolvedValue({});
    mockPrisma.calendarEvent.create.mockResolvedValue({});

    const req = makeEmptyRequest(`http://localhost/api/leave/${LEAVE_REQUEST_ID}/approve`);
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await approveLeave(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("APPROVED");

    // Verify leave request was updated to APPROVED
    expect(mockPrisma.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: LEAVE_REQUEST_ID },
      data: expect.objectContaining({
        status: "APPROVED",
        approverId: APPROVER_EMPLOYEE_ID,
      }),
    });

    // Verify balance: used incremented, pending decremented
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: EMPLOYEE_ID,
          leaveTypeId: LEAVE_TYPE_ID,
          year: new Date().getFullYear(),
        },
      },
      data: {
        used: { increment: 3 },
        pending: { decrement: 3 },
      },
    });

    // Verify calendar event was created
    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "John Doe - Annual Leave",
        type: "LEAVE",
        allDay: true,
      }),
    });
  });

  it("should reject approval of non-pending request with 400", async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      status: "APPROVED", // Already approved
      employee: { name: "John Doe" },
      leaveType: { name: "Annual Leave" },
    });

    const req = makeEmptyRequest();
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await approveLeave(req, { params });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Leave request is not pending");
    expect(mockPrisma.leaveRequest.update).not.toHaveBeenCalled();
  });

  it("should forbid staff from approving with 403", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user_staff", email: "staff@test.com", role: "STAFF", employeeId: EMPLOYEE_ID },
    });

    const req = makeEmptyRequest();
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await approveLeave(req, { params });

    expect(res.status).toBe(403);
    expect(mockPrisma.leaveRequest.findUnique).not.toHaveBeenCalled();
  });

  it("should return 404 for non-existent leave request", async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue(null);

    const req = makeEmptyRequest();
    const params = Promise.resolve({ id: "nonexistent" });

    const res = await approveLeave(req, { params });

    expect(res.status).toBe(404);
    expect(mockPrisma.leaveRequest.update).not.toHaveBeenCalled();
  });
});

describe("Leave Rejection (POST /api/leave/[id]/reject)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: {
        id: "user_admin",
        email: "admin@test.com",
        role: "ADMIN",
        employeeId: APPROVER_EMPLOYEE_ID,
      },
    });
  });

  it("should reject a pending leave request with reason and update balance", async () => {
    const pendingRequest = {
      id: LEAVE_REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      days: 3,
      status: "PENDING",
    };

    mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingRequest);
    mockPrisma.leaveRequest.update.mockResolvedValue({
      ...pendingRequest,
      status: "REJECTED",
      approverId: APPROVER_EMPLOYEE_ID,
      rejectedAt: new Date(),
      rejectionReason: "Staffing shortage during this period",
    });
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    const req = makeRequest(
      { reason: "Staffing shortage during this period" },
      `http://localhost/api/leave/${LEAVE_REQUEST_ID}/reject`
    );
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await rejectLeave(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("REJECTED");
    expect(data.rejectionReason).toBe("Staffing shortage during this period");

    // Verify rejection reason was stored
    expect(mockPrisma.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: LEAVE_REQUEST_ID },
      data: expect.objectContaining({
        status: "REJECTED",
        approverId: APPROVER_EMPLOYEE_ID,
        rejectionReason: "Staffing shortage during this period",
      }),
    });

    // Verify pending balance was decremented (NOT used)
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: EMPLOYEE_ID,
          leaveTypeId: LEAVE_TYPE_ID,
          year: new Date().getFullYear(),
        },
      },
      data: {
        pending: { decrement: 3 },
      },
    });

    // Verify NO calendar event was created for rejected leave
    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("should reject without a reason (reason is optional)", async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      days: 2,
      status: "PENDING",
    });
    mockPrisma.leaveRequest.update.mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      status: "REJECTED",
      rejectionReason: null,
    });
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    // Empty body - no reason provided
    const req = makeEmptyRequest(`http://localhost/api/leave/${LEAVE_REQUEST_ID}/reject`);
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await rejectLeave(req, { params });

    expect(res.status).toBe(200);

    expect(mockPrisma.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: LEAVE_REQUEST_ID },
      data: expect.objectContaining({
        status: "REJECTED",
        rejectionReason: null,
      }),
    });
  });

  it("should forbid staff from rejecting with 403", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user_staff", email: "staff@test.com", role: "STAFF", employeeId: EMPLOYEE_ID },
    });

    const req = makeRequest({ reason: "Test" });
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });

    const res = await rejectLeave(req, { params });

    expect(res.status).toBe(403);
    expect(mockPrisma.leaveRequest.update).not.toHaveBeenCalled();
  });
});

describe("Leave Balance & Forecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user_001", email: "staff@test.com", role: "STAFF", employeeId: EMPLOYEE_ID },
    });
    // Default: no overlapping leaves
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
  });

  it("should correctly track available balance after submission", async () => {
    // Initial: entitlement=14, used=5, pending=0, carriedOver=0 → available=9
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      entitlement: 14,
      used: 5,
      pending: 0,
      carriedOver: 0,
    });
    mockPrisma.leaveType.findUnique.mockResolvedValue({ id: LEAVE_TYPE_ID, code: "CL" });
    mockPrisma.employee.findUnique.mockResolvedValue({ startDate: new Date("2025-01-01") });
    mockPrisma.leaveRequest.create.mockResolvedValue({
      id: "lr_new",
      status: "PENDING",
      days: 3,
    });
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    const req = makeRequest({
      leaveTypeId: LEAVE_TYPE_ID,
      startDate: "2026-04-01",
      endDate: "2026-04-03", // 3 days
    });

    const res = await submitLeave(req);
    expect(res.status).toBe(201);

    // After submission: pending should increment by 3
    // New state: entitlement=14, used=5, pending=3 → available=6
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pending: { increment: 3 } },
      })
    );
  });

  it("should correctly update balance on approval (used up, pending down)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user_admin", email: "admin@test.com", role: "ADMIN", employeeId: APPROVER_EMPLOYEE_ID },
    });

    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      days: 3,
      status: "PENDING",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-03"),
      employee: { name: "John Doe" },
      leaveType: { name: "Annual Leave" },
    });
    mockPrisma.leaveRequest.update.mockResolvedValue({ status: "APPROVED" });
    mockPrisma.leaveBalance.update.mockResolvedValue({});
    mockPrisma.calendarEvent.create.mockResolvedValue({});

    const req = makeEmptyRequest();
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });
    await approveLeave(req, { params });

    // Balance: used +3, pending -3
    // If before was entitlement=14, used=5, pending=3 (available=6)
    // After: entitlement=14, used=8, pending=0 (available=6) — same available
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          used: { increment: 3 },
          pending: { decrement: 3 },
        },
      })
    );
  });

  it("should restore available balance on rejection (pending down, used unchanged)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user_admin", email: "admin@test.com", role: "ADMIN", employeeId: APPROVER_EMPLOYEE_ID },
    });

    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      id: LEAVE_REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
      days: 3,
      status: "PENDING",
    });
    mockPrisma.leaveRequest.update.mockResolvedValue({ status: "REJECTED" });
    mockPrisma.leaveBalance.update.mockResolvedValue({});

    const req = makeRequest({ reason: "Denied" });
    const params = Promise.resolve({ id: LEAVE_REQUEST_ID });
    await rejectLeave(req, { params });

    // Balance: only pending -3, used unchanged
    // If before was entitlement=14, used=5, pending=3 (available=6)
    // After: entitlement=14, used=5, pending=0 (available=9) — balance restored
    expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          pending: { decrement: 3 },
        },
      })
    );
  });
});

describe("Proration & Rounding (utility functions)", () => {
  it("should round DOWN to nearest 0.5 (floor behavior)", async () => {
    const { roundToHalf } = await import("@/lib/utils");
    expect(roundToHalf(3.0)).toBe(3.0);
    expect(roundToHalf(3.2)).toBe(3.0);
    expect(roundToHalf(3.25)).toBe(3.0);  // floor: 3.25 → 3.0
    expect(roundToHalf(3.3)).toBe(3.0);   // floor: 3.3 → 3.0
    expect(roundToHalf(3.5)).toBe(3.5);
    expect(roundToHalf(3.7)).toBe(3.5);
    expect(roundToHalf(3.75)).toBe(3.5);  // floor: 3.75 → 3.5
    expect(roundToHalf(3.8)).toBe(3.5);   // floor: 3.8 → 3.5
    expect(roundToHalf(14.0)).toBe(14.0);
    expect(roundToHalf(0)).toBe(0);
  });

  it("should prorate leave for Jan-1 start same as pre-year employee (inclusive months)", async () => {
    const { prorateLeave, roundToHalf } = await import("@/lib/utils");

    // Jan 1 of this year: effectiveStart == yearStart → startedThisYear = false
    // → inclusive months: currentMonth + 1
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const inclusiveMonths = currentMonth + 1;
    const expected = roundToHalf((14 * inclusiveMonths) / 12);
    expect(prorateLeave(14, new Date(currentYear, 0, 1))).toBe(expected);

    // Pre-year employee → same result (both use inclusive)
    expect(prorateLeave(14, new Date("2020-06-15"))).toBe(expected);
  });

  it("should use completed months for mid-year new hire (join month excluded)", async () => {
    const { prorateLeave, roundToHalf } = await import("@/lib/utils");
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Mid-year hire: startedThisYear = true (start > yearStart) → completed months (no +1)
    // Note: Jan 1 == yearStart so NOT startedThisYear. Need Feb+ start.
    if (currentMonth >= 2) {
      // Employee started on the 1st of THIS month → 0 completed months
      expect(prorateLeave(14, new Date(currentYear, currentMonth, 1))).toBe(0);

      // Employee started previous month (Feb+) → 1 completed month
      const result = prorateLeave(14, new Date(currentYear, currentMonth - 1, 1));
      const expected = roundToHalf((14 * 1) / 12); // 1.17 → 1
      expect(result).toBe(expected);
    } else if (currentMonth >= 1) {
      // In Feb: only test that current-month hire gets 0
      // (Previous month is Jan = yearStart, not treated as mid-year hire)
      expect(prorateLeave(14, new Date(currentYear, currentMonth, 1))).toBe(0);
    }
  });

  it("should give DIFFERENT results for mid-year hire vs pre-year employee", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    if (currentMonth >= 1) {
      // Mid-year hire (started this month) → 0 completed months → 0 leave
      const midYearHire = prorateLeave(14, new Date(currentYear, currentMonth, 1));
      // Pre-year employee → inclusive → currentMonth + 1 months
      const existing = prorateLeave(14, new Date("2020-06-15"));

      expect(midYearHire).toBe(0);
      expect(existing).toBeGreaterThan(0);
    }
  });

  it("should give new hire in join month 0 leave", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Only meaningful if we're past Jan (start date must be > yearStart)
    if (currentMonth >= 1) {
      expect(prorateLeave(14, new Date(currentYear, currentMonth, 1))).toBe(0);
    }
  });

  it("should give new hire after 1 completed month prorated leave", async () => {
    const { prorateLeave, roundToHalf } = await import("@/lib/utils");
    const now = new Date();
    const currentMonth = now.getMonth();

    // Only test if we're past January (need a previous month that is > yearStart)
    if (currentMonth >= 2) {
      // Start date = previous month → completed = currentMonth - (currentMonth-1) = 1
      const result = prorateLeave(14, new Date(now.getFullYear(), currentMonth - 1, 1));
      const expected = roundToHalf((14 * 1) / 12); // 1.17 → 1
      expect(result).toBe(expected);
    }
  });

  it("should give zero entitlement for employee starting in the future", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    // Start date is next year — no leave yet
    const nextYear = new Date().getFullYear() + 1;
    expect(prorateLeave(14, new Date(nextYear, 2, 1))).toBe(0);
  });

  it("should handle No Pay Leave (0 days entitlement)", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    expect(prorateLeave(0, new Date("2020-01-01"))).toBe(0);
  });
});

describe("Overlap Detection with AM/PM slots", () => {
  it("should conflict when AM + PM on same day (edit to full day instead)", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-01"), 0.5, "AL",
      "PM_HALF", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-01"),
        days: 0.5, leaveTypeCode: "AL", dayType: "AM_HALF", halfDayPosition: null,
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should conflict when both AM on same day", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-01"), 0.5, "AL",
      "AM_HALF", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-01"),
        days: 0.5, leaveTypeCode: "AL", dayType: "AM_HALF", halfDayPosition: null,
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should conflict when half-day overlaps with full-day", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-01"), 0.5, "AL",
      "AM_HALF", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-01"),
        days: 1, leaveTypeCode: "AL", dayType: "FULL_DAY", halfDayPosition: null,
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should conflict even if one is medical (no half-day stacking)", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-01"), 0.5, "MC",
      "AM_HALF", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-01"),
        days: 0.5, leaveTypeCode: "AL", dayType: "AM_HALF", halfDayPosition: null,
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should handle multi-day with halfDayPosition='last'", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    // Existing: multi-day Apr 1-2, half on last day (Apr 2 = AM slot)
    // New: full day on Apr 1 → should conflict on Apr 1 (existing is FULL on Apr 1)
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-01"), 1, "AL",
      "FULL_DAY", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-02"),
        days: 1.5, leaveTypeCode: "AL", dayType: "FULL_DAY", halfDayPosition: "last",
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should conflict on the half-day date of multi-day even if different slot", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    // Existing: multi-day Apr 1-2, half on last day (Apr 2 = AM slot, occupies AM only)
    // New: PM half on Apr 2 → should conflict (no stacking half-days)
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-02"), new Date("2026-04-02"), 0.5, "AL",
      "PM_HALF", null,
      [{
        startDate: new Date("2026-04-01"), endDate: new Date("2026-04-02"),
        days: 1.5, leaveTypeCode: "AL", dayType: "FULL_DAY", halfDayPosition: "last",
      }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("should return no conflicts when no existing leaves", async () => {
    const { getLeaveConflictDates } = await import("@/lib/utils");
    const conflicts = getLeaveConflictDates(
      new Date("2026-04-01"), new Date("2026-04-03"), 3, "AL",
      "FULL_DAY", null,
      []
    );
    expect(conflicts).toHaveLength(0);
  });
});
