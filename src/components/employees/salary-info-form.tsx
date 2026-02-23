"use client";

import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SalaryInfoFormProps {
  form: UseFormReturn<any>;
}

export function SalaryInfoForm({ form }: SalaryInfoFormProps) {
  const formErrors = form.formState.errors.salaryInfo as Record<string, any> | undefined;
  const cpfApplicable = form.watch("salaryInfo.cpfApplicable");
  const basicSalary = form.watch("salaryInfo.basicSalary") || 0;
  const cpfEmployeeRate = form.watch("salaryInfo.cpfEmployeeRate") || 0;
  const cpfEmployerRate = form.watch("salaryInfo.cpfEmployerRate") || 0;

  // Calculate CPF amounts
  const employeeCPF = (basicSalary * cpfEmployeeRate) / 100;
  const employerCPF = (basicSalary * cpfEmployerRate) / 100;

  return (
    <div className="space-y-4">
      {/* Basic Salary */}
      <div className="space-y-2">
        <Label htmlFor="basicSalary" className="text-gray-300">
          Basic Salary (Monthly) *
        </Label>
        <Input
          id="basicSalary"
          type="number"
          step="0.01"
          {...form.register("salaryInfo.basicSalary", {
            valueAsNumber: true,
          })}
          className="bg-gray-900 border-gray-800 text-white"
        />
        {formErrors?.basicSalary && (
          <p className="text-sm text-red-400">
            {formErrors?.basicSalary.message as string}
          </p>
        )}
      </div>

      {/* Allowances */}
      <div className="space-y-2">
        <Label htmlFor="allowances" className="text-gray-300">
          Allowances (Monthly)
        </Label>
        <Input
          id="allowances"
          type="number"
          step="0.01"
          {...form.register("salaryInfo.allowances", {
            valueAsNumber: true,
          })}
          className="bg-gray-900 border-gray-800 text-white"
        />
        {formErrors?.allowances && (
          <p className="text-sm text-red-400">
            {formErrors?.allowances.message as string}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Name */}
        <div className="space-y-2">
          <Label htmlFor="bankName" className="text-gray-300">
            Bank Name
          </Label>
          <Input
            id="bankName"
            {...form.register("salaryInfo.bankName")}
            className="bg-gray-900 border-gray-800 text-white"
          />
        </div>

        {/* Bank Account Number */}
        <div className="space-y-2">
          <Label htmlFor="bankAccountNumber" className="text-gray-300">
            Bank Account Number
          </Label>
          <Input
            id="bankAccountNumber"
            {...form.register("salaryInfo.bankAccountNumber")}
            className="bg-gray-900 border-gray-800 text-white"
          />
        </div>
      </div>

      {/* PayNow */}
      <div className="space-y-2">
        <Label htmlFor="payNow" className="text-gray-300">
          PayNow (Phone/NRIC/UEN)
        </Label>
        <Input
          id="payNow"
          {...form.register("salaryInfo.payNow")}
          className="bg-gray-900 border-gray-800 text-white"
          placeholder="e.g. +65 9123 4567"
        />
      </div>

      {/* CPF Applicable */}
      <div className="space-y-2">
        <Label htmlFor="cpfApplicable" className="text-gray-300">
          CPF Applicable *
        </Label>
        <Select
          value={form.watch("salaryInfo.cpfApplicable")?.toString() || "true"}
          onValueChange={(value) =>
            form.setValue("salaryInfo.cpfApplicable", value === "true")
          }
        >
          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
            <SelectValue placeholder="Select CPF status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cpfApplicable && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CPF Employee Rate */}
          <div className="space-y-2">
            <Label htmlFor="cpfEmployeeRate" className="text-gray-300">
              CPF Employee Rate (%) *
            </Label>
            <Input
              id="cpfEmployeeRate"
              type="number"
              step="0.01"
              {...form.register("salaryInfo.cpfEmployeeRate", {
                valueAsNumber: true,
              })}
              className="bg-gray-900 border-gray-800 text-white"
            />
            {basicSalary > 0 && cpfEmployeeRate > 0 && (
              <p className="text-sm text-gray-400">
                = ${employeeCPF.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                per month
              </p>
            )}
            {formErrors?.cpfEmployeeRate && (
              <p className="text-sm text-red-400">
                {formErrors?.cpfEmployeeRate.message as string}
              </p>
            )}
          </div>

          {/* CPF Employer Rate */}
          <div className="space-y-2">
            <Label htmlFor="cpfEmployerRate" className="text-gray-300">
              CPF Employer Rate (%) *
            </Label>
            <Input
              id="cpfEmployerRate"
              type="number"
              step="0.01"
              {...form.register("salaryInfo.cpfEmployerRate", {
                valueAsNumber: true,
              })}
              className="bg-gray-900 border-gray-800 text-white"
            />
            {basicSalary > 0 && cpfEmployerRate > 0 && (
              <p className="text-sm text-gray-400">
                = ${employerCPF.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                per month
              </p>
            )}
            {formErrors?.cpfEmployerRate && (
              <p className="text-sm text-red-400">
                {formErrors?.cpfEmployerRate.message as string}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
        <p className="text-sm text-gray-400">
          <strong className="text-gray-300">Note:</strong> Changes to salary
          information will take effect immediately. Ensure all details are
          accurate before saving.
        </p>
      </div>
    </div>
  );
}
