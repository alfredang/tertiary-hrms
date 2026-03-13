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
import { Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Employee,
  SalaryInfo,
  Department,
  LeaveBalance,
  LeaveType,
  EmployeeStatus,
} from "@prisma/client";

interface EmployeeEditSheetProps {
  employee: Employee & {
    salaryInfo: SalaryInfo | null;
    department: Department | null;
    leaveBalances: (LeaveBalance & { leaveType: LeaveType })[];
  };
  departments: Department[];
}

export function EmployeeEditSheet({
  employee,
  departments,
}: EmployeeEditSheetProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
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
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update");
      }

      toast({
        title: "Employee updated",
        description: "Employee information has been updated successfully.",
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
    <Sheet open={open} onOpenChange={setOpen}>
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
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="salary">Salary</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="mt-6">
                <PersonalInfoForm form={form} />
              </TabsContent>

              <TabsContent value="employment" className="mt-6">
                <EmploymentInfoForm form={form} departments={departments} />
              </TabsContent>

              <TabsContent value="salary" className="mt-6">
                <SalaryInfoForm form={form} />
              </TabsContent>

              <TabsContent value="status" className="mt-6">
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
