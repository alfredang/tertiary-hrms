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
import { Search, Calendar, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseStatus, ExpenseCategory } from "@prisma/client";

interface ExpenseClaim {
  id: string;
  description: string;
  amount: any;
  expenseDate: Date;
  status: ExpenseStatus;
  receiptUrl: string | null;
  createdAt: Date;
  employee: {
    id: string;
    name: string;
  };
  category: { name: string; code: string };
  approver: { name: string } | null;
}

interface ExpenseListProps {
  claims: ExpenseClaim[];
  categories: ExpenseCategory[];
  isManager: boolean;
}

const statusColors: Record<ExpenseStatus, string> = {
  PENDING: "bg-blue-100 text-blue-800 border-blue-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  PAID: "bg-purple-100 text-purple-800 border-purple-200",
};

const categoryIcons: Record<string, string> = {
  CE: "🍽️",
  TRV: "✈️",
  OS: "📎",
  TRN: "📚",
  SW: "💻",
  MISC: "📦",
};

export function ExpenseList({ claims, categories, isManager }: ExpenseListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredClaims = claims.filter((claim) => {
    const matchesSearch =
      claim.description.toLowerCase().includes(search.toLowerCase()) ||
      claim.employee.name
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || claim.status === statusFilter;

    const claimDate = new Date(claim.expenseDate);
    const matchesDateFrom = !dateFrom || claimDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || claimDate <= new Date(dateTo + "T23:59:59");

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const handleApprove = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to approve");

      toast({
        title: "Expense approved",
        description: "The expense claim has been approved.",
      });

      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Failed to approve expense",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/reject`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to reject");

      toast({
        title: "Expense rejected",
        description: "The expense claim has been rejected.",
      });

      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject expense",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search expenses..."
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
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
            placeholder="From"
          />
          <span className="text-gray-400 text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
            placeholder="To"
          />
        </div>
      </div>

      {isManager ? (
        /* Admin Table View */
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-800">
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Employee Name</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Description</th>
                <th className="text-right text-sm font-medium text-gray-400 px-4 py-3">Amount</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Claim Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Status</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredClaims.map((claim) => (
                <tr key={claim.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-sm text-white">
                    {claim.employee.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 max-w-[250px] truncate">
                    {claim.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right font-medium">
                    {formatCurrency(Number(claim.amount))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(claim.expenseDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[claim.status]}>
                      {claim.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {claim.status === "PENDING" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleApprove(claim.id)}
                          disabled={isLoading === claim.id}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(claim.id)}
                          disabled={isLoading === claim.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredClaims.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No expense claims found</p>
            </div>
          )}
        </div>
      ) : (
        /* Staff Table View (no Action column) */
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-800">
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Description</th>
                <th className="text-right text-sm font-medium text-gray-400 px-4 py-3">Amount</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Claim Date</th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredClaims.map((claim) => (
                <tr key={claim.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {claim.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right font-medium">
                    {formatCurrency(Number(claim.amount))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDate(claim.expenseDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[claim.status]}>
                      {claim.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredClaims.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No expense claims found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
