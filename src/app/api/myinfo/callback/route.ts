import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { decodeState, exchangeToken, getPersonData, mapToEmployee } from "@/lib/myinfo";
import { prisma } from "@/lib/prisma";

// MyInfo redirects here after the user authorises on Singpass.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hrms.tertiaryinfo.tech";

  if (error) {
    return NextResponse.redirect(`${baseUrl}/myinfo/error?reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/myinfo/error?reason=missing_params`);
  }

  try {
    // Decode the PKCE state JWT → { employeeId (which is the invite token), verifier }
    const { employeeId: inviteToken, verifier } = await decodeState(state);

    // Verify the original invite token to get the real employeeId
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const { payload } = await jwtVerify(inviteToken, secret);
    const employeeId = payload.employeeId as string;

    // Exchange authorization code for access token
    const { accessToken, sub } = await exchangeToken(code, verifier);

    // Fetch and decrypt the person data from MyInfo
    const person = await getPersonData(accessToken, sub);

    // Map MyInfo fields to our Employee model
    const updates = mapToEmployee(person as Record<string, any>);

    // Update the employee record (only fields that MyInfo returned)
    await prisma.employee.update({
      where: { id: employeeId },
      data: updates as any,
    });

    return NextResponse.redirect(`${baseUrl}/myinfo/success`);
  } catch (err: any) {
    console.error("MyInfo callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/myinfo/error?reason=${encodeURIComponent(err.message || "unknown_error")}`
    );
  }
}
