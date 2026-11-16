import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmail, leave } = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  leave: {
  id: "lr1",
  employeeId: "e1",
  startDate: new Date("2026-11-24T00:00:00Z"),
  endDate: new Date("2026-11-24T00:00:00Z"),
  days: 1,
  reason: "attend course",
  leaveType: { name: "No Pay Leave" },
  employee: { id: "e1", name: "ANG SEE SIANG", email: "staff@tertiaryinfotech.com", user: { email: "staff@tertiaryinfotech.com" } },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: { leaveRequest: { findUnique: vi.fn(async () => leave) } } }));
vi.mock("@/lib/send-email", () => ({ sendEmail }));
vi.mock("@/lib/email-templates/render", () => ({
  renderEmail: vi.fn(async (key: string) => ({ subject: `subject ${key}`, body: "Hi ANG SEE SIANG,\n\nDone." })),
}));
vi.mock("@/lib/company-settings", () => ({ getCompanyBranding: vi.fn(async () => ({ name: "TIA" })) }));
vi.mock("@/lib/webhooks", () => ({ getBaseUrl: () => "https://hrms.test" }));
vi.mock("@/lib/approval-summaries", () => ({
  loadLeaveSummary: vi.fn(async () => ({
    heading: "ANG SEE SIANG: leave summary 2026",
    stats: [
      { label: "Paid leave taken", value: "8 days" },
      { label: "Annual leave balance", value: "5.5 days" },
      { label: "MC taken", value: "2 days" },
      { label: "No-pay leave taken", value: "1 day" },
    ],
  })),
  loadExpenseSummary: vi.fn(),
  loadTimeOffSummary: vi.fn(),
}));

import { sendLeaveDecisionEmail } from "@/lib/decision-email";

describe("sendLeaveDecisionEmail", () => {
  beforeEach(() => {
    sendEmail.mockClear();
    delete process.env.HR_ALERT_CC;
  });

  it("emails the staff member, Cc both admins, with status and summary", async () => {
    await sendLeaveDecisionEmail("lr1", "REJECTED", { approverName: "Tan Soik Ching", comment: "Clash with class" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe("staff@tertiaryinfotech.com");
    expect(arg.cc).toEqual(["tansc@tertiaryinfotech.com", "angch@tertiaryinfotech.com"]);
    expect(arg.subject).toBe("subject LEAVE_REJECTED");
    for (const text of ["Not Approved", "Paid leave taken", "Annual leave balance", "MC taken", "No-pay leave taken", "Clash with class", "Tan Soik Ching"]) {
      expect(arg.html).toContain(text);
    }
  });

  it("never emails the demo account and never throws", async () => {
    leave.employee.user.email = "appreview@tertiaryinfotech.com";
    leave.employee.email = "appreview@tertiaryinfotech.com";
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(sendLeaveDecisionEmail("lr1", "APPROVED")).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
