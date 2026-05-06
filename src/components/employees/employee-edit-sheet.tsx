"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PersonalInfoForm } from "./personal-info-form";
import { EmploymentInfoForm } from "./employment-info-form";
import { SalaryInfoForm } from "./salary-info-form";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { Edit, KeyRound, ShieldCheck, Calculator, User, GraduationCap, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Employee,
  SalaryInfo,
  Department,
  LeaveBalance,
  LeaveType,
  EmployeeStatus,
} from "@prisma/client";

const ROLE_OPTIONS = [
  { value: "ADMIN",      label: "Admin",      description: "Full access to all features",          icon: ShieldCheck, color: "border-purple-600 bg-purple-950/30", dot: "bg-purple-500" },
  { value: "ACCOUNTANT", label: "Accountant", description: "Access to expenses and payroll",        icon: Calculator,  color: "border-blue-600 bg-blue-950/30",   dot: "bg-blue-500"   },
  { value: "STAFF",      label: "Staff",      description: "Standard employee access",              icon: User,        color: "border-green-600 bg-green-950/30", dot: "bg-green-500"  },
  { value: "INTERN",     label: "Intern",     description: "Same access as staff",                  icon: GraduationCap, color: "border-amber-600 bg-amber-950/30", dot: "bg-amber-500" },
] as const;

interface EmployeeEditSheetProps {
  employee: Employee & {
    salaryInfo: SalaryInfo | null;
    department: Department | null;
    leaveBalances: (LeaveBalance & { leaveType: LeaveType })[];
  };
  departments: Department[];
  userRoles?: string[];
}

