"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  User,
  FileText,
  Pencil,
  Check,
  X,
  Camera,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder";
import type {
  Department,
  EducationLevel,
  Employee,
  EmployeeStatus,
  EmploymentType,
  Gender,
  Role,
} from "@prisma/client";

const STATUS_OPTIONS: { value: EmployeeStatus; label: string; className: string }[] = [
  { value: "ACTIVE",     label: "Active",     className: "bg-green-100 text-green-800 border-green-200" },
  { value: "ON_LEAVE",   label: "On Leave",   className: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "TERMINATED", label: "Terminated", className: "bg-red-100 text-red-800 border-red-200" },
  { value: "RESIGNED",   label: "Resigned",   className: "bg-gray-100 text-gray-800 border-gray-200" },
  { value: "INACTIVE",   label: "Inactive",   className: "bg-slate-100 text-slate-800 border-slate-200" },
];

const WORKDAY_OPTIONS: { value: number; short: string; full: string }[] = [
  { value: 1, short: "Mon", full: "Monday" },
  { value: 2, short: "Tue", full: "Tuesday" },
  { value: 3, short: "Wed", full: "Wednesday" },
  { value: 4, short: "Thu", full: "Thursday" },
  { value: 5, short: "Fri", full: "Friday" },
  { value: 6, short: "Sat", full: "Saturday" },
  { value: 7, short: "Sun", full: "Sunday" },
];

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT",  label: "Contract" },
  { value: "INTERN",    label: "Intern" },
];

const ALL_ROLES: { value: Role; label: string }[] = [
  { value: "ADMIN",      label: "Admin" },
  { value: "STAFF",      label: "Staff" },
  { value: "INTERN",     label: "Intern" },
  { value: "ACCOUNTANT", label: "Accountant" },
];

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: "DIPLOMA", label: "Diploma" },
  { value: "DEGREE",  label: "Degree" },
  { value: "MASTER",  label: "Master" },
  { value: "PHD",     label: "PhD" },
];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "MALE",   label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER",  label: "Other" },
];

type EmployeeWithRelations = Employee & {
  department: Department | null;
  user: { roles: Role[] } | null;
};

interface Props {
  employee: EmployeeWithRelations;
  departments: Department[];
  canEdit: boolean;
}

function formatDateValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function hideEmail(email: string): string {
  return email.includes(".noemail@") ? "—" : email;
}

