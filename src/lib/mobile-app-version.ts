/**
 * Force update for the native apps (Alfred, 22 Nov 2026). Edge-safe: no Prisma, used by middleware.
 *
 * "Live" = the version people can download from the store right now. A phone running an older
 * version must update: the 1.20 iOS / 1.18 Android apps check `/api/public/app-version` and show a
 * blocking "Update required" screen; older apps (which send no version header) get HTTP 426 from
 * every `/api/mobile/*` call.
 *
 * - iOS: read from Apple's public lookup, so forcing starts by itself only once Apple releases a
 *   version (never during App Review).
 * - Android: Play has no public lookup. Set ANDROID_LIVE_VERSION to the versionName once a release
 *   has finished rolling out on the production track (check the Publisher API), then deploy.
 */

export const IOS_APP_ID = "6759821144";
export const IOS_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;
export const ANDROID_PACKAGE = "com.tertiaryinfotech.hrportal";
export const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/** Android versionName live on Play production. null = do not force Android users. */
export const ANDROID_LIVE_VERSION: string | null = null;

/** First app versions that send X-App-Version and check for updates themselves. */
export const FIRST_CHECKING_VERSION = { ios: "1.20", android: "1.18" } as const;

export type MobilePlatform = "ios" | "android";

/** -1, 0 or 1, comparing dotted numbers ("1.9" < "1.10"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

let iosCache: { version: string | null; at: number } | null = null;
const IOS_CACHE_MS = 15 * 60 * 1000;

/** The iOS version on the App Store (Singapore), cached 15 minutes. null when the lookup fails. */
export async function liveIosVersion(): Promise<string | null> {
  if (iosCache && Date.now() - iosCache.at < IOS_CACHE_MS) return iosCache.version;
  let version: string | null = iosCache?.version ?? null;
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${IOS_APP_ID}&country=sg`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { results?: { version?: string }[] };
      version = data.results?.[0]?.version ?? null;
    }
  } catch {
    // keep the last known value; a failed lookup never forces anyone
  }
  iosCache = { version, at: Date.now() };
  return version;
}

export async function liveVersion(platform: MobilePlatform): Promise<string | null> {
  return platform === "ios" ? liveIosVersion() : ANDROID_LIVE_VERSION;
}

export function storeUrl(platform: MobilePlatform): string {
  return platform === "ios" ? IOS_STORE_URL : ANDROID_STORE_URL;
}

/**
 * Which app and version sent this request. New apps say so in headers; older ones are recognised by
 * their HTTP client's User-Agent (iOS CFNetwork, Android Dalvik) and reported with version null.
 * Anything else (a browser, a script) is not a mobile app: null.
 */
export function mobileClient(headers: Headers): { platform: MobilePlatform; version: string | null } | null {
  const p = headers.get("x-app-platform")?.toLowerCase();
  const v = headers.get("x-app-version");
  if ((p === "ios" || p === "android") && v) return { platform: p, version: v };
  const ua = headers.get("user-agent") ?? "";
  if (ua.includes("Mozilla")) return null;
  if (ua.includes("CFNetwork") && ua.includes("Darwin")) return { platform: "ios", version: null };
  if (ua.startsWith("Dalvik/")) return { platform: "android", version: null };
  return null;
}

/** The 426 body when this request comes from an app older than the store's, else null. */
export async function upgradeRequired(headers: Headers): Promise<{ error: string; code: "UPGRADE_REQUIRED"; storeUrl: string } | null> {
  const client = mobileClient(headers);
  if (!client) return null;
  const live = await liveVersion(client.platform);
  if (!live) return null;
  // An app without the version header predates the update check; force it only once a checking version is live.
  const outdated = client.version
    ? compareVersions(client.version, live) < 0
    : compareVersions(live, FIRST_CHECKING_VERSION[client.platform]) >= 0;
  if (!outdated) return null;
  return {
    error: `A new version of TIA HRMS (${live}) is available. Please update the app to continue.`,
    code: "UPGRADE_REQUIRED",
    storeUrl: storeUrl(client.platform),
  };
}
