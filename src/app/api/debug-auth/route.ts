import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found in database",
        dbConnected: true
      });
    }

    // Test password
    const isValid = await bcrypt.compare("Tertiary@888", user.password);

    return NextResponse.json({
      success: true,
      userExists: true,
      passwordMatch: isValid,
      userEmail: user.email,
      userRole: user.role,
      passwordHashLength: user.password.length,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      dbConnected: false,
    });
  }
}
