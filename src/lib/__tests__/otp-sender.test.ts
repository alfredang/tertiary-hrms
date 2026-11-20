import { describe, expect, it } from "vitest";
import { OTP_FROM_EMAIL, orderOtpSenders, sendsAs } from "../otp-sender";

describe("OTP sender", () => {
  it("sends OTPs from the shared sales mailbox", () => {
    expect(OTP_FROM_EMAIL).toBe("sales@tertiarycourses.com.sg");
  });

  it("matches the address whatever its case, including a send-as alias", () => {
    expect(sendsAs(["angch@tertiaryinfotech.com", "Sales@TertiaryCourses.com.sg "])).toBe(true);
    expect(sendsAs(["angch@tertiaryinfotech.com"])).toBe(false);
  });

  it("puts a login that sends as the sales mailbox ahead of a personal one", () => {
    const ordered = orderOtpSenders([
      { id: "smtp-db", addresses: ["angch@tertiaryinfotech.com"] },
      { id: "smtp-env", addresses: ["sales@tertiarycourses.com.sg"] },
      { id: "gmail", addresses: ["angch@tertiaryinfotech.com", "support@tertiaryinfotech.com"] },
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["smtp-env", "smtp-db", "gmail"]);
  });

  it("keeps the existing order when no login sends as the sales mailbox", () => {
    const ordered = orderOtpSenders([
      { id: "smtp-db", addresses: ["angch@tertiaryinfotech.com"] },
      { id: "gmail", addresses: ["angch@tertiaryinfotech.com"] },
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["smtp-db", "gmail"]);
  });
});
