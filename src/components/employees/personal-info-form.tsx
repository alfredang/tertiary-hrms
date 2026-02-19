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
import { Gender, EducationLevel } from "@prisma/client";

interface PersonalInfoFormProps {
  form: UseFormReturn<any>;
}

const genderOptions = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const educationOptions = [
  { value: "DIPLOMA", label: "Diploma" },
  { value: "DEGREE", label: "Degree" },
  { value: "MASTER", label: "Master's" },
  { value: "PHD", label: "PhD" },
];

export function PersonalInfoForm({ form }: PersonalInfoFormProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors = form.formState.errors.personalInfo as Record<string, any> | undefined;
  return (
    <div className="space-y-4">
      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-gray-300">
          Full Name *
        </Label>
        <Input
          id="fullName"
          {...form.register("personalInfo.fullName")}
          className="bg-gray-900 border-gray-800 text-white"
          placeholder="e.g. Alfred Ang"
        />
        {(errors?.fullName ||
          errors?.firstName ||
          errors?.lastName) && (
          <p className="text-sm text-red-400">
            {(errors?.fullName?.message ||
              errors?.firstName?.message ||
              errors?.lastName?.message) as string}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-300">
          Email *
        </Label>
        <Input
          id="email"
          type="email"
          {...form.register("personalInfo.email")}
          className="bg-gray-900 border-gray-800 text-white"
        />
        {errors?.email && (
          <p className="text-sm text-red-400">
            {errors?.email.message as string}
          </p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-gray-300">
          Phone
        </Label>
        <Input
          id="phone"
          {...form.register("personalInfo.phone")}
          className="bg-gray-900 border-gray-800 text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Date of Birth */}
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth" className="text-gray-300">
            Date of Birth *
          </Label>
          <Input
            id="dateOfBirth"
            type="date"
            {...form.register("personalInfo.dateOfBirth")}
            className="bg-gray-900 border-gray-800 text-white"
          />
          {errors?.dateOfBirth && (
            <p className="text-sm text-red-400">
              {errors?.dateOfBirth.message as string}
            </p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender" className="text-gray-300">
            Gender *
          </Label>
          <Select
            value={form.watch("personalInfo.gender")}
            onValueChange={(value) =>
              form.setValue("personalInfo.gender", value as Gender)
            }
          >
            <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {genderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nationality */}
        <div className="space-y-2">
          <Label htmlFor="nationality" className="text-gray-300">
            Nationality *
          </Label>
          <Input
            id="nationality"
            {...form.register("personalInfo.nationality")}
            className="bg-gray-900 border-gray-800 text-white"
          />
          {errors?.nationality && (
            <p className="text-sm text-red-400">
              {errors?.nationality.message as string}
            </p>
          )}
        </div>

        {/* NRIC */}
        <div className="space-y-2">
          <Label htmlFor="nric" className="text-gray-300">
            NRIC
          </Label>
          <Input
            id="nric"
            {...form.register("personalInfo.nric")}
            className="bg-gray-900 border-gray-800 text-white"
          />
        </div>
      </div>

      {/* Education Level */}
      <div className="space-y-2">
        <Label htmlFor="educationLevel" className="text-gray-300">
          Education Level *
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
            {educationOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address" className="text-gray-300">
          Address
        </Label>
        <Input
          id="address"
          {...form.register("personalInfo.address")}
          className="bg-gray-900 border-gray-800 text-white"
        />
      </div>
    </div>
  );
}
