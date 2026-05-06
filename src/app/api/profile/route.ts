import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, Gender, EducationLevel } from "@prisma/client";
import { z } from "zod";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const profileUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  phone: z.string().optional(),
  dateOfBirth: z
    .string()
    .optional()
    .refine((d) => !d || !isNaN(Date.parse(d)), { message: "Invalid date" }),
  gender: z.nativeEnum(Gender).optional(),
  nationality: z.string().optional(),
  nric: z.string().optional(),
  address: z.string().optional(),
  educationLevel: z.nativeEnum(EducationLevel).optional(),
});

export async function PATCH(req: NextRequest) {
  let userEmail: string | undefined;

  if (isDevAuthSkipped()) {
    userEmail = "admin@tertiaryinfotech.com";
  } else {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = session.user.email;
  }

  const body = await req.json();
  const validation = profileUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.format() },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { employee: true },
  });

  if (!user?.employee) {
    return NextResponse.json(
      { error: "Employee profile not found" },
      { status: 404 }
    );
  }

  const d = validation.data;

  // Build update payload respecting schema nullability:
  // nullable: phone, dateOfBirth, nric, address  (can be set to null)
  // non-nullable: name, gender, nationality, educationLevel  (skip if falsy)
  const data: Prisma.EmployeeUpdateInput = { updatedAt: new Date() };
  if (d.name) data.name = d.name.toUpperCase();
  if (d.phone !== undefined) data.phone = d.phone || null;
  if (d.dateOfBirth !== undefined)
    data.dateOfBirth = d.dateOfBirth ? new Date(d.dateOfBirth) : null;
  if (d.gender) data.gender = d.gender;
  if (d.nationality) data.nationality = d.nationality;
  if (d.nric !== undefined) data.nric = d.nric || null;
  if (d.address !== undefined) data.address = d.address || null;
  if (d.educationLevel) data.educationLevel = d.educationLevel;

  const updated = await prisma.employee.update({
    where: { id: user.employee.id },
    data,
  });

  return NextResponse.json(updated);
}
