import { cookies } from "next/headers";

// "trainer" = the Trainer Admin view, for admins who also hold TRAINER_ADMIN (Alfred, 20 Nov 2026).
const VALID_VIEWS = ["admin", "staff", "accountant", "intern", "trainer"] as const;
type ViewMode = (typeof VALID_VIEWS)[number];

export async function getViewMode(): Promise<ViewMode> {
  const cookieStore = await cookies();
  const viewAs = cookieStore.get("viewAs")?.value as ViewMode | undefined;
  return viewAs && VALID_VIEWS.includes(viewAs) ? viewAs : "admin";
}
