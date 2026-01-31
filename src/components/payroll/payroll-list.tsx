"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, Calendar, Download } from "lucide-react";
import type { PayslipStatus } from "@prisma/client";

interface Payslip {
  id: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  paymentDate: Date;
  basicSalary: any;
  allowances: any;
  grossSalary: any;
  cpfEmployee: any;
  cpfEmployer: any;
  incomeTax: any;
  totalDeductions: any;
  netSalary: any;
  status: PayslipStatus;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    department: { name: string };
  };
}

interface PayrollListProps {
  payslips: Payslip[];
  isHR: boolean;
}

const statusColors: Record<PayslipStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800 border-gray-200",
  GENERATED: "bg-blue-100 text-blue-800 border-blue-200",
  PAID: "bg-green-100 text-green-800 border-green-200",
};

export function PayrollList({ payslips, isHR }: PayrollListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredPayslips = payslips.filter((payslip) => {
    const matchesSearch =
      `${payslip.employee.firstName} ${payslip.employee.lastName}`
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      payslip.employee.employeeId.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || payslip.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDownloadPDF = async (payslipId: string) => {
    try {
      const response = await fetch(`/api/payroll/payslip/${payslipId}/pdf`);
      if (!response.ok) throw new Error("Failed to generate PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip-${payslipId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading PDF:", error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="GENERATED">Processed</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payslip Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPayslips.map((payslip) => (
          <Card key={payslip.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(payslip.payPeriodStart).toLocaleDateString("en-SG", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <Badge className={statusColors[payslip.status]}>
                  {payslip.status}
                </Badge>
              </div>

              <h3 className="font-semibold text-gray-900">
                {payslip.employee.firstName} {payslip.employee.lastName}
              </h3>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Basic Salary</span>
                  <span className="font-medium">
                    {formatCurrency(Number(payslip.basicSalary))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Allowances</span>
                  <span className="text-green-600">
                    +{formatCurrency(Number(payslip.allowances))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Deductions</span>
                  <span className="text-red-600">
                    -{formatCurrency(Number(payslip.totalDeductions))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax</span>
                  <span className="text-red-600">
                    -{formatCurrency(Number(payslip.incomeTax))}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Net Salary</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(Number(payslip.netSalary))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(payslip.id)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Payslip
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredPayslips.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No payslips found</p>
        </div>
      )}
    </div>
  );
}
