import { describe, it, expect } from "vitest";
import { isLoginEmailAllowed, isCompanyEmail } from "@/lib/login-policy";

describe("login policy: company email for staff", () => {
  it("allows any company address", () => {
    expect(isLoginEmailAllowed("angch@tertiaryinfotech.com", "FULL_TIME")).toBe(true);
    expect(isLoginEmailAllowed("  Sylvia@TertiaryInfotech.com ", "FULL_TIME")).toBe(true);
    expect(isLoginEmailAllowed("new@tertiaryinfotech.com", null)).toBe(true);
  });
  it("refuses a personal address for full-time and contract staff", () => {
    expect(isLoginEmailAllowed("someone@yahoo.com", "FULL_TIME")).toBe(false);
    expect(isLoginEmailAllowed("someone@gmail.com", "CONTRACT")).toBe(false);
  });
  it("refuses a personal address with no employee record", () => {
    expect(isLoginEmailAllowed("someone@gmail.com", null)).toBe(false);
    expect(isLoginEmailAllowed("x@tertiarycourses.com.sg", undefined)).toBe(false);
  });
  it("allows part-time staff and interns a personal address", () => {
    expect(isLoginEmailAllowed("someone@gmail.com", "PART_TIME")).toBe(true);
    expect(isLoginEmailAllowed("someone@gmail.com", "INTERN")).toBe(true);
  });
  it("does not accept look-alike domains", () => {
    expect(isCompanyEmail("x@tertiaryinfotech.com.evil.io")).toBe(false);
    expect(isCompanyEmail("x@nottertiaryinfotech.com")).toBe(false);
    expect(isCompanyEmail("x@mail.tertiaryinfotech.com")).toBe(false);
  });
});
