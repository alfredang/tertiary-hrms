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
  createPersonalInfoSchema,
  createEmploymentInfoSchema,
  createSalaryInfoSchema,
} from "@/lib/validations/employee";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import type { Department } from "@prisma/client";

const formSchema = z.object({
  personalInfo: createPersonalInfoSchema,
  employmentInfo: createEmploymentInfoSchema,
  salaryInfo: createSalaryInfoSchema,
});

type FormInput = z.infer<typeof formSchema>;

interface AddEmployeeFormProps {
  departments: Department[];
}

export function AddEmployeeForm({ departments }: AddEmployeeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [savedEmployeeId, setSavedEmployeeId] = useState<string | null>(null);
  const [savedTabs, setSavedTabs] = useState<Record<string, boolean>>({});
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

  const saveTab = async (tab: string) => {
    setIsLoading(true);
    try {
      if (!savedEmployeeId) {
        // First save - create the employee
        const personalInfo = form.getValues("personalInfo");

        // Validate at least name + email
        const parsed = createPersonalInfoSchema.safeParse(personalInfo);
        if (!parsed.success) {
          const firstError = parsed.error.issues[0];
          throw new Error(firstError.message);
        }

        const payload: any = { personalInfo: parsed.data };

        // Include current tab data if saving from employment or salary
        if (tab === "employment") {
          payload.employmentInfo = form.getValues("employmentInfo");
        } else if (tab === "salary") {
          payload.employmentInfo = form.getValues("employmentInfo");
          payload.salaryInfo = form.getValues("salaryInfo");
        }

        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to create employee");
        }

        const employee = await res.json();
        setSavedEmployeeId(employee.id);
        setSavedTabs((prev) => ({ ...prev, [tab]: true }));

        toast({
          title: "Employee created",
          description: `${employee.name} has been saved. You can continue filling in details or come back later.`,
        });
      } else {
        // Subsequent saves - update the employee via PATCH
        const payload: any = {};

        if (tab === "personal") {
          payload.personalInfo = form.getValues("personalInfo");
        } else if (tab === "employment") {
          payload.employmentInfo = form.getValues("employmentInfo");
        } else if (tab === "salary") {
          payload.salaryInfo = form.getValues("salaryInfo");
        }

        const res = await fetch(`/api/employees/${savedEmployeeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to update employee");
        }

        setSavedTabs((prev) => ({ ...prev, [tab]: true }));

        toast({
          title: "Saved",
          description: `${tab.charAt(0).toUpperCase() + tab.slice(1)} information has been saved.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDone = () => {
    if (savedEmployeeId) {
      router.push(`/employees/${savedEmployeeId}`);
    } else {
      router.push("/employees");
    }
  };

  const TabSaveButton = ({ tab }: { tab: string }) => (
    <div className="flex items-center gap-2">
      {savedTabs[tab] && (
        <span className="flex items-center gap-1 text-sm text-green-400">
          <Check className="h-4 w-4" />
          Saved
        </span>
      )}
      <Button
        type="button"
        onClick={() => saveTab(tab)}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : savedTabs[tab] ? (
          "Update"
        ) : savedEmployeeId ? (
          "Save"
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );

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
            <div>
              <CardTitle className="text-white">Employee Details</CardTitle>
              {savedEmployeeId && (
                <p className="text-sm text-gray-400 mt-1">
                  Employee created — fill in remaining details as needed
                </p>
              )}
            </div>
          </div>
          {savedEmployeeId && (
            <Button variant="outline" onClick={handleDone}>
              Done
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 bg-gray-900">
            <TabsTrigger value="personal" className="relative">
              Personal
              {savedTabs["personal"] && (
                <Check className="h-3 w-3 ml-1 text-green-400" />
              )}
            </TabsTrigger>
            <TabsTrigger value="employment" className="relative">
              Employment
              {savedTabs["employment"] && (
                <Check className="h-3 w-3 ml-1 text-green-400" />
              )}
            </TabsTrigger>
            <TabsTrigger value="salary" className="relative">
              Salary
              {savedTabs["salary"] && (
                <Check className="h-3 w-3 ml-1 text-green-400" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-6">
            <PersonalInfoForm form={form} />
            <div className="flex justify-between mt-6">
              <TabSaveButton tab="personal" />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("employment")}
              >
                Next: Employment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="employment" className="mt-6">
            <EmploymentInfoForm form={form} departments={departments} />
            <div className="flex justify-between mt-6">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("personal")}
                >
                  Back
                </Button>
                <TabSaveButton tab="employment" />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("salary")}
              >
                Next: Salary
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="salary" className="mt-6">
            <SalaryInfoForm form={form} />
            <div className="flex justify-between mt-6">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("employment")}
                >
                  Back
                </Button>
                <TabSaveButton tab="salary" />
              </div>
              {savedEmployeeId && (
                <Button onClick={handleDone}>
                  Done
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
