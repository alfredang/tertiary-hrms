/**
 * View As (previewing another role's screens) is for Alfred only (22 Nov 2026): every other
 * admin, accountant, Trainer Admin, staff member or intern sees only their own screens, on the
 * web and in the phone apps (/api/mobile/summary sends `canViewAs`).
 */
export const VIEW_AS_EMAILS = ["angch@tertiaryinfotech.com"];

export function canViewAs(email: string | null | undefined): boolean {
  return VIEW_AS_EMAILS.includes((email ?? "").trim().toLowerCase());
}
