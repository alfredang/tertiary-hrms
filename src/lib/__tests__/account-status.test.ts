import { describe, expect, it } from "vitest";
import { isSignInBlocked } from "../account-status";

describe("isSignInBlocked", () => {
  it("blocks everyone who has left", () => {
    for (const s of ["TERMINATED", "RESIGNED", "INACTIVE"]) expect(isSignInBlocked(s)).toBe(true);
  });
  it("allows current people and accounts with no employee record yet", () => {
    for (const s of ["ACTIVE", "ON_LEAVE", null, undefined]) expect(isSignInBlocked(s)).toBe(false);
  });
});
