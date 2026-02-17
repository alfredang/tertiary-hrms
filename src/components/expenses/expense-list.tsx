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
    firstName: string;
    lastName: string;
  };
  category: { name: string; code: string };
  approver: { firstName: string; lastName: string } | null;
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
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredClaims = claims.filter((claim) => {
    const matchesSearch =
      claim.description.toLowerCase().includes(search.toLowerCase()) ||
      `${claim.employee.firstName} ${claim.employee.lastName}`
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || claim.status === statusFilter;

    return matchesSearch && matchesStatus;
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
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
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
      </div>

      {/* Expense Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClaims.map((claim) => (
          <Card key={claim.id} className="bg-gray-950 border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {categoryIcons[claim.category.code] || "📄"}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white line-clamp-1">
                      {claim.description}
                    </h3>
                    <p className="text-sm text-gray-400">{claim.category.name}</p>
                  </div>
                </div>
                <Badge className={statusColors[claim.status]}>
                  {claim.status}
                </Badge>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(claim.expenseDate)}</span>
                </div>
                <p className="text-lg font-bold text-white">
                  {formatCurrency(Number(claim.amount))}
                </p>
              </div>

              {isManager && claim.status === "PENDING" && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApprove(claim.id)}
                    disabled={isLoading === claim.id}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(claim.id)}
                    disabled={isLoading === claim.id}
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClaims.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No expense claims found</p>
        </div>
      )}
    </div>
  );
}
