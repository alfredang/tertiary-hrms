import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const calendarEventUpdateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  allDay: z.boolean().default(false),
  type: z.enum(["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"]),
  color: z.string().optional(),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let currentUserId: string | null = null;

    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      currentUserId = session.user.id;
    }

    const { id } = await params;

    const event = await prisma.calendarEvent.findUnique({ where: { id } });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Calendar is personal — only the creator can delete their own events
    if (!isDevAuthSkipped() && event.createdById !== currentUserId) {
      return NextResponse.json(
        { error: "Forbidden - you can only delete your own events" },
        { status: 403 }
      );
    }

    await prisma.calendarEvent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let currentUserId: string | null = null;

    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      currentUserId = session.user.id;
    }

    const { id } = await params;

    const body = await req.json();
    const validation = calendarEventUpdateSchema.safeParse(body);
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

    const event = await prisma.calendarEvent.findUnique({ where: { id } });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Calendar is personal — only the creator can edit their own events
    if (!isDevAuthSkipped() && event.createdById !== currentUserId) {
      return NextResponse.json(
        { error: "Forbidden - you can only edit your own events" },
        { status: 403 }
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        description: description || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        allDay,
        type,
        color: color || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
