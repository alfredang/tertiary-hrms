import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (session.user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Forbidden - only ADMIN can reset passwords" },
          { status: 403 }
        );
      }
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { userId: true, name: true },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD;
    if (!defaultPassword) {
      return NextResponse.json(
        { error: "Default password not configured on server" },
        { status: 500 }
      );
    }
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    await prisma.user.update({
      where: { id: employee.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      message: `Password reset for ${employee.name}`,
    });
  } catch (error) {
    console.error(`Error resetting password for employee ${id}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
