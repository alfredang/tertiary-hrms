/** Client-safe role check (no server imports). Server code uses getTrainerAccess() in trainer-access.ts. */
export const TRAINER_ADMIN_ROLE = "TRAINER_ADMIN";

export function hasTrainerAdminAccess(roles: readonly string[] | null | undefined): boolean {
  return !!roles?.some((r) => r.toUpperCase() === TRAINER_ADMIN_ROLE);
}
