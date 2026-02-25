"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Send, Upload, X } from "lucide-react";

interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  maxAmount: any;
  requiresReceipt: boolean;
}

interface ExpenseSubmitFormProps {
  categories: ExpenseCategory[];
}

export function ExpenseSubmitForm({ categories }: ExpenseSubmitFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let receiptUrl: string | undefined;
      let receiptFileName: string | undefined;

      // Upload receipt if provided
      if (receiptFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", receiptFile);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadError = await uploadRes.json();
          throw new Error(uploadError.error || "Failed to upload receipt");
        }

        const uploadData = await uploadRes.json();
        receiptUrl = uploadData.url;
        receiptFileName = uploadData.fileName;
        setIsUploading(false);
      }

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          description,
          amount: parseFloat(amount),
          expenseDate,
          receiptUrl,
          receiptFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit expense");
      }

      toast({
        title: "Expense claim submitted",
        description: "Your claim is pending approval.",
      });

      router.push("/expenses");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to submit expense claim",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Expense Claim</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="category" className="text-white">
              Category *
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select expense category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory?.maxAmount && (
              <p className="text-xs text-gray-500">
                Max claimable: ${Number(selectedCategory.maxAmount).toFixed(2)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">
              Description *
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white min-h-[80px]"
              placeholder="Describe the expense..."
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-white">
                Amount (SGD) *
              </Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseDate" className="text-white">
                Expense Date *
              </Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white">
              Receipt {selectedCategory?.requiresReceipt ? "*" : "(optional)"}
            </Label>
            {receiptFile ? (
              <div className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg">
                <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-300 truncate flex-1">
                  {receiptFile.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReceiptFile(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required={selectedCategory?.requiresReceipt}
                />
                <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-400">
                    Click to upload receipt (Image or PDF, max 5MB)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
              className="border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                !categoryId ||
                !description ||
                !amount ||
                !expenseDate
              }
            >
              <Send className="h-4 w-4 mr-2" />
              {isUploading
                ? "Uploading..."
                : isLoading
                  ? "Submitting..."
                  : "Submit Claim"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
