import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { sendEmail } from "@/lib/send-email";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || !hasAdminAccess(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const session = await auth();
  const toEmail = (session?.user as any)?.email as string | undefined;
  if (!toEmail) {
    return NextResponse.json({ error: "No email address found for your account" }, { status: 400 });
  }

  try {
    await sendEmail({
      to: toEmail,
      subject: "HRMS - Test Email",
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">
<p>Hi,</p>
<p>This is a test email from your HRMS system. If you are reading this, email sending is working correctly.</p>
<p style="color:#6b7280;font-size:12px;">Sent at ${new Date().toISOString()} UTC</p>
</div>`,
    });
    return NextResponse.json({ ok: true, sentTo: toEmail });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to send email" }, { status: 500 });
  }
}
