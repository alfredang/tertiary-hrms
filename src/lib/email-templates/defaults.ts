// Default subject/body for every email template. The user can override these
// in Settings → Email Templates; rows in EmailTemplate are the per-tenant
// overrides. If a row is missing (or empty), we fall back to the defaults below.
//
// Variable syntax is `{VARIABLE_NAME}`. The renderer in `render.ts` does a
// plain string replace — no escaping. Available variables are documented per
// template so the Settings UI can surface them to the user.

export type TemplateKey =
  | "OTP"
  | "LEAVE_REQUEST"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "EXPENSE_REQUEST"
  | "EXPENSE_APPROVED"
  | "EXPENSE_REJECTED"
  | "PASSWORD_RESET";

export interface TemplateDef {
  key: TemplateKey;
  label: string;
  description: string;
  variables: { name: string; description: string }[];
  defaultSubject: string;
  defaultBody: string;
}

const COMMON_VARS = [
  { name: "COMPANY_NAME", description: "Full company name from Company Settings" },
  { name: "COMPANY_SHORT_NAME", description: "Short company name from Company Settings" },
  { name: "SITE_URL", description: "HR Portal site URL" },
  { name: "USER_EMAIL", description: "The recipient's email address" },
];

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  OTP: {
    key: "OTP",
    label: "OTP Email",
    description: "Sent when users request a one-time code to sign in.",
    variables: [
      { name: "OTP", description: "The 6-digit verification code" },
      { name: "EXPIRY_MINUTES", description: "OTP expiry time in minutes" },
      ...COMMON_VARS,
    ],
    defaultSubject: "OTP to login to {COMPANY_SHORT_NAME} HR Portal",
    defaultBody: `Hi,

Your OTP is {OTP}.

Please use this to log in to the {COMPANY_NAME} HR Portal at {SITE_URL} within {EXPIRY_MINUTES} minutes.

If you did not request this OTP, please ignore this email. Do not share this OTP with anyone.

Warm regards,
{COMPANY_NAME}`,
  },

  LEAVE_REQUEST: {
    key: "LEAVE_REQUEST",
    label: "Leave Request — Approver",
    description: "Sent to the approver when a staff member submits a leave request. Contains Accept / Decline buttons.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Name of the requesting employee" },
      { name: "LEAVE_TYPE", description: "e.g. Annual Leave, Medical Leave" },
      { name: "START_DATE", description: "Leave start date" },
      { name: "END_DATE", description: "Leave end date" },
      { name: "DAYS", description: "Number of working days requested" },
      { name: "REASON", description: "Reason given by the employee" },
      { name: "ACCEPT_URL", description: "Approve link (single-use)" },
      { name: "DECLINE_URL", description: "Reject link (single-use)" },
      { name: "ACTION_BUTTONS", description: "Placeholder — replaced with styled Accept/Decline buttons in the HTML email" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Leave request from {EMPLOYEE_NAME} — {START_DATE}",
    defaultBody: `Hi,

{EMPLOYEE_NAME} has submitted a leave request:

  Type:    {LEAVE_TYPE}
  Period:  {START_DATE} to {END_DATE} ({DAYS} day(s))
  Reason:  {REASON}

Please review and respond:

{ACTION_BUTTONS}

Or open the HR Portal: {SITE_URL}

— {COMPANY_NAME}`,
  },

  LEAVE_APPROVED: {
    key: "LEAVE_APPROVED",
    label: "Leave Approved — Requester",
    description: "Sent to the staff member after the approver clicks Accept.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Requesting employee" },
      { name: "LEAVE_TYPE", description: "Leave type" },
      { name: "START_DATE", description: "Start date" },
      { name: "END_DATE", description: "End date" },
      { name: "DAYS", description: "Working days" },
      { name: "APPROVER_NAME", description: "Who approved" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Your leave request was approved",
    defaultBody: `Hi {EMPLOYEE_NAME},

Your {LEAVE_TYPE} from {START_DATE} to {END_DATE} ({DAYS} day(s)) has been approved by {APPROVER_NAME}.

Enjoy your time off.

— {COMPANY_NAME}`,
  },

  LEAVE_REJECTED: {
    key: "LEAVE_REJECTED",
    label: "Leave Rejected — Requester",
    description: "Sent to the staff member after the approver clicks Decline.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Requesting employee" },
      { name: "LEAVE_TYPE", description: "Leave type" },
      { name: "START_DATE", description: "Start date" },
      { name: "END_DATE", description: "End date" },
      { name: "APPROVER_NAME", description: "Who declined" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Your leave request was not approved",
    defaultBody: `Hi {EMPLOYEE_NAME},

Your {LEAVE_TYPE} request from {START_DATE} to {END_DATE} was not approved by {APPROVER_NAME}.

Please contact your manager if you have questions.

— {COMPANY_NAME}`,
  },

  EXPENSE_REQUEST: {
    key: "EXPENSE_REQUEST",
    label: "Expense Claim — Approver",
    description: "Sent to the approver when a staff member submits an expense claim. Contains Accept / Decline buttons.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Requesting employee" },
      { name: "CATEGORY", description: "Expense category" },
      { name: "AMOUNT", description: "Amount with currency" },
      { name: "EXPENSE_DATE", description: "Date the expense was incurred" },
      { name: "DESCRIPTION", description: "Description / notes" },
      { name: "ACCEPT_URL", description: "Approve link (single-use)" },
      { name: "DECLINE_URL", description: "Reject link (single-use)" },
      { name: "ACTION_BUTTONS", description: "Placeholder — replaced with styled Accept/Decline buttons" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Expense claim from {EMPLOYEE_NAME}",
    defaultBody: `Hi,

{EMPLOYEE_NAME} has submitted an expense claim:

  Category:    {CATEGORY}
  Amount:      {AMOUNT}
  Date:        {EXPENSE_DATE}
  Description: {DESCRIPTION}

Please review and respond:

{ACTION_BUTTONS}

Or open the HR Portal: {SITE_URL}

— {COMPANY_NAME}`,
  },

  EXPENSE_APPROVED: {
    key: "EXPENSE_APPROVED",
    label: "Expense Approved — Requester",
    description: "Sent to the staff member after the approver clicks Accept.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Requesting employee" },
      { name: "CATEGORY", description: "Expense category" },
      { name: "AMOUNT", description: "Amount with currency" },
      { name: "APPROVER_NAME", description: "Who approved" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Your expense claim was approved",
    defaultBody: `Hi {EMPLOYEE_NAME},

Your {CATEGORY} expense claim for {AMOUNT} has been approved by {APPROVER_NAME}. Finance will process the payout shortly.

— {COMPANY_NAME}`,
  },

  EXPENSE_REJECTED: {
    key: "EXPENSE_REJECTED",
    label: "Expense Rejected — Requester",
    description: "Sent to the staff member after the approver clicks Decline.",
    variables: [
      { name: "EMPLOYEE_NAME", description: "Requesting employee" },
      { name: "CATEGORY", description: "Expense category" },
      { name: "AMOUNT", description: "Amount with currency" },
      { name: "APPROVER_NAME", description: "Who declined" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Your expense claim was not approved",
    defaultBody: `Hi {EMPLOYEE_NAME},

Your {CATEGORY} expense claim for {AMOUNT} was not approved by {APPROVER_NAME}.

Please contact your manager if you have questions.

— {COMPANY_NAME}`,
  },

  PASSWORD_RESET: {
    key: "PASSWORD_RESET",
    label: "Password Reset Email",
    description: "Sent when a user requests a password reset link.",
    variables: [
      { name: "RESET_URL", description: "Single-use password reset link" },
      { name: "EXPIRY_MINUTES", description: "How long the link is valid for" },
      ...COMMON_VARS,
    ],
    defaultSubject: "Reset your {COMPANY_SHORT_NAME} HR Portal password",
    defaultBody: `Hi,

We received a request to reset your password.

Click the link below to set a new one. The link expires in {EXPIRY_MINUTES} minutes.

{RESET_URL}

If you didn't request this, you can safely ignore this email.

— {COMPANY_NAME}`,
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function getTemplateDef(key: string): TemplateDef | null {
  return (TEMPLATES as Record<string, TemplateDef>)[key] ?? null;
}
