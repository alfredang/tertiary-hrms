import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks ----

const { mockPrisma, mockAuth, mockCpfFiles } = vi.hoisted(() => ({
  mockPrisma: {
    employee: { findMany: vi.fn() },
    payslip: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    leaveRequest: { findMany: vi.fn(async () => []) },
    nplPayback: { aggregate: vi.fn(async () => ({ _sum: { days: null } })) },
  },
  mockAuth: vi.fn(),
  mockCpfFiles: vi.fn(),
}));

vi.mock("@/lib/cpf-submission-files", () => ({ listCpfSubmissionFiles: () => mockCpfFiles() }));
vi.mock("@/lib/npl-payback-store", () => ({ holidayKeys: vi.fn(async () => new Set()) }));
vi.mock("@/lib/payslip-drive", () => ({ uploadPayslipToDrive: vi.fn(async () => {}) }));
vi.mock("@/lib/payslip-email", () => ({ emailPayslipToEmployee: vi.fn(async () => {}) }));
vi.mock("@/lib/admin-alerts", () => ({ escapeHtml: (x: string) => x, notifyAdmins: vi.fn() }));

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
  name: "STAFF ONE",
  employmentType: "FULL_TIME",
  roles: ["STAFF"],
  status: "ACTIVE",
  dateOfBirth: new Date(1990, 2, 10), // age 36 in June 2026
  salaryInfo: {
    basicSalary: 5000,
    allowances: 500,
  },
};

const EMPLOYEE_NO_DOB = {
  id: "emp_002",
  name: "STAFF NO DOB",
  employmentType: "FULL_TIME",
  roles: ["STAFF"],
  status: "ACTIVE",
  dateOfBirth: null,
  salaryInfo: {
    basicSalary: 4000,
    allowances: 300,
  },
};

const INTERN = {
  id: "emp_int",
  name: "INTERN ONE",
  employmentType: "INTERN",
  roles: ["INTERN"],
  status: "ACTIVE",
  dateOfBirth: null,
  salaryInfo: { basicSalary: 1000, allowances: 0 },
};

/** No payslips yet, no CPF statement recorded or archived, unless a test says otherwise. */
function noPayslipsNoCpf() {
  mockPrisma.payslip.findMany.mockResolvedValue([]);
  mockPrisma.payslip.count.mockResolvedValue(0);
  mockCpfFiles.mockResolvedValue([]);
}

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
    noPayslipsNoCpf();

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
  });

  it("should allow HR role", async () => {
    mockAuth.mockResolvedValue(HR_SESSION);
    mockPrisma.employee.findMany.mockResolvedValue([]);
    noPayslipsNoCpf();

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);

    expect(res.status).toBe(200);
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

  it("should create nothing when nobody has salary info", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    noPayslipsNoCpf();

    const req = makeRequest({ month: 3, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
  });
});

describe("POST /api/payroll/generate — Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15, 2026 — age calc needs stable time
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    noPayslipsNoCpf();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create payslip for one active employee", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.create.mockResolvedValue({ id: "ps_1" });

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
        cpfEmployee: 1100,
        incomeTax: 0,
        netSalary: 4400,
        status: "GENERATED",
      }),
    });
  });

  it("should skip employee when payslip already exists (duplicate)", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.findMany.mockResolvedValue([{ employeeId: "emp_001" }]); // already exists

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
    // emp_003 already has a payslip for the month.
    mockPrisma.payslip.findMany.mockResolvedValue([{ employeeId: "emp_003" }]);
    mockPrisma.payslip.create.mockResolvedValue({ id: "ps_1" });

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(1);
    expect(data.skipped).toBe(1);
  });

  it("should increment errors count when payslip.create throws", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.create.mockRejectedValueOnce(new Error("DB write failed"));

    const req = makeRequest({ month: 6, year: 2026 });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.errors).toBe(1);
  });
});

describe("POST /api/payroll/generate — CPF statement rule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    noPayslipsNoCpf();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pays interns from base salary with CPF 0, even without a date of birth", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([INTERN]);
    mockPrisma.payslip.create.mockResolvedValue({ id: "ps_i" });

    const res = await POST(makeRequest({ month: 6, year: 2026 }));
    const data = await res.json();

    expect(data.created).toBe(1);
    expect(mockPrisma.payslip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ employeeId: "emp_int", grossSalary: 1000, cpfEmployee: 0, cpfEmployer: 0, netSalary: 1000 }),
    });
  });

  it("leaves staff to the CPF statement once it is uploaded, but still pays interns", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY, INTERN]);
    mockPrisma.payslip.count.mockResolvedValue(3); // payslips already made from the June statement
    mockPrisma.payslip.create.mockResolvedValue({ id: "ps_i" });

    const res = await POST(makeRequest({ month: 6, year: 2026 }));
    const data = await res.json();

    expect(data.cpfUploaded).toBe(true);
    expect(data.created).toBe(1);
    expect(data.staffNotOnCpf).toEqual(["STAFF ONE"]);
    expect(mockPrisma.payslip.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.payslip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ employeeId: "emp_int" }),
    });
  });

  it("treats a statement archived on Drive for the month as uploaded", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([EMPLOYEE_WITH_SALARY]);
    mockCpfFiles.mockResolvedValue([{ id: "f1", month: 6, year: 2026 }]);

    const res = await POST(makeRequest({ month: 6, year: 2026 }));
    const data = await res.json();

    expect(data.cpfUploaded).toBe(true);
    expect(data.created).toBe(0);
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/payroll/generate — re-checking base-salary payslips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    mockAuth.mockResolvedValue(ADMIN_SESSION);
    noPayslipsNoCpf();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const stale = { id: "ps_old", employeeId: "emp_int", source: "BASE_SALARY", status: "GENERATED", grossSalary: 900, netSalary: 900 };

  it("updates a base-salary payslip whose figures changed (e.g. leave approved later)", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([INTERN]);
    mockPrisma.payslip.findMany.mockResolvedValue([stale]);
    mockPrisma.payslip.update.mockResolvedValue({ id: "ps_old" });

    const res = await POST(makeRequest({ month: 6, year: 2026 }));
    const data = await res.json();

    expect(data.created).toBe(0);
    expect(mockPrisma.payslip.update).toHaveBeenCalledWith({
      where: { id: "ps_old" },
      data: expect.objectContaining({ grossSalary: 1000, netSalary: 1000, source: "BASE_SALARY" }),
    });
  });

  it("never touches a paid or CPF payslip", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([INTERN, EMPLOYEE_WITH_SALARY]);
    mockPrisma.payslip.findMany.mockResolvedValue([
      { ...stale, status: "PAID" },
      { id: "ps_cpf", employeeId: "emp_001", source: "CPF", status: "GENERATED" },
    ]);

    await POST(makeRequest({ month: 6, year: 2026 }));

    expect(mockPrisma.payslip.update).not.toHaveBeenCalled();
    expect(mockPrisma.payslip.create).not.toHaveBeenCalled();
  });
});
