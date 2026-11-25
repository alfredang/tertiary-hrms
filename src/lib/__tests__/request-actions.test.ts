import { describe, it, expect } from "vitest";
import { linkWithRequest, missingRequestNotices, requestAction, requestActionCall } from "@/lib/notification-relevance";
import { paybackNoticeMessage } from "@/lib/npl-payback";

describe("request notices carry an action (23 Nov 2026)", () => {
  it("names the request of every request notice, nothing for other notices", () => {
    expect(requestAction({ type: "PAYBACK_SUBMITTED", link: linkWithRequest("/leave/payback", "P1") })).toEqual({ kind: "payback", requestId: "P1" });
    expect(requestAction({ type: "LEAVE_SUBMITTED", link: "/leave?request=L1" })).toEqual({ kind: "leave", requestId: "L1" });
    expect(requestAction({ type: "TIME_OFF_SUBMITTED", link: "/time-off?request=T1" })?.kind).toBe("timeOff");
    expect(requestAction({ type: "EXPENSE_SUBMITTED", link: "/expenses?request=E1" })?.kind).toBe("expense");
    expect(requestAction({ type: "ATTENDANCE_CORRECTION_SUBMITTED", link: "/timesheet/overview?request=C1" })?.kind).toBe("correction");
    expect(requestAction({ type: "LEAVE_SUBMITTED", link: "/leave" })).toBeNull();
    expect(requestAction({ type: "HR_COMPLIANCE", link: "/dashboard?request=X" })).toBeNull();
  });

  it("calls the existing approve / reject routes", () => {
    expect(requestActionCall({ kind: "payback", requestId: "P1" }, true)).toEqual({ path: "/api/leave/payback/P1/approve", body: {} });
    expect(requestActionCall({ kind: "payback", requestId: "P1" }, false, " wrong day ")).toEqual({ path: "/api/leave/payback/P1/reject", body: { reason: "wrong day" } });
    expect(requestActionCall({ kind: "leave", requestId: "L1" }, true, "ok")).toEqual({ path: "/api/leave/L1/approve", body: { approvalComment: "ok" } });
    expect(requestActionCall({ kind: "timeOff", requestId: "T1" }, false).path).toBe("/api/time-off/T1/reject");
    expect(requestActionCall({ kind: "expense", requestId: "E1" }, true).path).toBe("/api/expenses/E1/approve");
    expect(requestActionCall({ kind: "correction", requestId: "C1" }, false, "no")).toEqual({ path: "/api/attendance/corrections/C1", body: { action: "reject", comment: "no" } });
  });

  it("finds pending paybacks with no notice: two submitted, one notice", () => {
    const a = { id: "P10", message: paybackNoticeMessage("FEMINA JASMIN", "2026-10-10", "2026-10-05", 1) };
    const b = { id: "P31", message: paybackNoticeMessage("FEMINA JASMIN", "2026-10-31", "2026-10-30", 1) };
    const existing = [{ link: linkWithRequest("/leave/payback", "P31"), message: b.message }];
    expect(missingRequestNotices([a, b], existing)).toEqual([a]);
    // An older notice without a request id still counts, by its message.
    expect(missingRequestNotices([a], [{ link: "/leave/payback", message: a.message }])).toEqual([]);
    expect(a.message).toBe("FEMINA JASMIN worked Sat, 10 Oct 2026 to pay back 1 day of No Pay Leave on Mon, 5 Oct 2026.");
  });
});
