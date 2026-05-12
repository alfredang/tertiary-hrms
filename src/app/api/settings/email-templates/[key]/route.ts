import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getTemplateDef, type TemplateKey } from "@/lib/email-templates/defaults";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  return session?.user && ["ADMIN", "HR"].includes(session.user.role);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { key } = await params;
  const def = getTemplateDef(key);
  if (!def) return NextResponse.json({ error: "Unknown template" }, { status: 404 });

  const row = await prisma.emailTemplate.findUnique({ where: { key: key as TemplateKey } });
  return NextResponse.json({
    key,
    subject: row?.subject ?? def.defaultSubject,
    body: row?.body ?? def.defaultBody,
    isCustom: !!row,
    default: { subject: def.defaultSubject, body: def.defaultBody },
    variables: def.variables,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { key } = await params;
  if (!getTemplateDef(key)) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  const { subject, body } = await req.json();
  if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  const row = await prisma.emailTemplate.upsert({
    where: { key },
    create: { key, subject, body },
    update: { subject, body },
  });
  return NextResponse.json({ key: row.key, subject: row.subject, body: row.body });
}

// DELETE = reset to default (drop the override row).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { key } = await params;
  await prisma.emailTemplate.deleteMany({ where: { key } });
  return NextResponse.json({ ok: true });
}
