/**
 * Login OTPs are sent from the company's shared mailbox, not from a person's
 * (Alfred, 20 Nov 2026). The HRMS can hold several mail logins (SMTP saved in
 * Settings, SMTP from the server environment, the connected Gmail account), so
 * the OTP route tries the ones that really send as this address first and only
 * then falls back to the others, so a sign-in code still arrives.
 */
export const OTP_FROM_EMAIL = "sales@tertiarycourses.com.sg";

const norm = (s: string) => s.trim().toLowerCase();

/** True when a mail login can send with `wanted` in the From line. */
export function sendsAs(addresses: string[], wanted: string = OTP_FROM_EMAIL): boolean {
  return addresses.some((a) => norm(a) === norm(wanted));
}

/** Senders that can send as `wanted` first; the original order is kept within each group. */
export function orderOtpSenders<T extends { addresses: string[] }>(
  senders: T[],
  wanted: string = OTP_FROM_EMAIL,
): T[] {
  return [...senders.filter((s) => sendsAs(s.addresses, wanted)), ...senders.filter((s) => !sendsAs(s.addresses, wanted))];
}
