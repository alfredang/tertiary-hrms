import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";

/**
 * Mobile Google Sign-In endpoint.
 * Receives a Google ID token from the native Capacitor Google Auth plugin,
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

    // Validate the token audience matches one of our client IDs (web, iOS, Android)
    const allowedAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean);

    if (!allowedAudiences.includes(googleUser.aud)) {
      return NextResponse.json(
        { error: "Token audience mismatch" },
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
          role: "STAFF",
          updatedAt: new Date(),
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

    // Set the session cookie
    const isSecure = process.env.AUTH_URL?.startsWith("https://") ?? false;
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const token = await encode({
      token: {
        sub: user.id,
        email: user.email,
        role: user.role,
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
        role: user.role,
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
