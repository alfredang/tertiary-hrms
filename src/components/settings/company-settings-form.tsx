"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";
import type { CompanySettings } from "@prisma/client";

const companySettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  uen: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
});

type CompanySettingsFormData = z.infer<typeof companySettingsSchema>;

interface CompanySettingsFormProps {
  settings: CompanySettings;
}

export function CompanySettingsForm({ settings }: CompanySettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CompanySettingsFormData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: settings.name,
      uen: settings.uen || "",
      address: settings.address || "",
      phone: settings.phone || "",
      email: settings.email || "",
      website: settings.website || "",
    },
  });

  const onSubmit = async (data: CompanySettingsFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update settings");
      }

      toast({
        title: "Success",
        description: "Company settings updated successfully",
      });

      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update company settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Company Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">
                Company Name *
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="Enter company name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* UEN */}
            <div className="space-y-2">
              <Label htmlFor="uen" className="text-white">
                UEN (Unique Entity Number)
              </Label>
              <Input
                id="uen"
                {...form.register("uen")}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="e.g., 201234567A"
              />
              {form.formState.errors.uen && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.uen.message}
                </p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-white">
                Phone Number
              </Label>
              <Input
                id="phone"
                {...form.register("phone")}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="+65 1234 5678"
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="info@company.com"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website" className="text-white">
                Website
              </Label>
              <Input
                id="website"
                {...form.register("website")}
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="https://www.company.com"
              />
              {form.formState.errors.website && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.website.message}
                </p>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address" className="text-white">
              Address
            </Label>
            <Textarea
              id="address"
              {...form.register("address")}
              className="bg-gray-900 border-gray-700 text-white min-h-[100px]"
              placeholder="Enter company address"
            />
            {form.formState.errors.address && (
              <p className="text-sm text-red-400">
                {form.formState.errors.address.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={isLoading}
              className="border-gray-700 hover:bg-gray-800"
            >
              Reset
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
