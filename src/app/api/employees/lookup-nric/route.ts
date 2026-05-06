import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nric = req.nextUrl.searchParams.get("nric")?.trim().toUpperCase();
  if (!nric) {
    return NextResponse.json({ error: "nric query param required" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { nric },
    select: {
      name:           true,
      phone:          true,
      dateOfBirth:    true,
      gender:         true,
      nationality:    true,
      nric:           true,
      address:        true,
      educationLevel: true,
    },
  });

  if (!employee) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    data: {
      fullName:       employee.name,
      phone:          employee.phone        ?? "",
      dateOfBirth:    employee.dateOfBirth
                        ? employee.dateOfBirth.toISOString().split("T")[0]
                        : "",
      gender:         employee.gender,
      nationality:    employee.nationality,
      nric:           employee.nric,
      address:        employee.address      ?? "",
      educationLevel: employee.educationLevel,
    },
  });
}
