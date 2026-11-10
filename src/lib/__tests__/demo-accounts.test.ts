import { describe, expect, it } from "vitest";
import { withoutDemoEmployees, withoutDemoRequests, DEMO_EMPLOYEE_CODES } from "../demo-accounts";

describe("demo account filters", () => {
  it("adds a not-demo clause to list queries", () => {
    expect(withoutDemoRequests(undefined)).toEqual({ employee: { employeeId: { notIn: DEMO_EMPLOYEE_CODES } } });
    expect(withoutDemoRequests({ status: "PENDING" })).toEqual({ AND: [{ status: "PENDING" }, { employee: { employeeId: { notIn: DEMO_EMPLOYEE_CODES } } }] });
    expect(withoutDemoEmployees({ status: "ACTIVE" })).toEqual({ AND: [{ status: "ACTIVE" }, { employeeId: { notIn: DEMO_EMPLOYEE_CODES } }] });
  });
  it("leaves a user's own data and single-record lookups alone", () => {
    expect(withoutDemoRequests({ employeeId: "emp_1" })).toEqual({ employeeId: "emp_1" });
    expect(withoutDemoRequests({ id: "req_1" })).toEqual({ id: "req_1" });
    expect(withoutDemoEmployees({ userId: "u1" })).toEqual({ userId: "u1" });
  });
});
