/**
 * Phone push notifications for the native apps. Every in-app Notification row is also pushed to
 * the recipient's registered devices (DeviceToken): iOS straight to APNs (token-based .p8 auth),
 * Android through FCM HTTP v1 (service-account OAuth). Hooked from the Prisma client in
 * src/lib/prisma.ts, so any code that creates a Notification gets a push for free.
 *
 * Credentials live in CompanyCredential (env vars are a fallback):
 *   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (default com.tertiaryinfotech.hrportal)
 *   FCM_SERVICE_ACCOUNT_JSON (the Firebase service-account key JSON)
 * Best effort throughout: a push failure is logged and never thrown to the caller.
 */
import crypto from "node:crypto";
import http2 from "node:http2";
import { prisma } from "@/lib/prisma";

export interface PushItem {
  userId: string;
  title: string;
  body: string;
  link?: string | null;
}

const CRED_KEYS = ["APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "FCM_SERVICE_ACCOUNT_JSON"] as const;
type CredKey = (typeof CRED_KEYS)[number];

async function loadCreds(): Promise<Partial<Record<CredKey, string>>> {
  const rows = await prisma.companyCredential.findMany({ where: { keyName: { in: [...CRED_KEYS] } } });
  const out: Partial<Record<CredKey, string>> = {};
  for (const k of CRED_KEYS) {
    const v = rows.find((r) => r.keyName === k)?.keyValue || process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

function b64url(v: string | Buffer): string {
  return Buffer.from(v).toString("base64url");
}

// ── APNs ─────────────────────────────────────────────────────────────────────

let apnsJwt: { token: string; at: number; kid: string } | null = null;

function apnsAuthToken(keyP8: string, keyId: string, teamId: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && apnsJwt.kid === keyId && now - apnsJwt.at < 50 * 60) return apnsJwt.token;
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const sig = crypto
    .sign("sha256", Buffer.from(`${head}.${claims}`), { key: keyP8.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  apnsJwt = { token: `${head}.${claims}.${sig}`, at: now, kid: keyId };
  return apnsJwt.token;
}

function apnsSend(
  host: string,
  deviceToken: string,
  headers: Record<string, string>,
  payload: string,
): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", (err) => resolve({ status: 0, reason: err.message }));
    const req = client.request({ ":method": "POST", ":path": `/3/device/${deviceToken}`, ...headers });
    let data = "";
    let status = 0;
    req.setTimeout(10_000, () => {
      req.close();
      resolve({ status: 0, reason: "timeout" });
    });
    req.on("response", (h) => (status = Number(h[":status"])));
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = data ? JSON.parse(data).reason : undefined;
      } catch {
        reason = data;
      }
      resolve({ status, reason });
    });
    req.on("error", (err) => {
      client.close();
      resolve({ status: 0, reason: err.message });
    });
    req.end(payload);
  });
}

// ── FCM ──────────────────────────────────────────────────────────────────────

let fcmAccess: { token: string; exp: number; email: string } | null = null;

async function fcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmAccess && fcmAccess.email === sa.client_email && fcmAccess.exp - 60 > now) return fcmAccess.token;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${claims}`), sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claims}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`FCM OAuth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: j.access_token, exp: now + j.expires_in, email: sa.client_email };
  return j.access_token;
}

// ── Public ───────────────────────────────────────────────────────────────────

/** iOS tokens Apple has retired; Android tokens FCM reports as gone. */
function isDeadToken(platform: string, status: number, reason?: string): boolean {
  if (platform === "ios") return status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
  return status === 404 || reason === "UNREGISTERED" || reason === "INVALID_ARGUMENT";
}

/** Push each item to the user's registered devices. Never throws. */
export async function sendPush(items: PushItem[]): Promise<{ sent: number; failed: number; removed: number }> {
  const result = { sent: 0, failed: 0, removed: 0 };
  try {
    const userIds = Array.from(new Set(items.map((i) => i.userId)));
    if (userIds.length === 0) return result;
    const devices = await prisma.deviceToken.findMany({ where: { userId: { in: userIds } } });
    if (devices.length === 0) return result;

    const creds = await loadCreds();
    const sa = creds.FCM_SERVICE_ACCOUNT_JSON
      ? (JSON.parse(creds.FCM_SERVICE_ACCOUNT_JSON) as { project_id: string; client_email: string; private_key: string })
      : null;
    const dead: string[] = [];

    const unread = new Map<string, number>();
    for (const uid of userIds) {
      unread.set(uid, await prisma.notification.count({ where: { userId: uid, read: false } }));
    }

    for (const item of items) {
      for (const d of devices.filter((x) => x.userId === item.userId)) {
        let status = 0;
        let reason: string | undefined;
        try {
          if (d.platform === "ios") {
            if (!creds.APNS_KEY_P8 || !creds.APNS_KEY_ID || !creds.APNS_TEAM_ID) continue;
            const host = d.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
            const payload = JSON.stringify({
              aps: { alert: { title: item.title, body: item.body }, sound: "default", badge: unread.get(item.userId) ?? 0 },
              link: item.link ?? "",
            });
            ({ status, reason } = await apnsSend(
              host,
              d.token,
              {
                authorization: `bearer ${apnsAuthToken(creds.APNS_KEY_P8, creds.APNS_KEY_ID, creds.APNS_TEAM_ID)}`,
                "apns-topic": creds.APNS_BUNDLE_ID || "com.tertiaryinfotech.hrportal",
                "apns-push-type": "alert",
                "apns-priority": "10",
              },
              payload,
            ));
          } else if (d.platform === "android") {
            if (!sa) continue;
            const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
              method: "POST",
              headers: { authorization: `Bearer ${await fcmAccessToken(sa)}`, "content-type": "application/json" },
              body: JSON.stringify({
                message: {
                  token: d.token,
                  notification: { title: item.title, body: item.body },
                  data: { link: item.link ?? "" },
                  android: { priority: "HIGH", notification: { channel_id: "hrms_alerts", sound: "default" } },
                },
              }),
            });
            status = res.status;
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
              reason = j.error?.details?.find((x) => x.errorCode)?.errorCode ?? j.error?.status;
            }
          }
        } catch (err) {
          reason = err instanceof Error ? err.message : String(err);
        }
        if (status === 200) result.sent++;
        else {
          result.failed++;
          if (isDeadToken(d.platform, status, reason)) dead.push(d.token);
          else console.warn(`[push] ${d.platform} ${status} ${reason ?? ""}`);
        }
      }
    }
    if (dead.length) {
      const r = await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      result.removed = r.count;
    }
  } catch (err) {
    console.error("[push] failed:", err instanceof Error ? err.message : err);
  }
  return result;
}
