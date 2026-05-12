import { prisma } from "@/lib/prisma";
import { getCompanyBranding } from "@/lib/company-settings";
import { getTemplateDef, type TemplateKey } from "./defaults";

export interface ResolvedTemplate {
  subject: string;
  body: string;
  isCustom: boolean; // true if loaded from DB, false if using built-in default
}

// Load a template (DB row if present, else built-in default). Does NOT
// substitute variables — call renderTemplate() for that.
export async function loadTemplate(key: TemplateKey): Promise<ResolvedTemplate> {
  const def = getTemplateDef(key);
  if (!def) throw new Error(`Unknown template key: ${key}`);

  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  if (row && row.subject && row.body) {
    return { subject: row.subject, body: row.body, isCustom: true };
  }
  return { subject: def.defaultSubject, body: def.defaultBody, isCustom: false };
}

// Replace every `{VARIABLE}` occurrence in a string with the corresponding
// value from `vars`. Unknown variables are left untouched so the user can
// see what slipped through.
export function renderTemplate(input: string, vars: Record<string, string | number | undefined | null>): string {
  return input.replace(/\{([A-Z0-9_]+)\}/g, (match, name) => {
    const v = vars[name];
    return v === undefined || v === null ? match : String(v);
  });
}

// Convenience: load + render in one go. Auto-merges common company variables
// (COMPANY_NAME, COMPANY_SHORT_NAME, SITE_URL) so callers don't have to.
export async function renderEmail(
  key: TemplateKey,
  vars: Record<string, string | number | undefined | null>,
): Promise<{ subject: string; body: string }> {
  const branding = await getCompanyBranding();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "";
  const merged = {
    COMPANY_NAME: branding.name,
    COMPANY_SHORT_NAME: branding.shortName || branding.name,
    SITE_URL: siteUrl,
    ...vars,
  };
  const { subject, body } = await loadTemplate(key);
  return {
    subject: renderTemplate(subject, merged),
    body: renderTemplate(body, merged),
  };
}

// Convert a plain-text email body into simple HTML — preserve paragraph
// breaks, linkify URLs, and replace the `{ACTION_BUTTONS}` placeholder
// (if present) with a styled Accept / Decline button pair.
export function plainTextToHtml(
  body: string,
  options: { acceptUrl?: string; declineUrl?: string } = {},
): string {
  const buttonHtml = options.acceptUrl && options.declineUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr>
        <td style="padding-right:12px;">
          <a href="${options.acceptUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;font-size:14px;display:inline-block;">Accept</a>
        </td>
        <td>
          <a href="${options.declineUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;font-size:14px;display:inline-block;">Decline</a>
        </td>
      </tr></table>`
    : "";

  const withButtons = body.replace(/\{ACTION_BUTTONS\}/g, buttonHtml);
  const linkified = withButtons.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#2563eb;">${url}</a>`,
  );
  const paragraphs = linkified
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">${paragraphs}</div>`;
}
