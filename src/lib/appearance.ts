/**
 * Appearance (Alfred, 19 Nov 2026): each person picks Light, Dark or System in
 * My Profile -> Appearance. The choice is saved in this browser (localStorage), not on the
 * account. Nothing saved = the default below.
 */
export const APPEARANCE_STORAGE_KEY = "tia-hrms-theme";

export const APPEARANCE_OPTIONS = ["light", "dark", "system"] as const;
export type Appearance = (typeof APPEARANCE_OPTIONS)[number];

/** These accounts start on Light instead of System; they can still change it. */
export const LIGHT_DEFAULT_EMAILS = ["angch@tertiaryinfotech.com", "tansc@tertiaryinfotech.com"];

export function defaultAppearanceFor(email: string | null | undefined): Appearance {
  return email && LIGHT_DEFAULT_EMAILS.includes(email.trim().toLowerCase()) ? "light" : "system";
}

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && (APPEARANCE_OPTIONS as readonly string[]).includes(value);
}
