import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

const calendarEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  allDay: z.boolean().default(false),
  type: z.enum(["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"]),
  color: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    let currentUserId: string | null = null;

    if (process.env.SKIP_AUTH !== "true") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      currentUserId = session.user.id;
    }

    const body = await req.json();
    const validation = calendarEventSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, description, startDate, endDate, allDay, type, color } = validation.data;

    if (new Date(endDate) < new Date(startDate)) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const calendarEvent = await prisma.calendarEvent.create({
      data: {
        title,
        description: description || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        allDay,
        type,
        color: color || null,
        createdById: currentUserId,
      },
    });

    return NextResponse.json(calendarEvent, { status: 201 });
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
