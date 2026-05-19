import { prisma } from "@/lib/prisma";
import { PayslipTemplateEditor } from "@/components/settings/payslip-template-editor";

export const dynamic = "force-dynamic";

export default async function PayslipTemplatePage() {
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  return (
    <PayslipTemplateEditor
      initialRemarks={settings?.payslipRemarks ?? ""}
      initialTitle={(settings as any)?.payslipTitle ?? ""}
      initialHeaderNote={(settings as any)?.payslipHeaderNote ?? ""}
      companyName={settings?.name ?? "Tertiary Infotech Academy Pte Ltd"}
      companyLogo={settings?.logo ?? null}
    />
  );
}
