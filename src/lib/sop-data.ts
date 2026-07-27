// Central registry of company SOPs shown under /sop.
// Every SOP is visible to all authenticated users (staff + interns).
// To add a new SOP, append an entry here — the index and detail pages
// render entirely from this data.

export type SopLink = { label: string; href: string };

export type SopStep = {
  title: string;
  summary: string;
  details?: string[];
  links?: SopLink[];
  /** Caution / highlight rendered in an amber callout under the step. */
  note?: string;
};

export type SopReference = {
  label: string;
  value: string;
  href?: string;
};

export type Sop = {
  slug: string;
  title: string;
  category: string;
  description: string;
  /** Human-readable "last updated", e.g. "Apr 2026". */
  updated: string;
  /** Situations that trigger this SOP. */
  triggers?: string[];
  steps: SopStep[];
  references?: SopReference[];
};

export const SOPS: Sop[] = [
  {
    slug: "utap-application",
    title: "UTAP Application",
    category: "Course Funding",
    description:
      "How to submit new courses — or courses with a name change — to NTUC for UTAP (Union Training Assistance Programme) funding approval.",
    updated: "Apr 2026",
    triggers: [
      "A new course is launched (WSQ or IBF)",
      "An existing UTAP-approved course changes its name",
    ],
    steps: [
      {
        title: "Confirm the course needs a UTAP application",
        summary:
          "UTAP must be applied for whenever a course is NEW or when an approved course's NAME changes. No application is needed for unchanged courses.",
        details: [
          "Check whether the course is already approved: search it on the UTAP “Find a Course” portal.",
          "Currently under UTAP: 291 WSQ courses and 7 IBF courses.",
          "A course name change is treated like a new application — the old name must be re-submitted under the new name.",
        ],
        links: [
          {
            label: "UTAP — Find a Course",
            href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course",
          },
        ],
      },
      {
        title: "Gather the course information",
        summary:
          "Extract the official course details from TP Gateway and the Tertiary Infotech course website.",
        details: [
          "Use TP Gateway for the official course title, TGS reference number and funding validity.",
          "Use the Tertiary course website for the course description, outline and fees.",
          "The details must match TP Gateway exactly — especially the course title.",
        ],
        links: [
          { label: "TP Gateway", href: "https://www.tpgateway.gov.sg/" },
          { label: "Tertiary Courses website", href: "https://www.tertiarycourses.com.sg/" },
        ],
      },
      {
        title: "Fill up the UTAP application template",
        summary:
          "Complete the latest e2i application form (UTAP template) with the course information gathered in Step 2.",
        details: [
          "Always use the LATEST e2i template — check with the admin team for the current version before filling it in.",
          "Fill in only the editable fields.",
        ],
        note:
          "Colour code in the template: BLUE and YELLOW cells must NOT be changed. Only complete the uncoloured fields.",
      },
      {
        title: "Submit the application via email",
        summary:
          "Email the completed UTAP template to the NTUC UTAP support team for processing.",
        details: [
          "Send the completed template to UTAP_TP_Support@ntuc.org.sg.",
          "Contact person at UTAP: Shi Ying.",
          "Keep the submission email in the thread — all follow-ups happen over the same email chain.",
        ],
        links: [
          { label: "Email UTAP Support", href: "mailto:UTAP_TP_Support@ntuc.org.sg" },
          { label: "e2i website", href: "https://www.e2i.com.sg" },
        ],
      },
      {
        title: "Follow up until approved",
        summary:
          "Track the application over email and chase UTAP support if there is no response.",
        details: [
          "Follow up via the same email thread with UTAP_TP_Support@ntuc.org.sg.",
          "Once approved, verify the course appears (with the correct name) on the UTAP “Find a Course” portal.",
        ],
        links: [
          {
            label: "Verify on Find a Course",
            href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course",
          },
        ],
      },
      {
        title: "Inform Sylvia once approved",
        summary:
          "After approval is confirmed, inform Sylvia so the course page and funding information can be updated.",
        details: [
          "This is the final step of the workflow: Fill up UTAP template → apply via email → approved → inform Sylvia.",
          "Record the approval in the course tracking sheet so the next review (e.g. quarterly follow-up) picks it up.",
        ],
      },
    ],
    references: [
      {
        label: "UTAP support email",
        value: "UTAP_TP_Support@ntuc.org.sg",
        href: "mailto:UTAP_TP_Support@ntuc.org.sg",
      },
      { label: "UTAP contact person", value: "Shi Ying (NTUC UTAP team)" },
      {
        label: "Find a Course portal",
        value: "ntuc.org.sg/uportal/how-we-help/find-a-course",
        href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course",
      },
      { label: "TP Gateway", value: "tpgateway.gov.sg", href: "https://www.tpgateway.gov.sg/" },
      { label: "e2i", value: "e2i.com.sg", href: "https://www.e2i.com.sg" },
      { label: "Application form", value: "Latest e2i template (check with admin team)" },
    ],
  },
];

export function getSop(slug: string): Sop | undefined {
  return SOPS.find((s) => s.slug === slug);
}
