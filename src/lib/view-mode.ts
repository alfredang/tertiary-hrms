import { cookies } from "next/headers";

const VALID_VIEWS = ["admin", "staff", "accountant", "intern"] as const;
type ViewMode = (typeof VALID_VIEWS)[number];

export async function getViewMode(): Promise<ViewMode> {
  const cookieStore = await cookies();
  const viewAs = cookieStore.get("viewAs")?.value as ViewMode | undefined;
  return viewAs && VALID_VIEWS.includes(viewAs) ? viewAs : "admin";
}
