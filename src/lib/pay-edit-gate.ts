import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { canEditPay, PAY_EDIT_REFUSAL } from "@/lib/pay-edit-policy";

/**
 * Server gate for every route that changes salary or pay (src/lib/pay-edit-policy.ts).
 * Returns a 401/403 response to send back, or null when the caller is an admin.
 */
export async function requirePayEditor(): Promise<NextResponse | null> {
  if (isDevAuthSkipped()) return null;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditPay(session.user)) return NextResponse.json({ error: PAY_EDIT_REFUSAL }, { status: 403 });
  return null;
}

/** For a route where pay is only part of the change (employee create/edit): may this caller change pay? */
export async function callerCanEditPay(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  return canEditPay(session?.user);
}
