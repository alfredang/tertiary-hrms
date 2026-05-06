import crypto from "crypto";
import { SignJWT, jwtVerify, compactDecrypt } from "jose";

// MyInfo Business API v4 endpoints
const ENDPOINTS = {
  sandbox: {
    authorize: "https://test.api.myinfo.gov.sg/com/v4/authorize",
    token:     "https://test.api.myinfo.gov.sg/com/v4/token",
    person:    "https://test.api.myinfo.gov.sg/com/v4/person",
  },
  production: {
    authorize: "https://api.myinfo.gov.sg/com/v4/authorize",
    token:     "https://api.myinfo.gov.sg/com/v4/token",
    person:    "https://api.myinfo.gov.sg/com/v4/person",
  },
} as const;

// Attributes to request from MyInfo
const SCOPE = "name dob sex nationality mobileno regadd edulevel nric";

function getConfig() {
  const env = (process.env.MYINFO_ENVIRONMENT || "production") as "sandbox" | "production";
  return {
    endpoints:          ENDPOINTS[env],
    clientId:           process.env.MYINFO_CLIENT_ID || "",
    privateKeyPem:      (process.env.MYINFO_PRIVATE_KEY_PEM || "").replace(/\\n/g, "\n"),
    myInfoPublicKeyPem: (process.env.MYINFO_PUBLIC_KEY_PEM  || "").replace(/\\n/g, "\n"),
    redirectUrl:        process.env.MYINFO_REDIRECT_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/myinfo/callback`,
    purposeId:          process.env.MYINFO_PURPOSE_ID || "employment",
  };
}

// PKCE helpers
export function generatePKCE() {
  const verifier  = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// Build the Singpass authorization URL.
// The PKCE verifier + employeeId are embedded in a short-lived signed state JWT
// so no server-side storage is needed between redirect and callback.
export async function buildAuthUrl(employeeId: string): Promise<{ url: string }> {
  const config = getConfig();
  const { verifier, challenge } = generatePKCE();

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const state = await new SignJWT({ employeeId, verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret);

  const params = new URLSearchParams({
    client_id:             config.clientId,
    scope:                 SCOPE,
    purpose_id:            config.purposeId,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    redirect_uri:          config.redirectUrl,
    state,
  });

  return { url: `${config.endpoints.authorize}?${params}` };
}

// Recover employeeId + PKCE verifier from the state JWT
export async function decodeState(state: string): Promise<{ employeeId: string; verifier: string }> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const { payload } = await jwtVerify(state, secret);
  return {
    employeeId: payload.employeeId as string,
    verifier:   payload.verifier   as string,
  };
}

// Exchange the authorization code for an access token using PKCE + client_assertion (RS256)
export async function exchangeToken(
  code: string,
  verifier: string
): Promise<{ accessToken: string; sub: string }> {
  const config     = getConfig();
  const privateKey = crypto.createPrivateKey(config.privateKeyPem);
  const now        = Math.floor(Date.now() / 1000);

  // Client assertion: JWT signed with our private key proving who we are
  const clientAssertion = await new SignJWT({
    sub: config.clientId,
    iss: config.clientId,
    aud: config.endpoints.token,
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const res = await fetch(config.endpoints.token, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:            "authorization_code",
      code,
      redirect_uri:          config.redirectUrl,
      client_id:             config.clientId,
      code_verifier:         verifier,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion:      clientAssertion,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return { accessToken: data.access_token, sub: data.sub };
}

// Fetch the person payload from MyInfo.
// Production: response is a JWE (encrypted with our public key) wrapping a JWS (signed by MyInfo).
// Sandbox: response may be plain JSON.
export async function getPersonData(accessToken: string, sub: string) {
  const config = getConfig();

  const res = await fetch(
    `${config.endpoints.person}/${sub}?scope=${encodeURIComponent(SCOPE)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`Person API failed (${res.status}): ${await res.text()}`);

  const body = await res.text();

  // Try plain JSON first (sandbox mode)
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    // Fall through to JWE decryption
  }

  // Decrypt JWE with our private key
  const privateKey = crypto.createPrivateKey(config.privateKeyPem);
  const { plaintext } = await compactDecrypt(body, privateKey);
  const jws = new TextDecoder().decode(plaintext);

  // Verify the inner JWS signature using MyInfo's public cert
  const myInfoPublicKey = crypto.createPublicKey(config.myInfoPublicKeyPem);
  const { payload } = await jwtVerify(jws, myInfoPublicKey);
  return payload as Record<string, unknown>;
}

// Map MyInfo person payload → our Employee model fields
export function mapToEmployee(person: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (person.name?.value)
    out.name = String(person.name.value).toUpperCase();

  if (person.dob?.value) {
    const d = new Date(person.dob.value);
    if (!isNaN(d.getTime())) out.dateOfBirth = d;
  }

  if (person.sex?.code) {
    const c = person.sex.code;
    if (c === "M") out.gender = "MALE";
    else if (c === "F") out.gender = "FEMALE";
  }

  if (person.nationality?.desc)
    out.nationality = person.nationality.desc;

  if (person.mobileno?.nbr?.value) {
    const prefix = person.mobileno.prefix?.value || "+65";
    out.phone = `${prefix} ${person.mobileno.nbr.value}`;
  }

  if (person.regadd) {
    const a = person.regadd;
    if (a.type === "SG") {
      const parts = [
        a.block?.value,
        a.street?.value,
        a.floor?.value && a.unit?.value ? `#${a.floor.value}-${a.unit.value}` : null,
        a.building?.value || null,
        `Singapore ${a.postal?.value || ""}`,
      ].filter(Boolean);
      out.address = parts.join(" ").trim();
    } else if (a.line1?.value) {
      out.address = [a.line1.value, a.line2?.value, a.country?.desc].filter(Boolean).join(", ");
    }
  }

  // MyInfo edulevel codes → our 4-value enum (DIPLOMA / DEGREE / MASTER / PHD)
  if (person.edulevel?.code) {
    const code = parseInt(person.edulevel.code, 10);
    if (code === 12)      out.educationLevel = "PHD";
    else if (code === 11) out.educationLevel = "MASTER";
    else if (code >= 9)   out.educationLevel = "DEGREE";
    else                  out.educationLevel = "DIPLOMA";
  }

  if (person.nric?.value)
    out.nric = person.nric.value;

  return out;
}
