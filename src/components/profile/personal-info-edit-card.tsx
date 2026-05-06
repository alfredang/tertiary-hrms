"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, Calendar, Pencil, X } from "lucide-react";
import { format } from "date-fns";
import { Gender, EducationLevel } from "@prisma/client";

const genderOptions: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const educationOptions: { value: EducationLevel; label: string }[] = [
  { value: "DIPLOMA", label: "Diploma" },
  { value: "DEGREE", label: "Degree" },
  { value: "MASTER", label: "Master's" },
  { value: "PHD", label: "PhD" },
];

interface PersonalInfoEditCardProps {
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  nationality: string | null;
  nric: string | null;
  address: string | null;
  educationLevel: EducationLevel | null;
}

export function PersonalInfoEditCard(props: PersonalInfoEditCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: props.name,
    phone: props.phone ?? "",
    dateOfBirth: props.dateOfBirth ?? "",
    gender: props.gender ?? ("" as Gender | ""),
    nationality: props.nationality ?? "",
    nric: props.nric ?? "",
    address: props.address ?? "",
    educationLevel: props.educationLevel ?? ("" as EducationLevel | ""),
  });

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleCancel = () => {
    setForm({
      name: props.name,
      phone: props.phone ?? "",
      dateOfBirth: props.dateOfBirth ?? "",
      gender: props.gender ?? "",
      nationality: props.nationality ?? "",
      nric: props.nric ?? "",
      address: props.address ?? "",
      educationLevel: props.educationLevel ?? "",
    });
    setEditing(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          nationality: form.nationality,
          nric: form.nric,
          address: form.address,
          educationLevel: form.educationLevel || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }

      toast({ title: "Profile updated", description: "Your information has been saved." });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
          {!editing ? (
            <Button
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
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-gray-300">Full Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="Full name"
              />
            </div>

            {/* Email — read-only */}
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input
                value={props.email}
                disabled
                className="bg-gray-900 border-gray-700 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500">Email cannot be changed here. Contact HR.</p>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="text-gray-300">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="e.g. 91234567"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date of Birth */}
              <div className="space-y-2">
                <Label className="text-gray-300">Date of Birth</Label>
                <DatePicker
                  value={form.dateOfBirth}
                  onChange={set("dateOfBirth")}
                />
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label className="text-gray-300">Gender</Label>
                <Select value={form.gender} onValueChange={set("gender")}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {genderOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nationality */}
              <div className="space-y-2">
                <Label className="text-gray-300">Nationality</Label>
                <Input
                  value={form.nationality}
                  onChange={(e) => set("nationality")(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="e.g. Singaporean"
                />
              </div>

              {/* NRIC */}
              <div className="space-y-2">
                <Label className="text-gray-300">NRIC</Label>
                <Input
                  value={form.nric}
                  onChange={(e) => set("nric")(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="e.g. S1234567A"
                />
              </div>
            </div>

            {/* Education Level */}
            <div className="space-y-2">
              <Label className="text-gray-300">Education Level</Label>
              <Select value={form.educationLevel} onValueChange={set("educationLevel")}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue placeholder="Select education level" />
                </SelectTrigger>
                <SelectContent>
                  {educationOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label className="text-gray-300">Address</Label>
              <Input
                value={form.address}
                onChange={(e) => set("address")(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="e.g. 123 Orchard Road, #01-01, Singapore 123456"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary hover:bg-primary/90 text-white"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white">{props.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <p className="text-white">{props.phone ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-400">Date of Birth</p>
                <p className="text-white">
                  {props.dateOfBirth
                    ? format(new Date(props.dateOfBirth), "d MMM yyyy")
                    : "—"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">Gender</p>
              <p className="text-white">
                {props.gender
                  ? genderOptions.find((o) => o.value === props.gender)?.label ?? props.gender
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Nationality</p>
              <p className="text-white">{props.nationality ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">NRIC</p>
              <p className="text-white">{props.nric ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Education Level</p>
              <p className="text-white">
                {props.educationLevel
                  ? educationOptions.find((o) => o.value === props.educationLevel)?.label ?? props.educationLevel
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Address</p>
              <p className="text-white">{props.address ?? "—"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
