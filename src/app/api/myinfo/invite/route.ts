import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";
import { SignJWT } from "jose";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "HR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await req.json();
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, email: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Signed invite token — stateless, expires in 48 hours
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ employeeId: employee.id, email: employee.email, name: employee.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("48h")
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hrms.tertiaryinfo.tech";
  const link = `${appUrl}/myinfo/authorize?token=${token}`;
  const firstName = employee.name.split(" ")[0];

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:560px;">
      <p>Hi ${firstName},</p>
      <p>Your HR team has invited you to complete your employee profile using <strong>Singpass MyInfo</strong>.</p>
      <p>Clicking the button below will take you to Singpass, where you can securely authorise us to retrieve your personal details (name, date of birth, nationality, address, education level) — so you don't have to fill them in manually.</p>
      <p style="margin:28px 0;">
        <a href="${link}"
           style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
          Complete Profile via Singpass
        </a>
      </p>
      <p style="color:#666;font-size:12px;">This link expires in 48 hours. If you did not expect this email, please contact HR.</p>
    </div>
  `;

  try {
    await sendEmail({
      to: employee.email,
      subject: "Complete Your Employee Profile via Singpass",
      html,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
