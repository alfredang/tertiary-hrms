"use client";

import { useState, useEffect } from "react";
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
import { Search, Calendar, Download, Pencil, X, RefreshCw, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
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
  unpaidLeaveDays?: any;
  unpaidLeaveDeduction?: any;
  paybackDays?: any;
  paybackAmount?: any;
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
  /** payslip id → download path of the CPF statement it was built from (admin/accountant only). */
  cpfLinks?: Record<string, { path: string; name: string }>;
  /** The viewer is an intern looking at their own payslips: no CPF columns. */
  intern?: boolean;
}

const statusColors: Record<PayslipStatus, string> = {
  DRAFT: "bg-gray-900 text-gray-300 border-gray-800",
  GENERATED: "bg-blue-900 text-blue-200 border-blue-800",
  PAID: "bg-green-900 text-green-200 border-green-800",
};

function formatPayPeriod(date: Date): string {
  return new Date(date).toLocaleDateString("en-SG", {
    month: "2-digit",
    year: "numeric",
  });
}

const PAGE_SIZE = 50;

/** Intern payslip lines: the flat allowance, the MC / No Pay Leave deduction and the payback add-back. */
function internLines(p: Payslip) {
  const payback = Number(p.paybackAmount ?? 0);
  const unpaid = Number(p.unpaidLeaveDeduction ?? 0);
  return {
    allowance: Number(p.grossSalary) - payback,
    unpaid,
    unpaidDays: Number(p.unpaidLeaveDays ?? 0),
    payback,
    paybackDays: Number(p.paybackDays ?? 0),
  };
}

function daysLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function PayrollList({ payslips, isHR, cpfLinks = {}, intern = false }: PayrollListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [editGross, setEditGross] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const emailPayslip = async (payslipId: string) => {
    setEmailingId(payslipId);
    try {
      const res = await fetch(`/api/payroll/payslip/${payslipId}/email`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Email failed");
      toast({ title: "Payslip emailed", description: "The employee has been sent their payslip." });
    } catch (err) {
      toast({
        title: "Email failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEmailingId(null);
    }
  };

  const regenerate = async (payslipId: string) => {
    setRegeneratingId(payslipId);
    try {
      const res = await fetch(`/api/payroll/payslip/${payslipId}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Regenerate failed");
      toast({ title: "Payslip regenerated", description: "Drive copy was replaced." });
      router.refresh();
    } catch (err) {
      toast({
        title: "Regenerate failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const openEdit = (p: Payslip) => {
    setEditing(p);
    setEditGross(String(Number(p.grossSalary)));
  };
  const closeEdit = () => {
    setEditing(null);
    setEditGross("");
  };
  const saveEdit = async () => {
    if (!editing) return;
    const gross = Number(editGross);
    if (!Number.isFinite(gross) || gross < 0) {
      alert("Gross pay must be a non-negative number");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/payroll/payslip/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grossSalary: gross, basicSalary: gross }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      closeEdit();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  };
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
  }).sort(
    (a, b) =>
      new Date(b.payPeriodStart).getTime() - new Date(a.payPeriodStart).getTime(),
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedPayslips = filteredPayslips.slice(pageStart, pageStart + PAGE_SIZE);

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
            {paginatedPayslips.map((payslip) => (
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
                {cpfLinks[payslip.id] && (
                  <a href={cpfLinks[payslip.id].path} download={cpfLinks[payslip.id].name} className="block">
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      CPF Statement
                    </Button>
                  </a>
                )}
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
                {paginatedPayslips.map((payslip) => (
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(payslip.id)}
                          className="h-8 px-3 text-sm"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Payslip
                        </Button>
                        {cpfLinks[payslip.id] && (
                          <a
                            href={cpfLinks[payslip.id].path}
                            download={cpfLinks[payslip.id].name}
                            title={`CPF statement: ${cpfLinks[payslip.id].name}`}
                          >
                            <Button variant="outline" size="sm" className="h-8 px-3 text-sm">
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              CPF
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(payslip)}
                          className="h-8 px-2 text-gray-300 hover:text-white"
                          title="Edit gross pay"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => regenerate(payslip.id)}
                          disabled={regeneratingId === payslip.id}
                          className="h-8 px-2 text-gray-300 hover:text-white"
                          title="Regenerate PDF"
                        >
                          {regeneratingId === payslip.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => emailPayslip(payslip.id)}
                          disabled={emailingId === payslip.id}
                          className="h-8 px-2 text-gray-300 hover:text-cyan-400"
                          title="Email payslip to employee"
                        >
                          {emailingId === payslip.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
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
            {paginatedPayslips.map((payslip) => (
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
                {intern ? (
                  (() => {
                    const l = internLines(payslip);
                    return (
                      <div className="space-y-1 text-xs text-gray-400">
                        <div className="flex justify-between">
                          <span>Monthly allowance (flat)</span>
                          <span>{formatCurrency(l.allowance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>MC / No Pay Leave{l.unpaidDays > 0 ? ` (${daysLabel(l.unpaidDays)})` : ""}</span>
                          <span>{l.unpaid > 0 ? `−${formatCurrency(l.unpaid)}` : "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payback added back{l.paybackDays > 0 ? ` (${daysLabel(l.paybackDays)})` : ""}</span>
                          <span>{l.payback > 0 ? `+${formatCurrency(l.payback)}` : "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>CPF</span>
                          <span>None (interns have no CPF)</span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>CPF (ER): {formatCurrency(Number(payslip.cpfEmployer))}</span>
                    <span>CPF (EE): {formatCurrency(Number(payslip.cpfEmployee))}</span>
                  </div>
                )}
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
                  {intern ? (
                    <>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Monthly Allowance</th>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">MC / No Pay Leave</th>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Payback</th>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Gross</th>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (ER)</th>
                      <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">CPF (EE)</th>
                    </>
                  )}
                  <th className="text-right text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">{intern ? "Take-Home Pay" : "Net Pay"}</th>
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {paginatedPayslips.map((payslip) => (
                  <tr key={payslip.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatPayPeriod(payslip.payPeriodStart)}
                    </td>
                    {intern ? (
                      (() => {
                        const l = internLines(payslip);
                        return (
                          <>
                            <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                              {formatCurrency(l.allowance)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap" title="Deducted at the monthly allowance ÷ Mon–Fri working days">
                              {l.unpaid > 0 ? `−${formatCurrency(l.unpaid)} (${daysLabel(l.unpaidDays)})` : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap" title="Off days worked to pay back No Pay Leave, added back at the same rate">
                              {l.payback > 0 ? `+${formatCurrency(l.payback)} (${daysLabel(l.paybackDays)})` : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 text-right whitespace-nowrap">None</td>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                          {formatCurrency(Number(payslip.grossSalary))}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                          {formatCurrency(Number(payslip.cpfEmployer))}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 text-right whitespace-nowrap">
                          {formatCurrency(Number(payslip.cpfEmployee))}
                        </td>
                      </>
                    )}
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

      {filteredPayslips.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-gray-400">
            Showing <span className="text-white">{pageStart + 1}</span>–
            <span className="text-white">{pageStart + paginatedPayslips.length}</span> of{" "}
            <span className="text-white">{filteredPayslips.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-400 px-2">
              Page <span className="text-white">{currentPage}</span> of{" "}
              <span className="text-white">{totalPages}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Edit Gross Pay</h2>
              <button onClick={closeEdit} className="p-1 text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              {editing.employee.name} — {formatPayPeriod(editing.payPeriodStart)}
            </p>
            <div className="space-y-1">
              <label className="text-sm text-gray-300">Gross Pay (SGD)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editGross}
                onChange={(e) => setEditGross(e.target.value)}
                className="bg-gray-900 border-gray-800 text-white"
              />
              <p className="text-xs text-gray-500">
                CPF and net pay are recalculated from this gross. The PDF in Drive is replaced automatically.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
