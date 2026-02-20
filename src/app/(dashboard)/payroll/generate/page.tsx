"use client";

import { useState, useRef } from "react";
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
import { DollarSign, Loader2, Upload, FileSpreadsheet, X } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface UploadResult {
  message: string;
  totalRows: number;
  created: number;
  updated: number;
  errors: number;
  errorDetails?: string[];
}

interface GenerateResult {
  message: string;
  created: number;
  skipped: number;
  errors: number;
}

export default function ProcessPayrollPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setUploadResult(null);
    setGenerateResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("month", month);
      formData.append("year", year);

      const res = await fetch("/api/payroll/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload payroll");
      }

      setUploadResult(data);

      toast({
        title: "Payroll uploaded",
        description: `Created ${data.created}, updated ${data.updated} payslips for ${MONTHS[parseInt(month) - 1]} ${year}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to upload payroll",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setGenerateResult(null);
    setUploadResult(null);

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

      setGenerateResult(data);

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

  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Process Payroll</h1>
        <p className="text-gray-400 mt-1">
          Upload salary data or auto-generate payslips
        </p>
      </div>

      {/* Month/Year Selection */}
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-white">Pay Period</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Excel Upload */}
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Upload Salary Excel</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload an Excel file (.xlsx) with salary and CPF data. Existing payslips for the same period will be overwritten.
          </p>

          <div className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-400">Expected columns:</p>
            <p>Employee ID | Name | Basic Salary | Allowances | Overtime | Bonus | CPF Employee | CPF Employer | Income Tax | Other Deductions</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="border-gray-700 hover:bg-gray-800"
              disabled={isLoading}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Choose File
            </Button>
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900 px-3 py-1.5 rounded-lg">
                <FileSpreadsheet className="h-4 w-4 text-green-400" />
                {selectedFile.name}
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-gray-500 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={isLoading || !selectedFile}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload & Process Payroll
              </>
            )}
          </Button>

          {uploadResult && (
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-3">
              <p className="text-sm font-medium text-white">{uploadResult.message}</p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Total Rows</p>
                  <p className="text-white font-bold text-lg">{uploadResult.totalRows}</p>
                </div>
                <div>
                  <p className="text-gray-400">Created</p>
                  <p className="text-green-400 font-bold text-lg">{uploadResult.created}</p>
                </div>
                <div>
                  <p className="text-gray-400">Updated</p>
                  <p className="text-blue-400 font-bold text-lg">{uploadResult.updated}</p>
                </div>
                <div>
                  <p className="text-gray-400">Errors</p>
                  <p className="text-red-400 font-bold text-lg">{uploadResult.errors}</p>
                </div>
              </div>
              {uploadResult.errorDetails && uploadResult.errorDetails.length > 0 && (
                <div className="text-xs text-red-400 space-y-1 mt-2">
                  {uploadResult.errorDetails.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Generate */}
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Auto-Generate from Employee Data</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Auto-generate payslips using each employee&apos;s salary info and CPF rates.
            This will skip employees who already have a payslip for this period.
          </p>

          <Button
            onClick={handleGenerate}
            disabled={isLoading}
            variant="outline"
            className="border-gray-700 hover:bg-gray-800"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Auto-Generate Payroll
              </>
            )}
          </Button>

          {generateResult && (
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-2">
              <p className="text-sm font-medium text-white">{generateResult.message}</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Created</p>
                  <p className="text-green-400 font-bold text-lg">{generateResult.created}</p>
                </div>
                <div>
                  <p className="text-gray-400">Skipped</p>
                  <p className="text-amber-400 font-bold text-lg">{generateResult.skipped}</p>
                </div>
                <div>
                  <p className="text-gray-400">Errors</p>
                  <p className="text-red-400 font-bold text-lg">{generateResult.errors}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="max-w-2xl">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/payroll")}
          disabled={isLoading}
          className="border-gray-700 hover:bg-gray-800"
        >
          Back to Payroll
        </Button>
      </div>
    </div>
  );
}
