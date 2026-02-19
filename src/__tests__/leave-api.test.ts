import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks (using vi.hoisted to avoid hoisting issues) ----

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    employee: { findFirst: vi.fn() },
    leaveRequest: {
      create: vi.fn(),
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
    });

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
      employee: { firstName: "John", lastName: "Doe" },
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
    });

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
    // entitlement=14, used=3, pending=2 → available=9
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      entitlement: 14,
      used: 3,
      pending: 2,
    });

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
      employee: { firstName: "John", lastName: "Doe" },
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
      employee: { firstName: "John", lastName: "Doe" },
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
  });

  it("should correctly track available balance after submission", async () => {
    // Initial: entitlement=14, used=5, pending=0 → available=9
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      entitlement: 14,
      used: 5,
      pending: 0,
    });
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
      employee: { firstName: "John", lastName: "Doe" },
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
  it("should round values to nearest 0.5", async () => {
    const { roundToHalf } = await import("@/lib/utils");
    expect(roundToHalf(3.0)).toBe(3.0);
    expect(roundToHalf(3.2)).toBe(3.0);
    expect(roundToHalf(3.25)).toBe(3.5);
    expect(roundToHalf(3.3)).toBe(3.5);
    expect(roundToHalf(3.5)).toBe(3.5);
    expect(roundToHalf(3.7)).toBe(3.5);
    expect(roundToHalf(3.75)).toBe(4.0);
    expect(roundToHalf(3.8)).toBe(4.0);
    expect(roundToHalf(14.0)).toBe(14.0);
    expect(roundToHalf(0)).toBe(0);
  });

  it("should prorate leave for employee starting mid-year", async () => {
    const { prorateLeave } = await import("@/lib/utils");

    // Started July (month index 6) → 6 remaining months out of 12
    // 14 * (6/12) = 7.0
    expect(prorateLeave(14, new Date("2026-07-01"), 2026)).toBe(7.0);

    // Started March (month index 2) → 10 remaining months
    // 14 * (10/12) = 11.666... → rounds to 11.5
    expect(prorateLeave(14, new Date("2026-03-15"), 2026)).toBe(11.5);

    // Started October (month index 9) → 3 remaining months
    // 14 * (3/12) = 3.5
    expect(prorateLeave(14, new Date("2026-10-01"), 2026)).toBe(3.5);

    // Started January → 12 months = full entitlement
    expect(prorateLeave(14, new Date("2026-01-01"), 2026)).toBe(14.0);

    // Started December (month index 11) → 1 remaining month
    // 14 * (1/12) = 1.166... → rounds to 1.0
    expect(prorateLeave(14, new Date("2026-12-01"), 2026)).toBe(1.0);
  });

  it("should give full entitlement for employee started before this year", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    expect(prorateLeave(14, new Date("2020-06-15"), 2026)).toBe(14);
  });

  it("should give zero entitlement for employee starting after this year", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    expect(prorateLeave(14, new Date("2027-03-01"), 2026)).toBe(0);
  });

  it("should prorate MC (14 days) correctly", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    // MC = 14 days/year, started May (month 4) → 8 remaining months
    // 14 * (8/12) = 9.333... → rounds to 9.5
    expect(prorateLeave(14, new Date("2026-05-01"), 2026)).toBe(9.5);
  });

  it("should handle No Pay Leave (0 days entitlement)", async () => {
    const { prorateLeave } = await import("@/lib/utils");
    expect(prorateLeave(0, new Date("2026-06-01"), 2026)).toBe(0);
  });
});
