"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save, ShieldCheck, Plus, X, Pencil, RotateCcw, Upload, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompanySettings } from "@prisma/client";

const companySettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  shortName: z.string().optional(),
  uen: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  logo: z.string().optional(),
  approvalEmails: z.array(z.string().email()).optional(),
});

type CompanySettingsFormData = z.infer<typeof companySettingsSchema>;

interface CompanySettingsFormProps {
  settings: CompanySettings;
}

export function CompanySettingsForm({ settings }: CompanySettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [approvalEmails, setApprovalEmails] = useState<string[]>(settings.approvalEmails || []);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [rolloverYear, setRolloverYear] = useState(String(new Date().getFullYear() - 1));
  const [rolloverLoading, setRolloverLoading] = useState(false);
  const [rolloverResults, setRolloverResults] = useState<{
    totalCarried: number;
    employeesProcessed: number;
    summary: Array<{ employee: string; employeeId: string; leaveType: string; unused: number; carried: number; warning?: string }>;
  } | null>(null);

  const form = useForm<CompanySettingsFormData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: settings.name,
      shortName: settings.shortName || "",
      uen: settings.uen || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: settings.email || "",
      website: settings.website || "",
      logo: settings.logo || "",
      approvalEmails: settings.approvalEmails || [],
    },
  });
  const logoUrl = form.watch("logo");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleCancel = () => {
    form.reset({
      name: settings.name,
      shortName: settings.shortName || "",
      uen: settings.uen || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: settings.email || "",
      website: settings.website || "",
      logo: settings.logo || "",
    });
    setApprovalEmails(settings.approvalEmails || []);
    setEditing(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      const j = await res.json();
      form.setValue("logo", j.url, { shouldDirty: true });
    } catch (err) {
      toast({
        title: "Logo upload failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const addApprovalEmail = () => {
    const email = newEmail.trim().toLowerCase();
    setEmailError("");
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setEmailError("Invalid email address"); return; }
    if (approvalEmails.includes(email)) { setEmailError("Email already in the list"); return; }
    const updated = [...approvalEmails, email];
    setApprovalEmails(updated);
    form.setValue("approvalEmails", updated);
    setNewEmail("");
  };

  const removeApprovalEmail = (email: string) => {
    const updated = approvalEmails.filter((e) => e !== email);
    setApprovalEmails(updated);
    form.setValue("approvalEmails", updated);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addApprovalEmail(); }
  };

  const onSubmit = async (data: CompanySettingsFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, approvalEmails }),
      });
      if (!response.ok) throw new Error("Failed to update settings");
      toast({ title: "Success", description: "Company settings updated successfully" });
      setEditing(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Failed to update company settings", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRollover = async () => {
    const year = parseInt(rolloverYear, 10);
    if (!window.confirm(`Roll over unused annual leave from ${year} to ${year + 1}? All active employees will be updated.`)) return;
    setRolloverLoading(true);
    setRolloverResults(null);
    try {
      const res = await fetch("/api/leave/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromYear: year }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Rollover failed"); }
      const data = await res.json();
      setRolloverResults(data);
      toast({ title: "Rollover complete", description: `${data.totalCarried} days carried over for ${data.employeesProcessed} employees.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Rollover failed", variant: "destructive" });
    } finally {
      setRolloverLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Company Information */}
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Company Information</CardTitle>
            </div>
            {!editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-white">Company Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <Image src={logoUrl} alt="Company logo" width={64} height={64} className="object-contain" unoptimized />
                    ) : (
                      <Building2 className="h-7 w-7 text-gray-600" />
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="border-gray-700 hover:bg-gray-800"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => form.setValue("logo", "", { shouldDirty: true })}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white">Company Name *</Label>
                  <Input id="name" {...form.register("name")} className="bg-gray-900 border-gray-700 text-white" placeholder="Enter company name" />
                  {form.formState.errors.name && <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortName" className="text-white">Short Name</Label>
                  <Input id="shortName" {...form.register("shortName")} className="bg-gray-900 border-gray-700 text-white" placeholder="e.g., Tertiary Infotech Academy" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uen" className="text-white">UEN (Unique Entity Number)</Label>
                  <Input id="uen" {...form.register("uen")} className="bg-gray-900 border-gray-700 text-white" placeholder="e.g., 201234567A" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-white">Phone Number</Label>
                  <Input id="phone" {...form.register("phone")} className="bg-gray-900 border-gray-700 text-white" placeholder="+65 1234 5678" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">Email Address</Label>
                  <Input id="email" type="email" {...form.register("email")} className="bg-gray-900 border-gray-700 text-white" placeholder="info@company.com" />
                  {form.formState.errors.email && <p className="text-sm text-red-400">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website" className="text-white">Website</Label>
                  <Input id="website" {...form.register("website")} className="bg-gray-900 border-gray-700 text-white" placeholder="https://www.company.com" />
                  {form.formState.errors.website && <p className="text-sm text-red-400">{form.formState.errors.website.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address" className="text-white">Address</Label>
                <Textarea id="address" {...form.register("address")} className="bg-gray-900 border-gray-700 text-white min-h-[80px]" placeholder="Enter company address" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {settings.logo && (
                <div>
                  <p className="text-sm text-gray-400 mb-2">Company Logo</p>
                  <div className="h-16 w-16 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center overflow-hidden">
                    <Image src={settings.logo} alt="Company logo" width={64} height={64} className="object-contain" unoptimized />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="text-sm text-gray-400">Company Name</p>
                  <p className="text-white">{settings.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Short Name</p>
                  <p className="text-white">{settings.shortName || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">UEN</p>
                  <p className="text-white">{settings.uen || "—"}</p>
                </div>
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <p className="text-white">{settings.phone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white">{settings.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Website</p>
                <p className="text-white">{settings.website || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Address</p>
                <p className="text-white">{settings.address || "—"}</p>
              </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Settings */}
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Approval Settings</CardTitle>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Leave requests, MC submissions, and expense claims will be routed to these email addresses for approval.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {approvalEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {approvalEmails.map((email) => (
                <Badge key={email} variant="outline" className="border-primary/50 text-primary bg-primary/10 px-3 py-1.5 text-sm">
                  {email}
                  {editing && (
                    <button type="button" onClick={() => removeApprovalEmail(email)} className="ml-2 hover:text-red-400 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No approval emails configured.</p>
          )}

          {editing && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setEmailError(""); }}
                  onKeyDown={handleEmailKeyDown}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Enter approver email address"
                />
                {emailError && <p className="text-sm text-red-400 mt-1">{emailError}</p>}
              </div>
              <Button type="button" variant="outline" onClick={addApprovalEmail} className="border-gray-700 hover:bg-gray-800">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HIDDEN: Leave Year-End Rollover — re-enable by uncommenting: {renderRolloverSection()} */}

      {editing && (
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading} className="border-gray-700 hover:bg-gray-800">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
