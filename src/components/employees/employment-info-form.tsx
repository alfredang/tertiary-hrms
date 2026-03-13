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
import { EmploymentType } from "@prisma/client";
import type { Department } from "@prisma/client";

interface EmploymentInfoFormProps {
  form: UseFormReturn<any>;
  departments: Department[];
}

const employmentTypeOptions = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

export function EmploymentInfoForm({
  form,
  departments,
}: EmploymentInfoFormProps) {
  const errors = form.formState.errors.employmentInfo as Record<string, any> | undefined;
  return (
    <div className="space-y-4">
      {/* Department */}
      <div className="space-y-2">
        <Label htmlFor="departmentId" className="text-gray-300">
          Department <span className="text-red-400">*</span>
        </Label>
        <Select
          value={form.watch("employmentInfo.departmentId")}
          onValueChange={(value) =>
            form.setValue("employmentInfo.departmentId", value)
          }
        >
          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.departmentId && (
          <p className="text-sm text-red-400">
            {errors?.departmentId.message as string}
          </p>
        )}
      </div>

      {/* Position */}
      <div className="space-y-2">
        <Label htmlFor="position" className="text-gray-300">
          Position <span className="text-red-400">*</span>
        </Label>
        <Input
          id="position"
          {...form.register("employmentInfo.position")}
          className="bg-gray-900 border-gray-800 text-white"
        />
        {errors?.position && (
          <p className="text-sm text-red-400">
            {errors?.position.message as string}
          </p>
        )}
      </div>

      {/* Employment Type */}
      <div className="space-y-2">
        <Label htmlFor="employmentType" className="text-gray-300">
          Employment Type <span className="text-red-400">*</span>
        </Label>
        <Select
          value={form.watch("employmentInfo.employmentType")}
          onValueChange={(value) =>
            form.setValue("employmentInfo.employmentType", value as EmploymentType)
          }
        >
          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
            <SelectValue placeholder="Select employment type" />
          </SelectTrigger>
          <SelectContent>
            {employmentTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="space-y-2">
          <Label htmlFor="startDate" className="text-gray-300">
            Start Date <span className="text-red-400">*</span>
          </Label>
          <DatePicker
            id="startDate"
            value={form.watch("employmentInfo.startDate") || ""}
            onChange={(val) => form.setValue("employmentInfo.startDate", val)}

          />
          {errors?.startDate && (
            <p className="text-sm text-red-400">
              {errors?.startDate.message as string}
            </p>
          )}
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <Label htmlFor="endDate" className="text-gray-300">
            End Date
          </Label>
          <DatePicker
            id="endDate"
            value={form.watch("employmentInfo.endDate") || ""}
            onChange={(val) => form.setValue("employmentInfo.endDate", val)}

          />
          {errors?.endDate && (
            <p className="text-sm text-red-400">
              {errors?.endDate.message as string}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
