import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminUser } from "@/lib/woods-square-auth";

export const dynamic = "force-dynamic";

// Empty string clears the delivery override (PIN then goes to the account email).
const deliveryEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().email("Enter a valid email.").nullable(),
);

const rosterUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        woodsSquareInvite: z.boolean(),
        woodsSquareEmail: deliveryEmail.optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// Admin saves the Woods Square invite roster + per-person PIN delivery overrides.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = rosterUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Apply all row changes atomically — only the two Woods Square columns are written.
  const { updates } = parsed.data;
  await prisma.$transaction(
    updates.map((u) =>
      prisma.employee.update({
        where: { id: u.employeeId },
        data: {
          woodsSquareInvite: u.woodsSquareInvite,
          woodsSquareEmail: u.woodsSquareEmail ?? null,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true, updated: updates.length });
}
