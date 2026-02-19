export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "Tertiary Infotech";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const ROLES = {
  STAFF: "STAFF",
  MANAGER: "MANAGER",
  HR: "HR",
  ADMIN: "ADMIN",
} as const;

export const EMPLOYEE_STATUS = {
  ACTIVE: "ACTIVE",
  ON_LEAVE: "ON_LEAVE",
  TERMINATED: "TERMINATED",
  RESIGNED: "RESIGNED",
} as const;

export const LEAVE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const EXPENSE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
} as const;

export const PAYSLIP_STATUS = {
  DRAFT: "DRAFT",
  GENERATED: "GENERATED",
  PAID: "PAID",
} as const;

export const EVENT_TYPES = {
  HOLIDAY: "HOLIDAY",
  MEETING: "MEETING",
  TRAINING: "TRAINING",
  COMPANY_EVENT: "COMPANY_EVENT",
  LEAVE: "LEAVE",
} as const;

export const EVENT_COLORS: Record<string, string> = {
  HOLIDAY: "#ef4444",      // Red
  MEETING: "#3b82f6",      // Blue
  TRAINING: "#a855f7",     // Purple
  COMPANY_EVENT: "#22c55e", // Green
  LEAVE: "#f59e0b",        // Amber
};

export const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  active: "bg-green-100 text-green-800 border-green-200",
  on_leave: "bg-amber-100 text-amber-800 border-amber-200",
  submitted: "bg-blue-100 text-blue-800 border-blue-200",
  processed: "bg-purple-100 text-purple-800 border-purple-200",
};

export const DEPARTMENTS = [
  { name: "Engineering", code: "ENG" },
  { name: "Marketing", code: "MKT" },
  { name: "Human Resources", code: "HR" },
  { name: "Finance", code: "FIN" },
  { name: "Sales", code: "SALES" },
  { name: "Operations", code: "OPS" },
] as const;

export const LEAVE_TYPES = [
  { name: "Annual Leave", code: "AL", defaultDays: 14, carryOver: false },
  { name: "Sick Leave", code: "SL", defaultDays: 14, carryOver: false },
  { name: "Medical Leave", code: "MC", defaultDays: 14, carryOver: false },
  { name: "Compassionate Leave", code: "CL", defaultDays: 3, carryOver: false },
  { name: "Maternity Leave", code: "ML", defaultDays: 16 * 7, carryOver: false },
  { name: "Paternity Leave", code: "PL", defaultDays: 14, carryOver: false },
  { name: "No Pay Leave", code: "NPL", defaultDays: 0, carryOver: false },
] as const;

export const EXPENSE_CATEGORIES = [
  { name: "Client Entertainment", code: "CE" },
  { name: "Travel", code: "TRV" },
  { name: "Office Supplies", code: "OS" },
  { name: "Training", code: "TRN" },
  { name: "Software & Subscriptions", code: "SW" },
  { name: "Miscellaneous", code: "MISC" },
] as const;
