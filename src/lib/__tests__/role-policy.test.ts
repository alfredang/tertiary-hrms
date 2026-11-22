import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import { disallowedRoles, effectiveRoles } from "@/lib/role-policy";

describe("role policy", () => {
  it("lets the named people keep their roles", () => {
    expect(disallowedRoles("angch@tertiaryinfotech.com", ["ADMIN", "HR", "MANAGER", "ACCOUNTANT", "TRAINER_ADMIN", "INTERN", "STAFF"])).toEqual([]);
    expect(disallowedRoles("TANSC@tertiaryinfotech.com", ["ADMIN", "TRAINER_ADMIN"])).toEqual([]);
    expect(disallowedRoles("jasminetertiary@gmail.com", ["ACCOUNTANT"])).toEqual([]);
    expect(disallowedRoles("deepa@tertiaryinfotech.com", ["STAFF", "TRAINER_ADMIN"])).toEqual([]);
  });
  it("refuses an elevated role for anyone else", () => {
    expect(disallowedRoles("marcus@tertiaryinfotech.com", ["STAFF", "ADMIN"])).toEqual(["ADMIN"]);
    expect(disallowedRoles("tansc@tertiaryinfotech.com", ["ADMIN", "ACCOUNTANT"])).toEqual(["ACCOUNTANT"]);
    expect(disallowedRoles("deepa@tertiaryinfotech.com", ["HR"])).toEqual(["HR"]);
  });
  it("allows staff and intern for everyone", () => {
    expect(disallowedRoles("feminajasminismail@gmail.com", ["INTERN"])).toEqual([]);
    expect(disallowedRoles("someone@tertiaryinfotech.com", ["STAFF"])).toEqual([]);
  });
  it("strips roles a session may not have, falling back to STAFF", () => {
    expect(effectiveRoles("marcus@tertiaryinfotech.com", ["STAFF", "ADMIN"] as Role[])).toEqual(["STAFF"]);
    expect(effectiveRoles("x@gmail.com", ["ACCOUNTANT"] as Role[])).toEqual(["STAFF"]);
    expect(effectiveRoles("x@gmail.com", [] as Role[])).toEqual(["STAFF"]);
    expect(effectiveRoles("jasminetertiary@gmail.com", ["ACCOUNTANT"] as Role[])).toEqual(["ACCOUNTANT"]);
  });
});
