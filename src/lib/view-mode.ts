import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { canViewAs } from "@/lib/view-as-policy";
import { hasTrainerAdminAccess } from "@/lib/trainer-access-client";

// "trainer" = the Trainer Admin view, for admins who also hold TRAINER_ADMIN (Alfred, 20 Nov 2026).
const VALID_VIEWS = ["admin", "staff", "accountant", "intern", "trainer"] as const;
type ViewMode = (typeof VALID_VIEWS)[number];

export async function getViewMode(): Promise<ViewMode> {
  const cookieStore = await cookies();
  const viewAs = cookieStore.get("viewAs")?.value as ViewMode | undefined;
  if (!viewAs || viewAs === "admin" || !VALID_VIEWS.includes(viewAs)) return "admin";
  // Only Alfred may view as any role (22 Nov 2026); a left-over cookie of anyone else is ignored.
  // Others: their own view, or the Trainer Admin view if they hold TRAINER_ADMIN (Deepa, Tan Soik Ching).
  const session = await auth().catch(() => null);
  if (canViewAs(session?.user?.email)) return viewAs;
  return viewAs === "trainer" && hasTrainerAdminAccess(session?.user?.roles) ? "trainer" : "admin";
}
