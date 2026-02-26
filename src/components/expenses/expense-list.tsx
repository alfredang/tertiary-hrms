"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Search, Calendar, Check, X, Pencil, RotateCcw, ChevronUp, ChevronDown, Eye } from "lucide-react";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseStatus, ExpenseCategory } from "@prisma/client";

interface ExpenseClaim {
  id: string;
  description: string;
  amount: any;
  expenseDate: Date;
  status: ExpenseStatus;
  receiptUrl: string | null;
  receiptFileName: string | null;
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

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; fileName: string } | null>(null);
  const { toast } = useToast();

  type ExpenseSortKey = "employee" | "description" | "amount" | "expenseDate" | "status" | "createdAt";
  const [sortKey, setSortKey] = useState<ExpenseSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredClaims = claims.filter((claim) => {
    const matchesSearch =
      claim.description.toLowerCase().includes(search.toLowerCase()) ||
      claim.employee.name.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ? (claim.status as string) !== "CANCELLED" : claim.status === statusFilter;

    const claimDate = new Date(claim.expenseDate);
    const matchesDateFrom = !dateFrom || claimDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || claimDate <= new Date(dateTo + "T23:59:59");

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedClaims = [...filteredClaims].sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (sortKey) {
      case "employee":    aVal = a.employee.name;                   bVal = b.employee.name;                   break;
      case "description": aVal = a.description;                     bVal = b.description;                     break;
      case "amount":      aVal = Number(a.amount);                  bVal = Number(b.amount);                  break;
      case "expenseDate": aVal = new Date(a.expenseDate).getTime(); bVal = new Date(b.expenseDate).getTime(); break;
      case "status": { const r: Record<string,number> = {PENDING:0,APPROVED:1,REJECTED:2,CANCELLED:3,PAID:4}; aVal = r[a.status]??99; bVal = r[b.status]??99; break; }
      case "createdAt":   aVal = new Date(a.createdAt).getTime();   bVal = new Date(b.createdAt).getTime();   break;
      default:            aVal = 0;                                 bVal = 0;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleApprove = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to approve");
      toast({ title: "Expense approved", description: "The expense claim has been approved." });
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to approve expense", variant: "destructive" });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to reject");
      toast({ title: "Expense rejected", description: "The expense claim has been rejected." });
      setRejectConfirm(null);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to reject expense", variant: "destructive" });
    } finally {
      setIsLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      toast({ title: "Expense cancelled", description: "Your expense claim has been cancelled." });
      setCancelConfirm(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel expense",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleReset = async (id: string) => {
    setIsLoading(id);
    try {
      const res = await fetch(`/api/expenses/${id}/reset`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset");
      }
      toast({ title: "Expense reset to pending", description: "The claim is pending review again." });
      setResetConfirm(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset expense claim",
        variant: "destructive",
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Admin reset button for APPROVED/REJECTED rows (render function — avoids unmount/remount)
  const renderAdminResetActions = (id: string) => (
    <div>
      {resetConfirm === id ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-amber-400">Reset to pending?</span>
          <Button
            size="sm"
            onClick={() => handleReset(id)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs"
          >
            {isLoading === id ? "Resetting..." : "Yes, Reset"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setResetConfirm(null)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
          >
            No
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setResetConfirm(id); setRejectConfirm(null); }}
          className="h-7 w-7 p-0 border-gray-700 text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 hover:border-amber-800"
          title="Reset to Pending"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  // Admin PENDING row actions (render function)
  const renderAdminPendingActions = (id: string) => (
    <>
      {rejectConfirm === id ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-red-400">Reject this expense?</span>
          <Button
            size="sm"
            onClick={() => handleReject(id)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs bg-red-800 hover:bg-red-700 text-white"
          >
            {isLoading === id ? "Rejecting..." : "Yes, Reject"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejectConfirm(null)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
          >
            No
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="success"
            size="sm"
            onClick={() => handleApprove(id)}
            disabled={isLoading === id}
            className="h-8 px-3 text-sm"
          >
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRejectConfirm(id); setResetConfirm(null); }}
            disabled={isLoading === id}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-3 text-sm"
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
        </div>
      )}
    </>
  );

  // Staff cancel + edit actions for PENDING rows (render function)
  const renderStaffActions = (id: string) => (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-7 px-3 text-xs border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
      >
        <Link href={`/expenses/edit/${id}`}>
          <Pencil className="h-3 w-3 mr-1" />
          Edit
        </Link>
      </Button>
      {cancelConfirm === id ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400">Cancel this expense?</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCancel(id)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
          >
            {isLoading === id ? "Cancelling..." : "Yes, Cancel"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCancelConfirm(null)}
            disabled={isLoading === id}
            className="h-7 px-3 text-xs border-gray-700 hover:bg-gray-800"
          >
            No
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCancelConfirm(id)}
          className="h-7 px-2 text-xs border-gray-700 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800"
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      )}
    </div>
  );

  const renderSortTh = (label: string, key: ExpenseSortKey, textRight = false) => {
    const active = sortKey === key;
    return (
      <th
        onClick={() => {
          if (active) setSortDir(d => d === "asc" ? "desc" : "asc");
          else { setSortKey(key); setSortDir("asc"); }
        }}
        className={`${textRight ? "text-right" : "text-left"} text-sm font-medium px-4 py-3 whitespace-nowrap cursor-pointer select-none group ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
      >
        <span className={`flex items-center gap-1 ${textRight ? "justify-end" : ""}`}>
          {label}
          {active
            ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
            : <ChevronUp className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
        </span>
      </th>
    );
  };

  const renderReceiptButton = (claim: ExpenseClaim) => {
    if (!claim.receiptUrl) return null;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setPreviewDoc({ url: claim.receiptUrl!, fileName: claim.receiptFileName || "receipt" })}
        className="h-7 w-7 p-0 border-gray-700 text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 hover:border-blue-800"
        title="View Receipt"
      >
        <Eye className="h-3 w-3" />
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        {/* Row 1: Search + Date range */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 sm:w-[150px] sm:flex-none"
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 sm:w-[150px] sm:flex-none"
              placeholder="To"
            />
          </div>
        </div>
        {/* Row 2: Status filter */}
        {/* Mobile/Zoom: Select dropdown */}
        <div className="md:hidden">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Desktop: Pill buttons */}
        <div className="hidden md:flex flex-wrap gap-1">
          {(["all", "PENDING", "APPROVED", "REJECTED", "CANCELLED", "PAID"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === v
                  ? "bg-white text-gray-900"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {v === "all" ? "All" : v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {isManager ? (
        /* Admin View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {sortedClaims.map((claim) => (
              <div key={claim.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{claim.employee.name}</span>
                  <Badge className={statusColors[claim.status]}>{claim.status}</Badge>
                </div>
                <p className="text-sm text-gray-300 line-clamp-2">{claim.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-white">{formatCurrency(Number(claim.amount))}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(claim.expenseDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {renderReceiptButton(claim)}
                  {claim.status === "PENDING" && renderAdminPendingActions(claim.id)}
                  {(claim.status === "APPROVED" || claim.status === "REJECTED") && renderAdminResetActions(claim.id)}
                </div>
              </div>
            ))}
            {sortedClaims.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400">No expense claims found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  {renderSortTh("Employee", "employee")}
                  {renderSortTh("Description", "description")}
                  {renderSortTh("Amount", "amount", true)}
                  {renderSortTh("Date", "expenseDate")}
                  {renderSortTh("Status", "status")}
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedClaims.map((claim) => (
                  <tr key={claim.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                      {claim.employee.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-[200px] truncate">
                      {claim.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(claim.amount))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(claim.expenseDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[claim.status]}>
                        {claim.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-start gap-2">
                        {renderReceiptButton(claim)}
                        {claim.status === "PENDING"
                          ? renderAdminPendingActions(claim.id)
                          : (claim.status === "APPROVED" || claim.status === "REJECTED")
                            ? renderAdminResetActions(claim.id)
                            : !claim.receiptUrl && <span className="text-sm text-gray-500">—</span>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedClaims.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400">No expense claims found</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Staff View */
        <>
          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {sortedClaims.map((claim) => (
              <div key={claim.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-300 truncate flex-1 mr-2">{claim.description}</p>
                  <Badge className={statusColors[claim.status]}>{claim.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-white">{formatCurrency(Number(claim.amount))}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(claim.expenseDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {renderReceiptButton(claim)}
                  {claim.status === "PENDING" && renderStaffActions(claim.id)}
                </div>
              </div>
            ))}
            {sortedClaims.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400">No expense claims found</p>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="bg-gray-950 border-b border-gray-800">
                  {renderSortTh("Description", "description")}
                  {renderSortTh("Amount", "amount", true)}
                  {renderSortTh("Date", "expenseDate")}
                  {renderSortTh("Status", "status")}
                  <th className="text-left text-sm font-medium text-gray-400 px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedClaims.map((claim) => (
                  <tr key={claim.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-[150px] truncate">
                      {claim.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium whitespace-nowrap">
                      {formatCurrency(Number(claim.amount))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                      {formatDate(claim.expenseDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[claim.status]}>
                        {claim.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {renderReceiptButton(claim)}
                        {claim.status === "PENDING"
                          ? renderStaffActions(claim.id)
                          : !claim.receiptUrl && <span className="text-sm text-gray-500">—</span>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedClaims.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400">No expense claims found</p>
              </div>
            )}
          </div>
        </>
      )}

      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
          url={previewDoc.url}
          fileName={previewDoc.fileName}
        />
      )}
    </div>
  );
}
