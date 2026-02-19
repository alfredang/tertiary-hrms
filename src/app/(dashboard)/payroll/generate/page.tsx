"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Loader2 } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ProcessPayrollPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const handleGenerate = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: parseInt(month),
          year: parseInt(year),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate payroll");
      }

      setResult(data);

      toast({
        title: "Payroll generated",
        description: `Created ${data.created} payslips for ${MONTHS[parseInt(month) - 1]} ${year}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to generate payroll",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate year options (current year and previous 2 years)
  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Process Payroll</h1>
        <p className="text-gray-400 mt-1">
          Generate payslips for all active employees
        </p>
      </div>

      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Payroll Generation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-400">
            Payroll is automatically generated on the 28th of each month. Use
            this form to manually generate payroll for a specific month.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Month *</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white">Year *</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {result && (
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-2">
              <p className="text-sm font-medium text-white">{result.message}</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Created</p>
                  <p className="text-green-400 font-bold text-lg">
                    {result.created}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Skipped</p>
                  <p className="text-amber-400 font-bold text-lg">
                    {result.skipped}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Errors</p>
                  <p className="text-red-400 font-bold text-lg">
                    {result.errors}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/payroll")}
              disabled={isLoading}
              className="border-gray-700 hover:bg-gray-800"
            >
              Back to Payroll
            </Button>
            <Button onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Generate Payroll
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