export function EmployeeDetailEditable({ employee, departments, canEdit }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialForm = {
    fullName: employee.name,
    email: employee.email,
    phone: employee.phone ?? "",
    dateOfBirth: formatDateValue(employee.dateOfBirth),
    gender: employee.gender,
    nationality: employee.nationality,
    nric: employee.nric ?? "",
    address: employee.address ?? "",
    educationLevel: employee.educationLevel,
    avatarUrl: employee.avatarUrl ?? "",
    departmentId: employee.departmentId ?? "",
    startDate: formatDateValue(employee.startDate),
    endDate: formatDateValue(employee.endDate),
    employmentType: employee.employmentType,
    workdays: (employee.workdays?.length ? [...employee.workdays] : [1, 2, 3, 4, 5]) as number[],
    status: employee.status,
    roles: (employee.user?.roles ?? ["STAFF"]) as Role[],
  };

  const [form, setForm] = useState(initialForm);

  function set<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleWorkday(day: number) {
    set(
      "workdays",
      form.workdays.includes(day)
        ? form.workdays.filter((d) => d !== day)
        : [...form.workdays, day]
    );
  }

  function toggleRole(role: Role) {
    set(
      "roles",
      form.roles.includes(role) ? form.roles.filter((r) => r !== role) : ([...form.roles, role] as Role[])
    );
  }

  function cancel() {
    setForm(initialForm);
    setError(null);
    setEditing(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      const j = await res.json();
      set("avatarUrl", j.url);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        personalInfo: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          nationality: form.nationality,
          nric: form.nric,
          address: form.address,
          educationLevel: form.educationLevel,
          avatarUrl: form.avatarUrl || null,
        },
        employmentInfo: {
          departmentId: form.departmentId,
          startDate: form.startDate,
          endDate: form.endDate || null,
          employmentType: form.employmentType,
          workdays: [...form.workdays].sort((a, b) => a - b),
          status: form.status,
        },
        roles: form.roles,
      };
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === form.status)!;
  const displayName = editing ? form.fullName : employee.name;
  const roleLabel = (employee.department?.name ?? "—");
  const userTypeLabel =
    (employee.user?.roles ?? []).length > 0
      ? employee.user!.roles
          .map((r) => r.charAt(0) + r.slice(1).toLowerCase())
          .join(", ")
      : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
              {form.avatarUrl ? <AvatarImage src={form.avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-transparent p-0">
                <AvatarPlaceholder gender={form.gender} />
              </AvatarFallback>
            </Avatar>
            {employee.status === "ACTIVE" && !editing && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
            )}
            {editing && canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow border-2 border-gray-950 hover:bg-primary/90 disabled:opacity-60"
                  title="Upload photo"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </>
            )}
          </div>
          <div className="text-center sm:text-left">
            {editing ? (
              <Input
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value.toUpperCase())}
                className="bg-gray-900 border-gray-800 text-white text-2xl font-bold h-auto py-1"
              />
            ) : (
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{employee.name}</h1>
            )}
            <p className="text-gray-400 mt-1">{employee.position ?? "—"}</p>
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mt-2">
              <Badge className={statusOpt.className}>{statusOpt.label}</Badge>
              <span className="text-sm text-gray-400">ID: {employee.employeeId}</span>
            </div>
          </div>
        </div>

        {canEdit && !editing && (
          <Button onClick={() => setEditing(true)} className="self-start">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Employee
          </Button>
        )}
        {canEdit && editing && (
          <div className="flex gap-2 self-start">
            <Button variant="outline" onClick={cancel} disabled={saving}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Email" icon={<Mail className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">{hideEmail(employee.email)}</p>
              )}
            </Field>
            <Field label="Phone" icon={<Phone className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">{employee.phone ?? "—"}</p>
              )}
            </Field>
            <Field label="Date of Birth" icon={<Calendar className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">
                  {employee.dateOfBirth ? format(new Date(employee.dateOfBirth), "PPP") : "—"}
                </p>
              )}
            </Field>
            <Field label="Gender">
              {editing ? (
                <Select value={form.gender} onValueChange={(v) => set("gender", v as Gender)}>
                  <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium text-white">
                  {employee.gender.charAt(0) + employee.gender.slice(1).toLowerCase()}
                </p>
              )}
            </Field>
            <Field label="Nationality">
              {editing ? (
                <Input
                  value={form.nationality}
                  onChange={(e) => set("nationality", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <Badge
                  variant="outline"
                  className={
                    /^singaporean$/i.test(employee.nationality ?? "")
                      ? "border-green-500 text-green-400 bg-green-950/30"
                      : /^(PR|permanent resident)$/i.test(employee.nationality ?? "")
                      ? "border-blue-500 text-blue-400 bg-blue-950/30"
                      : "border-amber-500 text-amber-400 bg-amber-950/30"
                  }
                >
                  {employee.nationality}
                </Badge>
              )}
            </Field>
            <Field label="Highest Education Level">
              {editing ? (
                <Select
                  value={form.educationLevel}
                  onValueChange={(v) => set("educationLevel", v as EducationLevel)}
                >
                  <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge
                  variant="outline"
                  className={
                    employee.educationLevel === "PHD"
                      ? "border-purple-500 text-purple-400 bg-purple-950/30"
                      : employee.educationLevel === "MASTER"
                      ? "border-blue-500 text-blue-400 bg-blue-950/30"
                      : employee.educationLevel === "DEGREE"
                      ? "border-green-500 text-green-400 bg-green-950/30"
                      : "border-gray-500 text-gray-400 bg-gray-950/30"
                  }
                >
                  {employee.educationLevel === "PHD"
                    ? "PhD"
                    : employee.educationLevel.charAt(0) + employee.educationLevel.slice(1).toLowerCase()}
                </Badge>
              )}
            </Field>
            <Field label="NRIC" icon={<FileText className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  value={form.nric}
                  onChange={(e) => set("nric", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">{employee.nric ?? "—"}</p>
              )}
            </Field>
            <Field label="Address" icon={<MapPin className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">{employee.address ?? "—"}</p>
              )}
            </Field>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Job Function" icon={<Building2 className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Select value={form.departmentId} onValueChange={(v) => set("departmentId", v)}>
                  <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                    <SelectValue placeholder="Select job function" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium text-white">{roleLabel}</p>
              )}
            </Field>
            <Field label="User Type">
              {editing ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {ALL_ROLES.map((r) => {
                    const active = form.roles.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => toggleRole(r.value)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          active
                            ? "bg-primary text-white border-primary"
                            : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(employee.user?.roles ?? []).length > 0 ? (
                    employee.user!.roles.map((r) => {
                      const cls =
                        r === "ADMIN"
                          ? "border-purple-500 text-purple-400 bg-purple-950/30"
                          : r === "ACCOUNTANT"
                          ? "border-green-500 text-green-400 bg-green-950/30"
                          : r === "INTERN"
                          ? "border-amber-500 text-amber-400 bg-amber-950/30"
                          : "border-blue-500 text-blue-400 bg-blue-950/30";
                      return (
                        <Badge key={r} variant="outline" className={cls}>
                          {r.charAt(0) + r.slice(1).toLowerCase()}
                        </Badge>
                      );
                    })
                  ) : (
                    <p className="font-medium text-white">—</p>
                  )}
                </div>
              )}
            </Field>
            <Field label="Start Date" icon={<Calendar className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">
                  {employee.startDate ? format(new Date(employee.startDate), "PPP") : "—"}
                </p>
              )}
            </Field>
            <Field label="End Date" icon={<Calendar className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              ) : (
                <p className="font-medium text-white">
                  {employee.endDate ? format(new Date(employee.endDate), "PPP") : "—"}
                </p>
              )}
            </Field>
            <Field label="Employment" icon={<Briefcase className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <Select
                  value={form.employmentType}
                  onValueChange={(v) => set("employmentType", v as EmploymentType)}
                >
                  <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium text-white">
                  {EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === employee.employmentType)?.label ?? "—"}
                </p>
              )}
            </Field>
            <Field label="Workdays" icon={<Calendar className="h-4 w-4 text-gray-400" />}>
              {editing ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {WORKDAY_OPTIONS.map((d) => {
                    const active = form.workdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleWorkday(d.value)}
                        title={d.full}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          active
                            ? "bg-primary text-white border-primary"
                            : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {WORKDAY_OPTIONS.map((d) => {
                    const selected = employee.workdays?.length
                      ? employee.workdays.includes(d.value)
                      : d.value >= 1 && d.value <= 5;
                    return (
                      <div key={d.value} className="flex items-center gap-1.5">
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            selected
                              ? "bg-primary border-primary"
                              : "bg-gray-900 border-gray-700"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className={`text-sm ${selected ? "text-white" : "text-gray-500"}`}>
                          {d.short}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Field>
            <Field label="Status">
              {editing ? (
                <Select value={form.status} onValueChange={(v) => set("status", v as EmployeeStatus)}>
                  <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={`${statusOpt.className} mt-1`}>{statusOpt.label}</Badge>
              )}
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm text-gray-400 font-normal">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        {icon}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
