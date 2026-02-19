import { cookies } from "next/headers";

export async function getViewMode(): Promise<"admin" | "staff"> {
  const cookieStore = await cookies();
  const viewAs = cookieStore.get("viewAs")?.value;
  return viewAs === "staff" ? "staff" : "admin";
}
