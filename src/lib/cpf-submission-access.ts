import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { canViewCpfSubmissions } from "@/lib/cpf-submission-files";

/** Session gate for the CPF statement list and downloads: admins and accountants. */
export async function sessionCanViewCpfSubmissions(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return canViewCpfSubmissions(session.user.role, session.user.roles ?? []);
}
