"use client";

import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gender, EducationLevel } from "@prisma/client";
import { useToast } from "@/hooks/use-toast";

interface PersonalInfoFormProps {
  form: UseFormReturn<any>;
  mode?: "create" | "edit";
}

const genderOptions = [
  { value: "MALE",   label: "Male"   },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER",  label: "Other"  },
];

const educationOptions = [
  { value: "DIPLOMA", label: "Diploma"   },
  { value: "DEGREE",  label: "Degree"    },
  { value: "MASTER",  label: "Master's"  },
  { value: "PHD",     label: "PhD"       },
];

// What Singapore NRIC encodes:
//   prefix S → citizen born before 2000  → birth year = 1900 + digits[0..1]
//   prefix T → citizen born 2000+        → birth year = 2000 + digits[0..1]
//   prefix F → PR/foreigner before 2000  → birth year = 1900 + digits[0..1] (approximate)
//   prefix G → PR/foreigner 2000+        → birth year = 2000 + digits[0..1] (approximate)
//   prefix M → foreigner from 2022       → year not standardly encoded
// Name and full DOB (month/day) are NOT encoded in NRIC.
function parseNRIC(nric: string): { birthYear?: number; nationality?: string } {
  const cleaned = nric.trim().toUpperCase();
  if (cleaned.length !== 9) return {};
  const prefix = cleaned[0];
  if (!["S", "T", "F", "G", "M"].includes(prefix)) return {};
  if (!/^\d{7}$/.test(cleaned.slice(1, 8))) return {};
  if (!/[A-Z]/.test(cleaned[8])) return {};

  const yy = parseInt(cleaned.slice(1, 3), 10);

  let birthYear: number | undefined;
  if (prefix === "S" || prefix === "F") birthYear = 1900 + yy;
  else if (prefix === "T" || prefix === "G") birthYear = 2000 + yy;
  // M prefix omitted — encoding differs

  const nationality = prefix === "S" || prefix === "T" ? "Singaporean" : undefined;

  return { birthYear, nationality };
}

export function PersonalInfoForm({ form, mode = "edit" }: PersonalInfoFormProps) {
  const errors = form.formState.errors.personalInfo as Record<string, any> | undefined;
  const { toast } = useToast();

  const handleNRICBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const nric = e.target.value.trim();
    if (!nric) return;

    // 1 — Try DB lookup first (finds former employees / existing records)
    try {
      const res = await fetch(`/api/employees/lookup-nric?nric=${encodeURIComponent(nric)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.found) {
          const d = json.data;
          const fields: Array<[string, unknown]> = [
            ["personalInfo.fullName",       d.fullName],
            ["personalInfo.phone",          d.phone],
            ["personalInfo.dateOfBirth",    d.dateOfBirth],
            ["personalInfo.gender",         d.gender],
            ["personalInfo.nationality",    d.nationality],
            ["personalInfo.address",        d.address],
            ["personalInfo.educationLevel", d.educationLevel],
          ];
          for (const [key, value] of fields) {
            if (value) form.setValue(key as any, value, { shouldDirty: true });
          }
          toast({
            title: "Record found",
            description: `Details pre-filled from ${d.fullName}'s existing employee record.`,
          });
          return; // DB lookup succeeded — skip NRIC parsing
        }
      }
    } catch {
      // Network error — fall through to NRIC parsing
    }

    // 2 — Fallback: derive birth year + nationality from NRIC format
    const { birthYear, nationality } = parseNRIC(nric);
    if (nationality && !form.getValues("personalInfo.nationality")) {
      form.setValue("personalInfo.nationality", nationality, { shouldDirty: true });
    }
    if (birthYear && !form.getValues("personalInfo.dateOfBirth")) {
      // Only the year is known — set Jan 1 as a placeholder; HR corrects month/day
      form.setValue("personalInfo.dateOfBirth", `${birthYear}-01-01`, { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-4">
      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-gray-300">
          Full Name <span className="text-red-400">*</span>
        </Label>
        <Input
          id="fullName"
          {...form.register("personalInfo.fullName")}
          className="bg-gray-900 border-gray-800 text-white"
          placeholder="e.g. John Tan"
        />
        {errors?.fullName && (
          <p className="text-sm text-red-400">{errors?.fullName?.message as string}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-300">
          Email <span className="text-red-400">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          {...form.register("personalInfo.email")}
          className="bg-gray-900 border-gray-800 text-white"
          placeholder="e.g. name@tertiaryinfotech.com"
        />
        {errors?.email && (
          <p className="text-sm text-red-400">{errors?.email.message as string}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-gray-300">Phone</Label>
        <Input
          id="phone"
          {...form.register("personalInfo.phone")}
          className="bg-gray-900 border-gray-800 text-white"
        />
      </div>

      {/* NRIC — placed before DOB/nationality so auto-fill is visible immediately */}
      <div className="space-y-2">
        <Label htmlFor="nric" className="text-gray-300">
          NRIC
          <span className="ml-2 text-xs text-gray-500 font-normal">
            — entering this auto-fills birth year and nationality
          </span>
        </Label>
        <Input
          id="nric"
          {...form.register("personalInfo.nric")}
          onBlur={handleNRICBlur}
          className="bg-gray-900 border-gray-800 text-white"
          placeholder="e.g. S1234567D"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-end">
        {/* Date of Birth */}
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth" className="text-gray-300 block">
            <span>Date of Birth</span>
            <span className="block text-xs text-gray-500 font-normal">(year from NRIC, correct day/month)</span>
          </Label>
          <DatePicker
            id="dateOfBirth"
            value={form.watch("personalInfo.dateOfBirth") || ""}
            onChange={(val) => form.setValue("personalInfo.dateOfBirth", val)}
          />
          {errors?.dateOfBirth && (
            <p className="text-sm text-red-400">{errors?.dateOfBirth.message as string}</p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender" className="text-gray-300">
            Gender
          </Label>
          <Select
            value={form.watch("personalInfo.gender")}
            onValueChange={(value) => form.setValue("personalInfo.gender", value as Gender)}
          >
            <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {genderOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nationality */}
        <div className="space-y-2">
          <Label htmlFor="nationality" className="text-gray-300">
            Nationality
          </Label>
          <Input
            id="nationality"
            {...form.register("personalInfo.nationality")}
            className="bg-gray-900 border-gray-800 text-white"
          />
          {errors?.nationality && (
            <p className="text-sm text-red-400">{errors?.nationality.message as string}</p>
          )}
        </div>

        {/* Education Level */}
        <div className="space-y-2">
          <Label htmlFor="educationLevel" className="text-gray-300">
            Education Level
          </Label>
          <Select
            value={form.watch("personalInfo.educationLevel")}
            onValueChange={(value) =>
              form.setValue("personalInfo.educationLevel", value as EducationLevel)
            }
          >
            <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Select education level" />
            </SelectTrigger>
            <SelectContent>
              {educationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address" className="text-gray-300">Address</Label>
        <Input
          id="address"
          {...form.register("personalInfo.address")}
          className="bg-gray-900 border-gray-800 text-white"
        />
      </div>
    </div>
  );
}
