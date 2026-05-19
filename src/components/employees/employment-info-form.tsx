"use client";

import { UseFormReturn } from "react-hook-form";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { computeYearlyEntitlement } from "@/lib/utils";
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
  intent?: "STAFF" | "INTERN";
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
  intent = "STAFF",
}: EmploymentInfoFormProps) {
  const isIntern = intent === "INTERN";
  const errors = form.formState.errors.employmentInfo as Record<string, any> | undefined;

  // Use a single watch call to reduce re-renders
  const [startDate, endDate, employmentType] = form.watch([
    "employmentInfo.startDate",
    "employmentInfo.endDate",
    "employmentInfo.employmentType",
  ]);

  const isPermanent = employmentType === "FULL_TIME" && !endDate;

  // Estimate total AL days across the full contract span
  const estimatedContractTotal = (() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;

    let total = 0;
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    for (let yr = startYear; yr <= endYear; yr++) {
      const entitlement = computeYearlyEntitlement(start, yr); // seniority-based days/yr
      const periodStart = yr === startYear ? start : new Date(yr, 0, 1);
      const periodEnd = yr === endYear ? end : new Date(yr, 11, 31);
      const daysInYear = yr % 4 === 0 ? 366 : 365;
      const daysWorked = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
      total += entitlement * (daysWorked / daysInYear);
    }
    return Math.round(total * 10) / 10;
  })();

  // Contract months: count months where employee works most of the month
  const contractMonths = (() => {
    if (!startDate) return null;
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return null;
    if (!endDate) return null;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return null;
    const raw = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    // Subtract start month if started in second half (< 16 days of that month)
    const startedLate = start.getDate() > 15;
    // Add end month only if employee works at least half of it
    const endedLate = end.getDate() >= 15;
    const months = raw + (startedLate ? 0 : 1) - (endedLate ? 0 : 1);
    return Math.max(1, months);
  })();

  // FT: always 12. Non-FT with >= 6 month contract: days = contract months (capped at 12). Under 6: manual.
  const autoLeave =
    employmentType === "FULL_TIME"
      ? 12
      : contractMonths !== null && contractMonths >= 6
      ? Math.min(contractMonths, 12)
      : null;

  const leaveIsAutoSet = autoLeave !== null;

  useEffect(() => {
    if (autoLeave !== null) {
      form.setValue("employmentInfo.monthlyLeaveRate", autoLeave, { shouldDirty: true });
    }
  }, [autoLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Department — staff only */}
      {!isIntern && (
        <div className="space-y-2">
          <Label htmlFor="departmentId" className="text-gray-300">
            Department
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
      )}

      {/* Position — staff only */}
      {!isIntern && (
        <div className="space-y-2">
          <Label htmlFor="position" className="text-gray-300">
            Position
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
      )}

      {/* Employment Type */}
      <div className="space-y-2">
        <Label htmlFor="employmentType" className="text-gray-300">
          Employment Type
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
            Start Date
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

      {/* Annual Leave Days */}
      <div className="space-y-2">
        <Label htmlFor="monthlyLeaveRate" className="text-gray-300">
          Leave Days Per Working Year
        </Label>
        <Input
          id="monthlyLeaveRate"
          type="number"
          step="1"
          min="0"
          max="365"
          placeholder={contractMonths !== null && contractMonths < 6 ? "Enter leave days (e.g. 3)" : "Auto-calculated"}
          value={form.watch("employmentInfo.monthlyLeaveRate") ?? ""}
          readOnly={leaveIsAutoSet}
          onChange={(e) => {
            if (leaveIsAutoSet) return;
            const val = e.target.value;
            form.setValue(
              "employmentInfo.monthlyLeaveRate",
              val === "" ? null : parseFloat(val),
            );
          }}
          className={`bg-gray-900 border-gray-800 text-white ${leaveIsAutoSet ? "opacity-60 cursor-not-allowed" : ""}`}
        />
        {leaveIsAutoSet && (
          <div className="space-y-1">
            {employmentType === "FULL_TIME" || (contractMonths !== null && contractMonths >= 12) ? (
              <>
                <p className="text-xs text-gray-500">
                  <span className="text-gray-300 font-medium">12 days/year</span> (base rate, accrues monthly).
                  {" "}Earns <span className="text-gray-300">+1 day/year</span> upon completing each year of service, up to a max of <span className="text-gray-300">14 days/year</span>.
                </p>
                {estimatedContractTotal !== null && contractMonths !== null && contractMonths >= 12 && (
                  <p className="text-xs text-blue-400">
                    Estimated total over this {contractMonths}-month contract: ~{estimatedContractTotal} days
                    {contractMonths > 12 && " (includes seniority progression across years)"}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  Short contract: <span className="text-gray-300 font-medium">{autoLeave} days total</span> for this {contractMonths}-month contract (1 day per working month).
                </p>
              </>
            )}
          </div>
        )}
        {!leaveIsAutoSet && (
          <p className="text-xs text-gray-500">Contract under 6 months — enter the total leave days to grant.</p>
        )}
      </div>

    </div>
  );
}
