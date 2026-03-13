"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import type { Department } from "@prisma/client";

const formSchema = z.object({
  personalInfo: personalInfoSchema,
  employmentInfo: employmentInfoSchema,
  salaryInfo: salaryInfoSchema,
});

type FormInput = z.infer<typeof formSchema>;

interface AddEmployeeFormProps {
  departments: Department[];
}

export function AddEmployeeForm({ departments }: AddEmployeeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
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

  const STORAGE_KEY = "add-employee-draft";

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.personalInfo) form.reset(draft);
        if (draft.activeTab) setActiveTab(draft.activeTab);
      }
    } catch {
      // Ignore corrupt data
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft to localStorage on changes
  const saveDraft = useCallback(() => {
    try {
      const data = form.getValues();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...data, activeTab }),
      );
    } catch {
      // localStorage full or unavailable
    }
  }, [form, activeTab]);

  useEffect(() => {
    // Save on tab change
    saveDraft();
  }, [activeTab, saveDraft]);

  useEffect(() => {
    // Save periodically as user types (every 2s)
    const interval = setInterval(saveDraft, 2000);
    return () => clearInterval(interval);
  }, [saveDraft]);

  const resetTab = () => {
    const tabLabels: Record<string, string> = {
      personal: "Personal",
      employment: "Employment",
      salary: "Salary",
    };
    const label = tabLabels[activeTab] || activeTab;
    if (!confirm(`Do you want to reset all fields in the "${label}" tab?`)) return;
    const defaults: Record<string, Record<string, unknown>> = {
      personal: {
        "personalInfo.fullName": "",
        "personalInfo.email": "",
        "personalInfo.phone": "",
        "personalInfo.dateOfBirth": "",
        "personalInfo.gender": "MALE",
        "personalInfo.nationality": "Singaporean",
        "personalInfo.nric": "",
        "personalInfo.address": "",
        "personalInfo.educationLevel": "DIPLOMA",
      },
      employment: {
        "employmentInfo.departmentId": "",
        "employmentInfo.position": "",
        "employmentInfo.employmentType": "FULL_TIME",
        "employmentInfo.startDate": new Date().toISOString().split("T")[0],
        "employmentInfo.endDate": "",
        "employmentInfo.status": "ACTIVE",
      },
      salary: {
        "salaryInfo.basicSalary": 0,
        "salaryInfo.allowances": 0,
        "salaryInfo.bankName": "",
        "salaryInfo.bankAccountNumber": "",
        "salaryInfo.payNow": "",
        "salaryInfo.cpfApplicable": true,
        "salaryInfo.cpfEmployeeRate": 20.0,
        "salaryInfo.cpfEmployerRate": 17.0,
      },
    };
    const fields = defaults[activeTab];
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        form.setValue(key as any, value as any);
      }
    }
  };

  const handleSubmit = async () => {
    // Validate all tabs — jump to first tab with errors
    const personalValid = personalInfoSchema.safeParse(
      form.getValues("personalInfo"),
    );
    if (!personalValid.success) {
      setActiveTab("personal");
      toast({
        title: "Personal Info Incomplete",
        description: personalValid.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    const employmentValid = employmentInfoSchema.safeParse(
      form.getValues("employmentInfo"),
    );
    if (!employmentValid.success) {
      setActiveTab("employment");
      toast({
        title: "Employment Info Incomplete",
        description: employmentValid.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    const salaryValid = salaryInfoSchema.safeParse(
      form.getValues("salaryInfo"),
    );
    if (!salaryValid.success) {
      setActiveTab("salary");
      toast({
        title: "Salary Info Incomplete",
        description: salaryValid.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalInfo: personalValid.data,
          employmentInfo: employmentValid.data,
          salaryInfo: salaryValid.data,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create employee");
      }

      const employee = await res.json();

      localStorage.removeItem(STORAGE_KEY);

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

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/employees")}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-white">Add New Employee</CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetTab}
            className="text-gray-500 hover:text-white text-xs gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            Reset tab
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
                onClick={() => setActiveTab("employment")}
                className="bg-green-600 hover:bg-green-700 text-white"
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
                onClick={() => setActiveTab("salary")}
                className="bg-green-600 hover:bg-green-700 text-white"
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
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
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
      </CardContent>
    </Card>
  );
}
