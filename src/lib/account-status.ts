/**
 * Statuses of people who have left. An account in one of these cannot sign in by any method
 * (password, email code, Google, the phone apps), and an open session ends at its next refresh
 * (Alfred, 20 Nov 2026: Terminated and Resigned block sign-in, the same as Inactive).
 */
export const LEFT_STATUSES = ["TERMINATED", "RESIGNED", "INACTIVE"] as const;

export function isSignInBlocked(status: string | null | undefined): boolean {
  return !!status && (LEFT_STATUSES as readonly string[]).includes(status);
}
