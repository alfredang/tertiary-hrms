import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";

/**
 * Trainer Management is gated by its own role, TRAINER_ADMIN, held alongside a person's
 * normal role (e.g. ["STAFF", "TRAINER_ADMIN"]). ADMIN alone does not grant it: trainer
 * records hold NRIC, phone and email, so access is opt-in per person.
 * TRAINER_ADMIN is deliberately NOT in auth.ts ROLE_PRIORITY — it never becomes the
 * primary role, so it does not change anyone's dashboard or view mode.
 */
import { hasTrainerAdminAccess } from "@/lib/trainer-access-client";
export { hasTrainerAdminAccess, TRAINER_ADMIN_ROLE } from "@/lib/trainer-access-client";

export type TrainerAccess =
  | { ok: true; userId: string | null; email: string | null }
  | { ok: false; status: 401 | 403 };

/** Server-side check for pages and API routes. */
export async function getTrainerAccess(): Promise<TrainerAccess> {
  if (isDevAuthSkipped()) return { ok: true, userId: null, email: "dev@localhost" };
  const session = await auth();
  if (!session?.user) return { ok: false, status: 401 };
  if (!hasTrainerAdminAccess(session.user.roles)) return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id ?? null, email: session.user.email ?? null };
}
