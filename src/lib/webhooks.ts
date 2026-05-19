// Built-in webhooks (hardcoded UI cards, not stored in the Webhook table).
// These are the public approval endpoints triggered from Accept/Decline links
// in approver emails. The actual public route handlers will land in Phase 2.

export interface BuiltInWebhook {
  id: string;
  name: string;
  description: string;
  method: "GET";
  pathTemplate: string;
  status: "planned" | "active";
}

export const BUILT_IN_WEBHOOKS: BuiltInWebhook[] = [
  {
    id: "leave-accept",
    name: "Leave Request — Approve",
    description:
      "When an approver clicks Accept in a leave-request email, this webhook marks the leave APPROVED and emails the requester.",
    method: "GET",
    pathTemplate: "/api/public/leave-approval/respond?token={TOKEN}&action=accept",
    status: "active",
  },
  {
    id: "leave-decline",
    name: "Leave Request — Decline",
    description:
      "When an approver clicks Decline, this webhook marks the leave REJECTED and notifies the requester.",
    method: "GET",
    pathTemplate: "/api/public/leave-approval/respond?token={TOKEN}&action=decline",
    status: "active",
  },
  {
    id: "expense-accept",
    name: "Expense Claim — Approve",
    description:
      "When an approver clicks Accept in an expense-claim email, this webhook marks the claim APPROVED and emails the requester.",
    method: "GET",
    pathTemplate: "/api/public/expense-approval/respond?token={TOKEN}&action=accept",
    status: "active",
  },
  {
    id: "expense-decline",
    name: "Expense Claim — Decline",
    description:
      "When an approver clicks Decline, this webhook marks the claim REJECTED and notifies the requester.",
    method: "GET",
    pathTemplate: "/api/public/expense-approval/respond?token={TOKEN}&action=decline",
    status: "active",
  },
];

export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "");
}

export function generateEndpointToken(): string {
  // 48-char hex, matches AI-LMS-TMS pattern (crypto.randomBytes(24).toString('hex')).
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
