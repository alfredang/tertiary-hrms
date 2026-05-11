import { z } from "zod";
import {
  Gender,
  EducationLevel,
  EmploymentType,
  EmployeeStatus,
} from "@prisma/client";

export const personalInfoSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid date",
  }),
  gender: z.nativeEnum(Gender),
  nationality: z.string().min(1, "Nationality is required"),
  nric: z.string().optional(),
  address: z.string().optional(),
  educationLevel: z.nativeEnum(EducationLevel),
  avatarUrl: z.string().optional().nullable(),
});

export const employmentInfoSchema = z.object({
  departmentId: z.string().min(1, "Department is required"),
  position: z.string().min(1, "Position is required"),
  employmentType: z.nativeEnum(EmploymentType),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Invalid start date",
  }),
  endDate: z
    .string()
    .optional()
    .nullable()
    .refine(
      (date) => !date || !isNaN(Date.parse(date)),
      { message: "Invalid end date" }
    ),
  status: z.nativeEnum(EmployeeStatus),
  monthlyLeaveRate: z.number().min(0).max(30).optional().nullable(),
});

export const salaryInfoSchema = z.object({
  basicSalary: z.number().min(0, "Salary cannot be negative"),
  allowances: z.number().min(0, "Allowances cannot be negative"),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  payNow: z.string().optional(),
  cpfApplicable: z.boolean(),
  cpfEmployeeRate: z
    .number()
    .min(0, "CPF rate must be between 0 and 100")
    .max(100, "CPF rate must be between 0 and 100"),
  cpfEmployerRate: z
    .number()
    .min(0, "CPF rate must be between 0 and 100")
    .max(100, "CPF rate must be between 0 and 100"),
});

// Converts empty strings and sentinel zeros → undefined before validating partial
// sections, so forceMount'd form fields with blank/default values don't block submission.
function lenientSection<T extends z.ZodTypeAny>(schema: T, stripZeroKeys: string[] = []) {
  return z.preprocess((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([k, v]) => {
        if (v === "") return [k, undefined];
        if (stripZeroKeys.includes(k) && v === 0) return [k, undefined];
        return [k, v];
      })
    );
  }, schema);
}

export const updateEmployeeSchema = z
  .object({
    personalInfo:   lenientSection(personalInfoSchema.partial()).optional(),
    employmentInfo: lenientSection(employmentInfoSchema.partial()).optional(),
    salaryInfo:     lenientSection(salaryInfoSchema.partial(), ["basicSalary", "allowances", "cpfEmployeeRate", "cpfEmployerRate"]).optional(),
    roles: z.enum(["STAFF", "INTERN", "ACCOUNTANT", "MANAGER", "HR", "ADMIN"]).array().min(1, "At least one role is required").optional(),
  })
  .refine(
    (data) => data.personalInfo || data.employmentInfo || data.salaryInfo || data.roles,
    { message: "At least one section must be provided" }
  );

// Relaxed schemas for step-by-step creation (only name + email required)
export const createPersonalInfoSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  dateOfBirth: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), {
      message: "Invalid date",
    }),
  gender: z.nativeEnum(Gender).optional(),
  nationality: z.string().optional(),
  nric: z.string().optional(),
  address: z.string().optional(),
  educationLevel: z.nativeEnum(EducationLevel).optional(),
});

export const createEmploymentInfoSchema = z.object({
  departmentId: z.string().optional(),
  position: z.string().optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  startDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), {
      message: "Invalid start date",
    }),
  endDate: z
    .string()
    .optional()
    .nullable()
    .refine((date) => !date || !isNaN(Date.parse(date)), {
      message: "Invalid end date",
    }),
  status: z.nativeEnum(EmployeeStatus).optional(),
  monthlyLeaveRate: z.number().min(0).max(30).optional().nullable(),
});

export const createSalaryInfoSchema = z.object({
  basicSalary: z.number().min(0).optional(),
  allowances: z.number().min(0).optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  payNow: z.string().optional(),
  cpfApplicable: z.boolean().optional(),
  cpfEmployeeRate: z
    .number()
    .min(0, "CPF rate must be between 0 and 100")
    .max(100, "CPF rate must be between 0 and 100")
    .optional(),
  cpfEmployerRate: z
    .number()
    .min(0, "CPF rate must be between 0 and 100")
    .max(100, "CPF rate must be between 0 and 100")
    .optional(),
});

export const createEmployeeSchema = z.object({
  personalInfo: createPersonalInfoSchema,
  employmentInfo: createEmploymentInfoSchema.optional(),
  salaryInfo: createSalaryInfoSchema.optional(),
});

export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type EmploymentInfoInput = z.infer<typeof employmentInfoSchema>;
export type SalaryInfoInput = z.infer<typeof salaryInfoSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
