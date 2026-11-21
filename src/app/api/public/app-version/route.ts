import { NextResponse } from "next/server";
import { ANDROID_STORE_URL, IOS_STORE_URL, liveVersion } from "@/lib/mobile-app-version";

export const dynamic = "force-dynamic";

// GET /api/public/app-version: the app version live in each store (no auth). The apps compare
// their own version with it at launch and block with "Update required" when they are older.
export async function GET() {
  const [ios, android] = await Promise.all([liveVersion("ios"), liveVersion("android")]);
  return NextResponse.json({
    ios: { liveVersion: ios, storeUrl: IOS_STORE_URL },
    android: { liveVersion: android, storeUrl: ANDROID_STORE_URL },
  });
}
