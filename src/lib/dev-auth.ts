/**
 * Check if authentication is bypassed for local development.
 * SKIP_AUTH only works when NODE_ENV is not "production".
 */
export function isDevAuthSkipped(): boolean {
  return (
    process.env.SKIP_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
  );
}
