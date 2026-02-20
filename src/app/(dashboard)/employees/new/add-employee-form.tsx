"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PersonalInfoForm } from "@/components/employees/personal-info-form";
import { EmploymentInfoForm } from "@/components/employees/employment-info-form";
import { SalaryInfoForm } from "@/components/employees/salary-info-form";
import {
  personalInfoSchema,
  employmentInfoSchema,
  salaryInfoSchema,
} from "@/lib/validations/employee";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Department } from "@prisma/client";

const createEmployeeSchema = z.object({
  personalInfo: personalInfoSchema,
  employmentInfo: employmentInfoSchema,
  salaryInfo: salaryInfoSchema,
});

type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

interface AddEmployeeFormProps {
  departments: Department[];
}

export function AddEmployeeForm({ departments }: AddEmployeeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      personalInfo: {
        fullName: "",
        email: "",
        phone: "",
        dateOfBirth: "",
        gender: "MALE",
        nationality: "Singaporean",
        nric: "",
        address: "",
        educationLevel: "DIPLOMA",
      },
      employmentInfo: {
        departmentId: "",
        position: "",
        employmentType: "FULL_TIME",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        status: "ACTIVE",
      },
      salaryInfo: {
        basicSalary: 0,
        allowances: 0,
        bankName: "",
        bankAccountNumber: "",
        payNow: "",
        cpfApplicable: true,
        cpfEmployeeRate: 20.0,
        cpfEmployerRate: 17.0,
      },
    },
  });

  const onSubmit = async (data: CreateEmployeeInput) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create employee");
      }

      const employee = await res.json();

      toast({
        title: "Employee created",
        description: `${employee.name} has been added successfully.`,
      });

      router.push(`/employees/${employee.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create employee",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabNext = (current: string) => {
    if (current === "personal") setActiveTab("employment");
    else if (current === "employment") setActiveTab("salary");
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/employees")}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="text-white">Employee Details</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 bg-gray-900">
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="salary">Salary</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-6">
              <PersonalInfoForm form={form} />
              <div className="flex justify-end mt-6">
                <Button
                  type="button"
                  onClick={() => handleTabNext("personal")}
                >
                  Next: Employment
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="employment" className="mt-6">
              <EmploymentInfoForm form={form} departments={departments} />
              <div className="flex justify-between mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("personal")}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleTabNext("employment")}
                >
                  Next: Salary
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="salary" className="mt-6">
              <SalaryInfoForm form={form} />
              <div className="flex justify-between mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("employment")}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Employee"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </CardContent>
    </Card>
  );
}
