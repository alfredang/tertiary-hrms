import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TEMPLATES, type TemplateKey } from "@/lib/email-templates/defaults";
import { EmailTemplateEditor } from "@/components/settings/email-template-editor";

export const dynamic = "force-dynamic";

function slugToKey(slug: string): TemplateKey | null {
  const k = slug.toUpperCase().replace(/-/g, "_") as TemplateKey;
  return k in TEMPLATES ? k : null;
}

export default async function EmailTemplateEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const key = slugToKey(slug);
  if (!key) notFound();

  const def = TEMPLATES[key];
  const row = await prisma.emailTemplate.findUnique({ where: { key } });

  return (
    <EmailTemplateEditor
      def={def}
      initialSubject={row?.subject ?? def.defaultSubject}
      initialBody={row?.body ?? def.defaultBody}
      isCustom={!!row}
    />
  );
}
