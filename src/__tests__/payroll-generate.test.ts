import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks ----

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    employee: { findMany: vi.fn() },
    payslip: { findUnique: vi.fn(), create: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/dev-auth", () => ({
  isDevAuthSkipped: () => false,
}));

// Import after mocking
import { POST } from "@/app/api/payroll/generate/route";

// ---- Helpers ----

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/payroll/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = {
  user: { id: "user_admin", email: "admin@test.com", role: "ADMIN", employeeId: "emp_admin" },
};

const HR_SESSION = {
  user: { id: "user_hr", email: "hr@test.com", role: "HR", employeeId: "emp_hr" },
};

const STAFF_SESSION = {
  user: { id: "user_staff", email: "staff@test.com", role: "STAFF", employeeId: "emp_001" },
};

const EMPLOYEE_WITH_SALARY = {
  id: "emp_001",
  status: "ACTIVE",
  dateOfBirth: new Date(1990, 2, 10), // age 36 in June 2026
  salaryInfo: {
    basicSalary: 5000,
    allowances: 500,
  },
};

const EMPLOYEE_NO_DOB = {
  id: "emp_002",
  status: "ACTIVE",
  dateOfBirth: null,
  salaryInfo: {
    basicSalary: 4000,
    allowances: 300,
  },
};

// ---- Tests ----

describe("POST /api/payroll/generate — Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });

  it("should return 403 for STAFF role", async () => {
    mockAuth.mockResolvedValue(STAFF_SESSION);

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });

  it("should allow ADMIN role", async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    mockPrisma.employee.findMany.mockResolvedValue([]);

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    // Reaches validation (400 = no employees), meaning auth passed
    expect(res.status).toBe(400);
    expect(data.error).toBe("No active employees with salary info found");
  });

  it("should allow HR role", async () => {
    mockAuth.mockResolvedValue(HR_SESSION);
    mockPrisma.employee.findMany.mockResolvedValue([]);

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);

    // Reaches validation, meaning auth passed
    expect(res.status).toBe(400);
  });

  it("should return 403 for MANAGER role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user_mgr", email: "mgr@test.com", role: "MANAGER", employeeId: "emp_mgr" },
    });

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/payroll/generate — Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(ADMIN_SESSION);
  });

  it("should return 400 when month is missing", async () => {
    const req = makeRequest({ year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Month and year are required");
  });

  it("should return 400 when year is missing", async () => {
    const req = makeRequest({ month: 3 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Month and year are required");
  });

  it("should return 400 when no active employees found", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("No active employees with salary info found");
  });
});

describe("POST /api/payroll/generate — Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026 — age calc needs stable time
    mockAuth.mockResolvedValue(ADMIN_SESSION);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create payslip for one active employee", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.findUnique.mockResolvedValue(null); // no existing
    mockPrisma.payslip.create.mockResolvedValue({});

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(1);
    expect(data.skipped).toBe(0);
    expect(data.errors).toBe(0);

    // Verify payslip was created with calculated values
    expect(mockPrisma.payslip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: "emp_001",
        basicSalary: 5000,
        allowances: 500,
        grossSalary: 5500,
        status: "GENERATED",
      }),
    });
  });

  it("should skip employee when payslip already exists (duplicate)", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.findUnique.mockResolvedValue({ id: "existing_ps" }); // already exists

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.skipped).toBe(1);
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });

  it("should skip employee without dateOfBirth", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_NO_DOB]);
    mockPrisma.payslip.findUnique.mockResolvedValue(null);

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.skipped).toBe(1);
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });

  it("should handle mixed employees: 1 new + 1 existing payslip", async () => {
    const emp2 = { ...EMPLOYEE_WITH_SALARY, id: "emp_003" };
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY, emp2]);
    // First: no existing, Second: already has payslip
    mockPrisma.payslip.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing_ps" });
    mockPrisma.payslip.create.mockResolvedValue({});

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(1);
    expect(data.skipped).toBe(1);
  });

  it("should increment errors count when payslip.create throws", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.findUnique.mockResolvedValue(null);
    mockPrisma.payslip.create.mockRejectedValueOnce(new Error("DB write failed"));

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.errors).toBe(1);
  });
});