export function EmployeeEditSheet({
  employee,
  departments,
  userRoles = ["STAFF"],
}: EmployeeEditSheetProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(userRoles);

  const toggleRole = (value: string) => {
    setSelectedRoles((prev) =>
      prev.includes(value)
        ? prev.length === 1 ? prev : prev.filter((r) => r !== value) // keep at least one
        : [...prev, value]
    );
  };
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: {
      personalInfo: {
        fullName: employee.name,
        email: employee.email,
        phone: employee.phone || "",
        dateOfBirth: employee.dateOfBirth?.toISOString().split("T")[0] ?? "",
        gender: employee.gender,
        nationality: employee.nationality,
        nric: employee.nric || "",
        address: employee.address || "",
        educationLevel: employee.educationLevel,
      },
      employmentInfo: {
        departmentId: employee.departmentId ?? "",
        position: employee.position ?? "",
        employmentType: employee.employmentType,
        startDate: employee.startDate?.toISOString().split("T")[0] ?? "",
        endDate: employee.endDate?.toISOString().split("T")[0] || "",
        status: employee.status,
      },
      salaryInfo: employee.salaryInfo
        ? {
            basicSalary: Number(employee.salaryInfo.basicSalary),
            allowances: Number(employee.salaryInfo.allowances),
            bankName: employee.salaryInfo.bankName || "",
            bankAccountNumber: employee.salaryInfo.bankAccountNumber || "",
            payNow: employee.salaryInfo.payNow || employee.phone || "",
            cpfApplicable: employee.salaryInfo.cpfApplicable,
            cpfEmployeeRate: Number(employee.salaryInfo.cpfEmployeeRate),
            cpfEmployerRate: Number(employee.salaryInfo.cpfEmployerRate),
          }
        : {
            basicSalary: 0,
            allowances: 0,
            bankName: "",
            bankAccountNumber: "",
            payNow: employee.phone || "",
            cpfApplicable: true,
            cpfEmployeeRate: 20.0,
            cpfEmployerRate: 17.0,
          },
    },
  });

  const onSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, roles: selectedRoles }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update");
      }

      toast({
        title: "Employee updated",
        description: `Saved successfully. Roles: ${selectedRoles.map(r => r.charAt(0) + r.slice(1).toLowerCase()).join(", ")}.`,
      });

      setOpen(false);
      router.refresh(); // Refresh server component data
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update employee",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSingpassInvite = async () => {
    setIsInviting(true);
    try {
      const res = await fetch("/api/myinfo/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      toast({ title: "Singpass invite sent", description: `An email has been sent to ${employee.email}.` });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invite",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm(`Reset ${employee.name}'s password to default?`)) return;

    setIsResetting(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/reset-password`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset password");
      }

      toast({
        title: "Password reset",
        description: `${employee.name}'s password has been reset to default.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const renderStatusOptions = () => [
    {
      value: "ACTIVE",
      label: "Active",
      description: "Employee is currently working",
      dotColor: "bg-green-500",
      borderColor: "border-green-600",
      bgColor: "bg-green-950/30",
    },
    {
      value: "ON_LEAVE",
      label: "On Leave",
      description: "Employee is on extended leave",
      dotColor: "bg-yellow-500",
      borderColor: "border-yellow-600",
      bgColor: "bg-yellow-950/30",
    },
    {
      value: "INACTIVE",
      label: "Inactive",
      description: "Account disabled — blocks login",
      dotColor: "bg-gray-500",
      borderColor: "border-gray-600",
      bgColor: "bg-gray-800/50",
    },
    {
      value: "RESIGNED",
      label: "Resigned",
      description: "Employee has voluntarily left — blocks login",
      dotColor: "bg-blue-500",
      borderColor: "border-blue-600",
      bgColor: "bg-blue-950/30",
    },
    {
      value: "TERMINATED",
      label: "Terminated",
      description: "Employment has been ended — blocks login",
      dotColor: "bg-red-500",
      borderColor: "border-red-600",
      bgColor: "bg-red-950/30",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedRoles(userRoles); }}>
      <SheetTrigger asChild>
        <Button>
          <Edit className="h-4 w-4 mr-2" />
          Edit Employee
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl bg-gray-950 border-gray-800 overflow-y-auto"
      >
        <div className="space-y-6 px-5 pt-4 pb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Edit Employee</h2>
            <p className="text-gray-400 mt-1">
              Update {employee.name}&apos;s information
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 bg-gray-900">
                <TabsTrigger value="personal" className="text-xs sm:text-sm px-1 sm:px-3">Personal</TabsTrigger>
                <TabsTrigger value="employment" className="text-xs sm:text-sm px-1 sm:px-3">Employ</TabsTrigger>
                <TabsTrigger value="salary" className="text-xs sm:text-sm px-1 sm:px-3">Salary</TabsTrigger>
                <TabsTrigger value="status" className="text-xs sm:text-sm px-1 sm:px-3">Status</TabsTrigger>
              </TabsList>

              <TabsContent forceMount value="personal" className={cn("mt-6", activeTab !== "personal" && "hidden")}>
                {/* Singpass auto-fill invite */}
                <div className="mb-5 p-4 rounded-xl border border-gray-800 bg-gray-900/50 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-300">Auto-fill via Singpass</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Send {employee.name.split(" ")[0]} an email to authorise Singpass — their details will fill automatically.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSingpassInvite}
                    disabled={isInviting}
                    className="shrink-0 border-red-700 text-red-400 hover:bg-red-950/30"
                  >
                    <Fingerprint className="h-4 w-4 mr-2" />
                    {isInviting ? "Sending…" : "Send Invite"}
                  </Button>
                </div>
                <PersonalInfoForm form={form} />
              </TabsContent>

              <TabsContent forceMount value="employment" className={cn("mt-6", activeTab !== "employment" && "hidden")}>
                <EmploymentInfoForm form={form} departments={departments} />
              </TabsContent>

              <TabsContent forceMount value="salary" className={cn("mt-6", activeTab !== "salary" && "hidden")}>
                <SalaryInfoForm form={form} />
              </TabsContent>

              <TabsContent forceMount value="status" className={cn("mt-6", activeTab !== "status" && "hidden")}>
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Set the current employment status for {employee.name}.
                  </p>
                  <div className="space-y-3">
                    {renderStatusOptions().map((opt) => {
                      const isSelected = form.watch("employmentInfo.status") === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => form.setValue("employmentInfo.status", opt.value as EmployeeStatus)}
                          className={cn(
                            "w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors",
                            isSelected
                              ? `${opt.borderColor} ${opt.bgColor}`
                              : "border-gray-800 bg-gray-900/50 hover:bg-gray-900"
                          )}
                        >
                          <div className={cn(
                            "w-3 h-3 rounded-full shrink-0",
                            opt.dotColor
                          )} />
                          <div>
                            <p className={cn("font-medium", isSelected ? "text-white" : "text-gray-300")}>
                              {opt.label}
                            </p>
                            <p className="text-sm text-gray-500">{opt.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Role Assignment */}
                  <div className="border-t border-gray-800 pt-4 mt-6 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-300">System Roles</p>
                      <p className="text-xs text-gray-500 mt-0.5">Select all roles that apply. At least one is required.</p>
                    </div>
                    <div className="space-y-2">
                      {ROLE_OPTIONS.map(({ value, label, description, icon: Icon, color, dot }) => {
                        const isSelected = selectedRoles.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleRole(value)}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                              isSelected ? color : "border-gray-800 bg-gray-900/50 hover:bg-gray-900"
                            )}
                          >
                            {/* Checkbox indicator */}
                            <div className={cn(
                              "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center",
                              isSelected ? "border-white bg-white" : "border-gray-600"
                            )}>
                              {isSelected && (
                                <svg className="w-2.5 h-2.5 text-gray-900" fill="currentColor" viewBox="0 0 12 12">
                                  <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                </svg>
                              )}
                            </div>
                            <div className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
                            <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                            <div className="flex-1">
                              <p className={cn("text-sm font-medium", isSelected ? "text-white" : "text-gray-300")}>{label}</p>
                              <p className="text-xs text-gray-500">{description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedRoles.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Selected: {selectedRoles.map(r => r.charAt(0) + r.slice(1).toLowerCase()).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Reset Password */}
                  <div className="border-t border-gray-800 pt-4 mt-6">
                    <p className="text-sm text-gray-400 mb-3">
                      Reset this employee&apos;s password to the default.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetPassword}
                      disabled={isResetting}
                      className="border-amber-600 text-amber-400 hover:bg-amber-950/30"
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      {isResetting ? "Resetting..." : "Reset Password"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="border-t border-gray-800 mt-8 pt-5 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
