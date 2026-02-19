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
import type {
  Employee,
  SalaryInfo,
  Department,
  LeaveBalance,
  LeaveType,
} from "@prisma/client";

interface EmployeeEditSheetProps {
  employee: Employee & {
    salaryInfo: SalaryInfo | null;
    department: Department;
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
        fullName: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        phone: employee.phone || "",
        dateOfBirth: employee.dateOfBirth.toISOString().split("T")[0],
        gender: employee.gender,
        nationality: employee.nationality,
        nric: employee.nric || "",
        address: employee.address || "",
        educationLevel: employee.educationLevel,
      },
      employmentInfo: {
        departmentId: employee.departmentId,
        position: employee.position,
        employmentType: employee.employmentType,
        startDate: employee.startDate.toISOString().split("T")[0],
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
        <div className="space-y-6 pb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Edit Employee</h2>
            <p className="text-gray-400 mt-1">
              Update {employee.firstName} {employee.lastName}'s information
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 bg-gray-900">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="salary">Salary</TabsTrigger>
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
            </Tabs>

            <div className="flex gap-3 mt-6">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
