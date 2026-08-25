import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getDriveClient, isDriveAuthRevoked, DRIVE_REAUTH_HINT } from "@/lib/drive";
import { CPF_SUBMISSION_FOLDER_ID } from "@/lib/cpf-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const drive = await getDriveClient();
    const folder = await drive.files.get({
      fileId: CPF_SUBMISSION_FOLDER_ID,
      fields: "id, name, capabilities(canAddChildren)",
      supportsAllDrives: true,
    });
    if (!folder.data.capabilities?.canAddChildren) {
      return NextResponse.json({
        ok: false,
        step: "folder",
        error: `Connected, but the Google account cannot write to the CPF folder "${folder.data.name}". Share the folder with the Gmail account as Editor.`,
      });
    }
    return NextResponse.json({
      ok: true,
      message: `Google Drive connected — write access to "${folder.data.name}" confirmed.`,
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    if (isDriveAuthRevoked(err)) {
      return NextResponse.json({ ok: false, step: "token", error: message, hint: DRIVE_REAUTH_HINT });
    }
    const insufficientScope = err?.response?.status === 403 || /insufficient/i.test(message);
    return NextResponse.json({
      ok: false,
      step: "drive",
      error: message,
      hint: insufficientScope
        ? "The refresh token works but was authorised without the Drive scope. Mint a new token that includes https://www.googleapis.com/auth/drive alongside https://mail.google.com/."
        : undefined,
    });
  }
}
