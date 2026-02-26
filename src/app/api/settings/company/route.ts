import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const companySettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  uen: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  approvalEmails: z.array(z.string().email()).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    // Authentication check
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Authorization check - only ADMIN, HR can edit settings
      if (!["ADMIN", "HR"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();

    // Validate request body
    const validation = companySettingsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    // Update or create settings
    const settings = await prisma.companySettings.upsert({
      where: { id: "company_settings" },
      update: {
        ...validation.data,
        updatedAt: new Date(),
      },
      create: {
        id: "company_settings",
        ...validation.data,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating company settings:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to update company settings",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    let settings = await prisma.companySettings.findUnique({
      where: { id: "company_settings" },
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          id: "company_settings",
          name: "Tertiary Infotech",
          uen: "",
          address: "",
          phone: "",
          email: "",
          website: "",
        },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching company settings:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch company settings",
      },
      { status: 500 }
    );
  }
}
