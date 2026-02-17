import { z } from "zod";
import {
  Gender,
  EducationLevel,
  EmploymentType,
  EmployeeStatus,
} from "@prisma/client";

export const personalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
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
});

export const salaryInfoSchema = z.object({
  basicSalary: z.number().positive("Salary must be positive"),
  allowances: z.number().min(0, "Allowances cannot be negative"),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
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

export const updateEmployeeSchema = z
  .object({
    personalInfo: personalInfoSchema.partial().optional(),
    employmentInfo: employmentInfoSchema.partial().optional(),
    salaryInfo: salaryInfoSchema.partial().optional(),
  })
  .refine(
    (data) => data.personalInfo || data.employmentInfo || data.salaryInfo,
    { message: "At least one section must be provided" }
  );

export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type EmploymentInfoInput = z.infer<typeof employmentInfoSchema>;
export type SalaryInfoInput = z.infer<typeof salaryInfoSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
