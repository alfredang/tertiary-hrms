import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/send-email", () => ({ sendEmail: vi.fn() }));

import { staffAlertCc, toAndCc } from "@/lib/admin-alerts";

describe("staffAlertCc", () => {
  afterEach(() => {
    delete process.env.HR_ALERT_CC;
  });

  it("CCs both admins on staff alert emails", () => {
    expect(staffAlertCc("intern@example.com")).toEqual(["tansc@tertiaryinfotech.com", "angch@tertiaryinfotech.com"]);
  });

  it("does not CC the recipient to themselves", () => {
    expect(staffAlertCc("TanSC@tertiaryinfotech.com")).toEqual(["angch@tertiaryinfotech.com"]);
  });

  it("admin emails go To Tan Soik Ching, Cc Alfred Ang", () => {
    expect(toAndCc(["tansc@tertiaryinfotech.com", "angch@tertiaryinfotech.com", "TANSC@tertiaryinfotech.com"])).toEqual({
      to: "tansc@tertiaryinfotech.com",
      cc: ["angch@tertiaryinfotech.com"],
    });
  });

  it("honours the HR_ALERT_CC override", () => {
    process.env.HR_ALERT_CC = "a@x.com, b@x.com";
    expect(staffAlertCc("a@x.com")).toEqual(["b@x.com"]);
  });
});
