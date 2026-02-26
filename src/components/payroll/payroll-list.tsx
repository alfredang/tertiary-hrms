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
    name: string;
    employeeId: string;
    department: { name: string } | null;
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

function formatPayPeriod(date: Date): string {
  return new Date(date).toLocaleDateString("en-SG", {
    month: "2-digit",
    year: "numeric",
  });
}

export function PayrollList({ payslips, isHR }: PayrollListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredPayslips = payslips.filter((payslip) => {
    const matchesSearch =
      payslip.employee.name
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
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        {isHR && (
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by employee name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
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

      {isHR ? (
        /* Admin View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {filteredPayslips.map((payslip) => (
              <div key={payslip.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{payslip.employee.name}</span>
                  <span className="text-xs text-gray-400">{formatPayPeriod(payslip.payPeriodStart)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500">Gross</span>
                    <p className="text-sm font-medium text-white">{formatCurrency(Number(payslip.grossSalary))}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Net Pay</span>
                    <p className="text-sm font-semibold text-white">{formatCurrency(Number(payslip.netSalary))}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>CPF (ER): {formatCurrency(Number(payslip.cpfEmployer))}</span>
                  <span>CPF (EE): {formatCurrency(Number(payslip.cpfEmployee))}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(payslip.id)}
                  className="w-full h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download Payslip
                </Button>
              </div>
            ))}
            {filteredPayslips.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No payslips found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Employee</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Gross</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (ER)</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (EE)</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Net Pay</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredPayslips.map((payslip) => (
                  <tr key={payslip.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatPayPeriod(payslip.payPeriodStart)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                      {payslip.employee.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(payslip.grossSalary))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                      {formatCurrency(Number(payslip.cpfEmployer))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                      {formatCurrency(Number(payslip.cpfEmployee))}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(payslip.netSalary))}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(payslip.id)}
                        className="h-8 px-3 text-sm"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Payslip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPayslips.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No payslips found</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Staff View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {filteredPayslips.map((payslip) => (
              <div key={payslip.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{formatPayPeriod(payslip.payPeriodStart)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500">Gross</span>
                    <p className="text-sm font-medium text-white">{formatCurrency(Number(payslip.grossSalary))}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Net Pay</span>
                    <p className="text-sm font-semibold text-white">{formatCurrency(Number(payslip.netSalary))}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>CPF (ER): {formatCurrency(Number(payslip.cpfEmployer))}</span>
                  <span>CPF (EE): {formatCurrency(Number(payslip.cpfEmployee))}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(payslip.id)}
                  className="w-full h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download Payslip
                </Button>
              </div>
            ))}
            {filteredPayslips.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No payslips found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Gross</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (ER)</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (EE)</th>
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Net Pay</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredPayslips.map((payslip) => (
                  <tr key={payslip.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatPayPeriod(payslip.payPeriodStart)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(payslip.grossSalary))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                      {formatCurrency(Number(payslip.cpfEmployer))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                      {formatCurrency(Number(payslip.cpfEmployee))}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(payslip.netSalary))}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(payslip.id)}
                        className="h-8 px-3 text-sm"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Payslip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPayslips.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No payslips found</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
