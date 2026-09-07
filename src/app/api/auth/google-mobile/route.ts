import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";

/**
 * Mobile Google Sign-In endpoint.
 * Receives a Google ID token from the separate native iOS/Android app,
 * verifies it with Google, and creates a NextAuth-compatible session.
 */
export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: "Missing idToken" },
        { status: 400 }
      );
    }

    // Verify the ID token with Google
    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!googleResponse.ok) {
      return NextResponse.json(
        { error: "Invalid Google token" },
        { status: 401 }
      );
    }

    const googleUser = await googleResponse.json();

    // Validate the token audience matches one of our client IDs (web, iOS, Android).
    // The native client ids are also readable from CompanyCredential so they can be
    // set from Settings → Credentials without a redeploy, matching how every other
    // third-party credential in this app is managed.
    const credRows = await prisma.companyCredential.findMany({
      where: { keyName: { in: ["GOOGLE_IOS_CLIENT_ID", "GOOGLE_ANDROID_CLIENT_ID"] } },
    });
    const storedIds = Object.fromEntries(credRows.map((r) => [r.keyName, r.keyValue]));

    const allowedAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      storedIds.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID,
      storedIds.GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_ANDROID_CLIENT_ID,
    ]
      .map((v) => v?.trim().replace(/^["']+|["']+$/g, ""))
      .filter(Boolean);

    if (!allowedAudiences.includes(googleUser.aud)) {
      console.warn(
        `[google-mobile] Audience mismatch: token aud=${googleUser.aud} is not in the allow-list ` +
          `(${allowedAudiences.length} client id(s) configured). Add the mobile OAuth client id in ` +
          `Settings → Credentials or as GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID.`,
      );
      return NextResponse.json(
        { error: "This app build is not authorised to sign in. Please contact IT." },
        { status: 401 }
      );
    }

    // Google only asserts the address is real once it is verified.
    if (googleUser.email_verified === "false" || googleUser.email_verified === false) {
      return NextResponse.json(
        { error: "This Google account's email is not verified." },
        { status: 401 }
      );
    }

    const email = googleUser.email;
    if (!email) {
      return NextResponse.json(
        { error: "No email in Google token" },
        { status: 400 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true },
    });

    // Block inactive employees
    if (user?.employee?.status === "INACTIVE") {
      return NextResponse.json(
        { error: "Account is inactive. Please contact HR." },
        { status: 403 }
      );
    }

    if (!user) {
      // Create new user with STAFF role
      user = await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          password: "",
          roles: ["STAFF"],
        },
        include: { employee: true },
      });
    }

    // Ensure Google account is linked
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: "google",
      },
    });

    if (!existingAccount) {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleUser.sub,
        },
      });
    }

    // Create a NextAuth-compatible JWT token
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const ROLE_PRIORITY = ["ADMIN", "HR", "MANAGER", "ACCOUNTANT", "STAFF", "INTERN"] as const;
    const primaryRole = ROLE_PRIORITY.find((r) => user!.roles.includes(r as never)) ?? "STAFF";

    // Set the session cookie
    const isSecure = process.env.AUTH_URL?.startsWith("https://") ?? false;
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const token = await encode({
      token: {
        sub: user.id,
        email: user.email,
        role: primaryRole,
        roles: user.roles,
        employeeId: user.employee?.id,
        needsSetup: !user.employee?.id,
        name: user.employee?.name || user.email,
      },
      secret,
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    const cookieStore = await cookies();
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: primaryRole,
        roles: user.roles,
        employeeId: user.employee?.id,
        needsSetup: !user.employee?.id,
      },
    });
  } catch (error) {
    console.error("Mobile Google sign-in error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
