// Company SOPs shown under /sop — the seed source for the `Sop` table and the fallback list
// that src/lib/sops.ts serves while the table is empty or not yet migrated.
//
// Content is taken from Tertiary Infotech's TPQA "Training Administration Quality Management
// System" (Policy & Operations Manual, POM v4.0, effective 26 May 2025) and the TPQA evidence it
// cites (refund flowchart, website cancellation/refund policy, Marketing Code of Conduct).
// Each SOP records its source section. Wording follows the manual, condensed into numbered steps.
// Keep personal data out of this file: roles, not people; company mailboxes only; no phone numbers.
//
// To change an SOP: edit it here, then run `npx tsx scripts/seed-sops.ts --apply` (upsert by slug).

export const SOP_CATEGORIES = [
  { name: "Operations", description: "Class set-up, registration, attendance and day-to-day course administration." },
  { name: "Learner Services", description: "Course information, advisory, feedback, requests and certificates for learners." },
  { name: "Assessment", description: "Final assessment, results submission, appeals and assessment records." },
  { name: "Course Development & Quality", description: "Designing, accrediting, reviewing and improving courseware." },
  { name: "Trainers & Adult Educators", description: "Recruiting, deploying, monitoring and developing trainers and assessors." },
  { name: "Marketing", description: "SSG-compliant marketing, staff conduct and handling of violations." },
  { name: "Finance", description: "Invoicing, payouts, reconciliation and financial reporting." },
  { name: "Funding & Grants", description: "SSG training grants, SkillsFuture Credit and UTAP funding." },
  { name: "Governance & Compliance", description: "Strategy, management reviews, outcomes tracking and records." },
] as const;

export type SopCategory = (typeof SOP_CATEGORIES)[number]["name"];

export type SopLink = { label: string; href: string };

export type SopStep = {
  title: string;
  detail: string;
  /** Sub-points rendered as a bullet list under the step. */
  items?: string[];
  /** Who does this step (role). */
  owner?: string;
  /** When / deadline, e.g. "Within 1 day of receipt". */
  timing?: string;
  /** Caution rendered in an amber callout. */
  note?: string;
  links?: SopLink[];
};

export type SopReference = { label: string; value: string; href?: string };

export type Sop = {
  slug: string;
  title: string;
  category: SopCategory;
  summary: string;
  purpose?: string;
  scope?: string;
  owner?: string;
  triggers?: string[];
  steps: SopStep[];
  references?: SopReference[];
  source?: string;
  sortOrder: number;
  /** ISO timestamp of the last DB update (absent for the static fallback). */
  updatedAt?: string;
};

const POM = "TPQA Policy & Operations Manual (Training Administration QMS) v4.0, 26 May 2025";
const ENQUIRY: SopReference = {
  label: "Learner enquiries",
  value: "enquiry@tertiaryinfotech.com",
  href: "mailto:enquiry@tertiaryinfotech.com",
};

type SopInput = Omit<Sop, "sortOrder" | "updatedAt">;

const RAW: SopInput[] = [
  // ───────────────────────────── Operations ─────────────────────────────
  {
    slug: "course-run-setup-and-registration",
    title: "Course Run Set-up and Registration",
    category: "Operations",
    summary: "From the quarterly training schedule to a closed registration list and course runs created on TPG.",
    purpose: "Make sure every scheduled class is created on TPG on time and every registration is acknowledged, recorded and screened.",
    scope: "All scheduled public course runs.",
    owner: "Training Executive",
    steps: [
      { title: "Confirm the training schedule", detail: "Confirm the course schedule for the coming quarter.", owner: "Training Manager", timing: "Every quarter" },
      { title: "Create the course run via API", detail: "Create the course run on TPG via the API once the schedule is confirmed.", owner: "Training Executive", timing: "Within 14 working days of schedule confirmation" },
      { title: "Open course registration", detail: "Start registration once the training schedule is published on the website.", owner: "Training Executive", timing: "When the schedule is published" },
      {
        title: "Acknowledge the registration",
        detail: "Email the registration order to the learner to acknowledge it has been received, and send a Google Calendar invite so the learner blocks the training time.",
        owner: "Training Executive",
        timing: "Within 1 working day of registration",
      },
      {
        title: "Check prerequisites (where the course has them)",
        detail: "Email the learner to confirm they have the required prerequisite skills and knowledge. If they do not, suggest suitable courses to attain them first before registering for the intended course.",
        owner: "Training Executive / Course Advisor",
      },
      { title: "Book trainers and assessors", detail: "Send the notification / booking of trainers and assessors once there is a sign-up.", owner: "Training Executive", timing: "Once there is a sign-up" },
      { title: "Update the learner database", detail: "Update the learner's registration details in the database.", owner: "Training Executive", timing: "Within 3 working days of registration" },
      {
        title: "Request grant information (WSQ-funded courses)",
        detail: "Email the learner / sponsoring employer for their information and supporting documents for the grant application. See the SSG Funding Eligibility Check SOP.",
        owner: "Training Grant Executive",
        timing: "Within 3 working days of registration",
      },
      { title: "Close registration", detail: "Close registration for the run.", owner: "Training Executive", timing: "1 working day before the course starts" },
      {
        title: "Create sessions on TPG and enrol learners",
        detail: "Create the course run / sessions in TPG via the API with the approved session durations, verify the start and end dates against the course calendar, and enrol learners for the training grant.",
        owner: "Training Executive / Training Grant Executive",
        timing: "At least 5 working days before the course starts",
      },
    ],
    references: [{ label: "Related", value: "Pre-Class Preparation; SSG Funding Eligibility Check" }],
    source: `${POM}, Annex D.1 (items 1–10) and §1.3.2e`,
  },
  {
    slug: "pre-class-preparation",
    title: "Pre-Class Preparation",
    category: "Operations",
    summary: "Confirmation emails, course materials, Zoom details, invoices and printed documents ready before day one.",
    owner: "Training Executive",
    steps: [
      {
        title: "Send confirmation and reminder emails",
        detail: "Send the confirmation email and the reminder email to trainers, assessors and learners.",
        items: ["Confirmation email: 7 days before the course starts", "Reminder email: 2 days before the course starts"],
        owner: "Training Executive",
      },
      {
        title: "Send course materials to trainers and assessors",
        detail: "Email the course materials and the attendance sheet (for synchronous and external training) to trainers and assessors, and update their attendance URL link.",
        owner: "Training Executive",
        timing: "At least 7 days before training and assessment",
      },
      { title: "Send invoices", detail: "Send the invoice to each learner.", owner: "Finance Team", timing: "At least 5 working days before the course starts" },
      {
        title: "Prepare Learner Guides and Assessment Records",
        detail: "Send the Learner Guides and Assessment Records for printing, or set up the shared folder with learners.",
        owner: "Training Executive",
        timing: "2 working days before the course starts",
      },
      {
        title: "Send Zoom details (synchronous classes)",
        detail: "Send the Zoom meeting ID, login guide and joining instructions to learners.",
        owner: "Trainer Coordinator",
        timing: "2 working days before the course starts",
      },
      {
        title: "Send courseware to learners",
        detail: "Send the courseware and attendance-taking email, which also restates the validated course dates and learning hours.",
        owner: "Training Executive",
        timing: "First day of the course",
      },
    ],
    source: `${POM}, Annex D.1 (items 11–16) and §1.3.2e`,
  },
  {
    slug: "attendance-taking-and-monitoring",
    title: "Attendance Taking and Monitoring",
    category: "Operations",
    summary: "SingPass e-attendance, physical attendance sheets, headcounts and what to do when a learner cannot take e-attendance.",
    purpose: "Keep accurate attendance for every session; learners need at least 75% attendance to sit the Final Assessment and to be certified.",
    owner: "Trainer / Training Executive",
    steps: [
      {
        title: "Display the dynamic QR code",
        detail: "At the start of each session the trainer displays the TPG dynamic SingPass QR code (emailed to the trainer before class) and learners take e-attendance one by one via the SingPass app.",
        owner: "Trainer",
        timing: "Start of each session",
      },
      {
        title: "Check the e-attendance summary",
        detail: "Monitor the e-attendance summary page to make sure every learner's name and last 4 characters appear. If not, ask the trainer to have the learner re-take e-attendance.",
        owner: "Training Executive",
        timing: "Start of each session, before training starts",
      },
      {
        title: "Headcount and identity check",
        detail: "Do a headcount at the start and end of each session. In a physical class, check that the last 4 characters of each learner's NRIC on the attendance sheet match the digital attendance record.",
        owner: "Trainer",
      },
      {
        title: "Learner unable to take e-attendance",
        detail: "Inform the Training Executive the same day. The Training Executive takes pictures of the learner's phone error message and phone OS version, and logs an appeal for manual attendance via the SSG Service Portal.",
        owner: "Trainer / Training Executive",
        timing: "Same day",
      },
      {
        title: "Absentees",
        detail: "Notify the Training Manager or a Training Executive of any absent or missing learner. The Trainer Coordinator follows up by email or phone on rescheduling.",
        owner: "Trainer / Trainer Coordinator",
        timing: "Same day of absence",
      },
      {
        title: "Submit physical attendance sheets",
        detail: "For physical classes, submit attendance sheets to the Training Executive. After the class, the Trainer and Training Manager sign off the class attendance record, which is filed by year, month and date.",
        items: ["First day of training (confirmation of attendance)", "Last day of training (sheets for all days)", "Last day of the assessment period"],
        owner: "Trainer",
      },
    ],
    references: [{ label: "Attendance requirement", value: "Minimum 75% to sit the Final Assessment and receive a certificate / SOA" }],
    source: `${POM}, §1.3.1c, §1.3.2a, §2.1a(iv) and Annex D.1 (items 17–19)`,
  },
  {
    slug: "synchronous-e-learning-class",
    title: "Running a Synchronous e-Learning (Zoom) Class",
    category: "Operations",
    summary: "Joining, identity checks, recording, learner support and the Microsoft Teams fallback for live online classes.",
    owner: "Trainer / Training Executive",
    steps: [
      {
        title: "Send joining instructions",
        detail: "Learners receive the Zoom meeting ID, a step-by-step login guide and the meeting link by email.",
        items: [
          "Learners join with their name in the format: last 4 characters of NRIC - Full Name",
          "Video on; computer audio tested",
        ],
      },
      {
        title: "Verify identity",
        detail: "Once a learner is in the meeting, the trainer checks the name and verifies the learner through their NRIC or photo.",
        owner: "Trainer",
      },
      {
        title: "Take e-attendance",
        detail: "Learners take QR e-attendance via the SingPass app during the session; the trainer takes a screenshot of the completed attendance (with date and time).",
        owner: "Trainer",
      },
      {
        title: "Record the session",
        detail: "Cameras stay on throughout. Recording starts automatically with the class; after class the recording is uploaded to cloud storage and kept for 3 years.",
      },
      {
        title: "Support learners during class",
        detail: "The trainer supports learners through private chat, phone calls or breakout rooms; learners can use the raise-hand function. The Training Executive handles administrative and technical queries the same way.",
        owner: "Trainer / Training Executive",
      },
      {
        title: "Fall back to Microsoft Teams",
        detail: "If a technical issue is not resolved within 15 minutes, continue the class on Microsoft Teams (the backup platform).",
        timing: "After 15 minutes unresolved",
      },
    ],
    references: [{ label: "Technical helpdesk", value: "support@tertiaryinfotech.com (9:00am–7:00pm)", href: "mailto:support@tertiaryinfotech.com" }],
    source: `${POM}, §1.3.2a, §1.3.2c and §1.3.2d`,
  },
  {
    slug: "last-day-and-course-close-out",
    title: "Last Day of Class and Course Close-out",
    category: "Operations",
    summary: "TRAQOM survey, post-course email and clean-up of absentee grants and claims after the class.",
    steps: [
      {
        title: "Run the TRAQOM survey before dismissal",
        detail: "Display the static QR code for learners to submit the TRAQOM Quality Survey and remind them to complete it before class is dismissed. An automated email with the survey link and course run ID is also sent on the course end date.",
        owner: "Trainers and Assessors",
        timing: "Last day, before dismissal",
      },
      {
        title: "Send the post-course email",
        detail: "Send the course completion email covering certificates, feedback forms (TRAQOM and course feedback) and post-course support.",
        owner: "Trainer Coordinator",
        timing: "Last day of the course",
      },
      {
        title: "Absentees with SSG funding",
        detail: "Cancel or defer the training grant via TPG, and delete or revise the invoice.",
        owner: "Finance / Grant Executive",
        timing: "Within 3 working days of the revised date / cancellation",
      },
      {
        title: "Absentees paying by SkillsFuture Credit",
        detail: "Delete the SFC claim via TPG.",
        owner: "Finance / Grant Executive",
        timing: "Within 3 working days of the revised date / cancellation",
      },
    ],
    source: `${POM}, Annex D.1 (items 20, 21, 25, 26) and §3.1a`,
  },
  {
    slug: "course-information-change-approval",
    title: "Course Information Change and Approval",
    category: "Operations",
    summary: "How a change to a course's name, code, fee, skills code or duration is rolled out and approved within 5 working days.",
    triggers: ["Any change to course name, course information, course code, course fee, skills code or duration component"],
    steps: [
      {
        title: "Training Executive updates internal materials",
        detail: "On receiving the update (email / WhatsApp), update the course's Google Drive folder, courseware slides, courseware assessments and documents, and the TMS.",
        owner: "Training Executive",
      },
      {
        title: "Marketing Executive updates external materials",
        detail: "Update the brochure and the website so prospective learners see accurate information.",
        owner: "Marketing Executive",
      },
      {
        title: "Finance Executive updates finance records",
        detail: "Update the course name, course code and course fee in the finance system, and the UTAP funding records if applicable.",
        owner: "Finance Executive",
      },
      {
        title: "Manager vets and approves",
        detail: "The Manager vets and approves the changes. If an update does not meet requirements, feedback goes back to the Training, Marketing or Finance Executive for revision until it is approved.",
        owner: "Manager",
        timing: "Within 5 working days",
      },
    ],
    source: `${POM}, §1.1b`,
  },

  // ─────────────────────────── Learner Services ───────────────────────────
  {
    slug: "course-information-to-learners",
    title: "Course Information to Enrolled Learners",
    category: "Learner Services",
    summary: "Which course details go out in which email, so every enrolled learner gets the same information before class.",
    purpose: "Inform learners of dates, time, venue, fees, grants, materials and requirements before the course, and keep an audit trail of what was sent.",
    steps: [
      { title: "Calendar invite", detail: "Course date, time and venue. The same invite is updated if the start/end date or learning hours change." },
      { title: "Confirmation email", detail: "Date, time and venue, e-attendance, refund policy and withdrawal / reschedule policy." },
      { title: "Grant application email / form", detail: "Date and grant criteria; the grant application form also covers e-attendance and assessment." },
      { title: "Invoice email", detail: "Date, time, course fee and grant amount." },
      { title: "Courseware email", detail: "Date, time and venue, course material and e-attendance; sent on the first day of class." },
      { title: "Certification email", detail: "How to retrieve the Statement of Attainment (SOA)." },
      { title: "Additional email (where applicable)", detail: "Hardware / software requirements and app account set-up." },
      {
        title: "Website",
        detail: "The course page also publishes hardware / software requirements, app account, e-attendance, assessment, refund policy and withdrawal / reschedule policy.",
      },
    ],
    source: `${POM}, §1.1a`,
  },
  {
    slug: "course-confirmation-emails",
    title: "Course Confirmation Emails",
    category: "Learner Services",
    summary: "The two automated reminders learners receive 7 days and 2 days before the course starts.",
    owner: "Training Executive",
    steps: [
      {
        title: "Automated confirmation email",
        detail: "Sent automatically (Google Apps Script) 7 days before the course starts.",
        items: [
          "Course title, start date/time and training venue",
          "Technical hardware/software requirements",
          "Course materials and LMS access; things to bring",
          "SkillsFuture Credit claim (self-sponsored)",
          "Attendance-taking guidelines (SingPass e-attendance is mandatory for SSG-funded learners)",
          "How to request postponement or withdrawal; support contacts",
        ],
        timing: "7 days before",
      },
      {
        title: "Automated final confirmation email",
        detail: "Sent automatically 2 days before the course starts as a final reminder.",
        items: [
          "Course title, start date/time and training venue",
          "SkillsFuture Credit claim (self-sponsored)",
          "Attendance-taking guidelines",
          "How to request postponement or withdrawal; support contacts",
        ],
        timing: "2 days before",
      },
    ],
    source: `${POM}, §1.1c`,
  },
  {
    slug: "learner-feedback-handling",
    title: "Handling Learner Feedback and Complaints",
    category: "Learner Services",
    summary: "Closed-loop handling of general, courseware and trainer feedback with acknowledgement within 1 day and an outcome to the learner.",
    owner: "Training Executive / Manager",
    triggers: ["Feedback or a complaint received at enquiry@tertiaryinfotech.com or through course feedback"],
    steps: [
      {
        title: "Acknowledge the feedback",
        detail: "Reply to the learner and classify the feedback: general (e.g. toilet, stationery, snacks), courseware, or trainer/assessor. Escalate courseware and trainer feedback to the Manager.",
        owner: "Training Executive",
        timing: "Within 1 day of receipt",
      },
      {
        title: "General feedback: improvement plan",
        detail: "Check the feedback with the relevant party (call the learner if more information is needed), work out an improvement plan and get the Manager's approval. Monitor the outcome of the correction plan.",
        owner: "Training Executive",
        timing: "Plan within 5 days; monitor within 1 month",
      },
      {
        title: "Courseware or trainer feedback: understand it",
        detail: "Call the learner (and the trainer, for trainer feedback) if needed to understand the feedback.",
        owner: "Manager",
        timing: "Within 2 days of receipt",
      },
      {
        title: "Recommend follow-up action",
        detail: "Share courseware feedback with the course developer, or trainer feedback with the trainer/assessor, and recommend follow-up action to the course director for review and approval.",
        owner: "Manager / Course Developer",
        timing: "Within 7 days of receipt",
      },
      {
        title: "Close the loop with the learner",
        detail: "Email the learner the outcome of their feedback, then monitor the next course run.",
        owner: "Course Manager",
        timing: "Within 9 days of receipt",
      },
      {
        title: "Measure satisfaction",
        detail: "After resolving a request, feedback or appeal, ask the learner to complete the Learner Satisfaction Survey (Google form).",
        owner: "Course Advisor",
      },
    ],
    references: [ENQUIRY],
    source: `${POM}, §1.1d(i) and §3.1b`,
  },
  {
    slug: "reschedule-a-class",
    title: "Rescheduling a Learner's Class",
    category: "Learner Services",
    summary: "Moving a learner to another course date, with or without payment already made.",
    triggers: ["A learner asks to change their course date"],
    steps: [
      {
        title: "Understand the request",
        detail: "Find out the reason for the request and proactively suggest alternative course dates that suit the learner.",
        owner: "Training Executive",
      },
      { title: "Update the calendar invite", detail: "Update the learner's calendar invite to the new date.", owner: "Training Executive" },
      {
        title: "Payment not yet made",
        detail: "Handle the grant application for the new date (if applicable) and generate a new invoice for the revised date.",
        owner: "Finance Executive",
      },
      {
        title: "Payment already made",
        detail: "Cancel and re-enrol the grant application (if applicable) and adjust the invoice accordingly.",
        owner: "Finance Executive",
      },
    ],
    source: `${POM}, §1.1d(ii) Request – Reschedule`,
  },
  {
    slug: "withdrawal-and-cancellation",
    title: "Learner Withdrawal and Class Cancellation",
    category: "Learner Services",
    summary: "What to do when a learner withdraws, a company replaces a trainee, or Tertiary cancels a class.",
    steps: [
      {
        title: "Learner withdraws: payment not made",
        detail: "Delete the calendar invite and stop the registration.",
        owner: "Training Executive",
      },
      {
        title: "Learner withdraws: payment made",
        detail: "Delete the calendar invite; Finance follows the Refund Request SOP.",
        owner: "Training Executive / Finance Executive",
      },
      {
        title: "Apply the cancellation policy",
        detail: "There is no penalty for course cancellation / withdrawal. If SkillsFuture Credit was used, the registrant must cancel the SFC claim on or before the course start date in the SkillsFuture Credit portal. Course fees not paid by SFC are refunded in full (credit card, PayPal, bank transfer).",
        note: "Group training arranged with external venue booking / catering cannot be cancelled or withdrawn: the full fee is payable regardless of attendance.",
      },
      {
        title: "Replacement of trainees",
        detail: "Companies may replace a trainee who has signed up, given 3 days' notice before the course starts.",
      },
      {
        title: "Tertiary cancels or reschedules a class",
        detail: "Tertiary may cancel or change a class (e.g. minimum class size not met). Reschedule to a later date and inform registrants; if the class is cancelled before it starts and there is no rescheduled class, refund the course fee in full.",
      },
    ],
    source: `${POM}, §1.1d(ii) Request – Withdrawal; website Cancellation / Rescheduling Policy (TPQA evidence 1.2a)`,
  },
  {
    slug: "refund-request",
    title: "Refund Request",
    category: "Learner Services",
    summary: "Examining a written refund request and replying, issuing or rejecting within the set timelines.",
    owner: "Training Manager / Finance",
    triggers: ["A learner submits a refund request in writing"],
    steps: [
      { title: "Receive the request in writing", detail: "All refund requests must be submitted in writing (Course Refund Request Form) and are processed according to the refund policy." },
      { title: "Investigate the reason", detail: "Investigate the reason for the refund." },
      {
        title: "Payment not completed",
        detail: "Reject the request and reply to the customer.",
        timing: "Within 5 days",
      },
      {
        title: "Course not yet completed",
        detail: "Offer to arrange a new date or course for the learner. If the learner changes date/course, schedule the class; otherwise go on to examine the refund.",
      },
      {
        title: "Examine the refund reasons",
        detail: "The Training Manager examines whether the refund reasons are valid.",
        owner: "Training Manager",
      },
      {
        title: "Reason not valid",
        detail: "Inform the customer of the reason for rejection.",
        timing: "Within 5 days",
      },
      {
        title: "Reason valid",
        detail: "Issue the refund and update the customer.",
        owner: "Finance",
        timing: "Within 30 days",
      },
    ],
    source: `${POM}, §1.1d(ii) Refund and Annex A.11; TPQA evidence "Item 1.1d – Refund Process" flowchart`,
  },
  {
    slug: "pre-course-advisory",
    title: "Pre-Course Advisory",
    category: "Learner Services",
    summary: "Answering prospective learners within one business day with accurate course, fee, grant and requirement information.",
    owner: "Course Advisor",
    steps: [
      {
        title: "Respond to the enquiry",
        detail: "Enquiries arrive through the website, email or phone. Respond to every enquiry within one business day.",
        timing: "Within 1 business day",
      },
      {
        title: "Advise on course content and relevance",
        detail: "Use the course page and brochure: title, duration, venue, fees, mode, learning outcomes, outline, entry requirements, target audience, trainer profiles and software/hardware requirements.",
      },
      {
        title: "Explain fees and funding",
        detail: "Explain the full fee, grant eligibility, the nett fee after grants and payment modes (SkillsFuture Credit, SkillsFuture Enterprise Credit, PSEA).",
      },
      {
        title: "Explain policies and requirements",
        detail: "Refund / cancellation policy; minimum 75% attendance; SingPass e-attendance for WSQ / SFC courses; passing the assessment for WSQ courses.",
      },
      {
        title: "Confirm prerequisites",
        detail: "For courses with prerequisites, email the learner to confirm they meet them before they complete registration.",
      },
      {
        title: "Ask for feedback",
        detail: "After giving pre- or post-course advice, ask the learner to complete the learner satisfaction survey.",
      },
    ],
    references: [ENQUIRY],
    source: `${POM}, §1.2a and §3.1c`,
  },
  {
    slug: "learner-screening-and-profiling",
    title: "Learner Screening and Profiling",
    category: "Learner Services",
    summary: "Screening registrations for prerequisites and suitability, and tracking attrition and passing rates monthly.",
    owner: "Course Advisor",
    steps: [
      { title: "Route registrations to an advisor", detail: "Every registration is routed to a training advisor, who screens the learner and advises on funding and completion requirements." },
      { title: "Check prerequisites", detail: "Verify the learner's prerequisite knowledge and highest qualification from the grant application form." },
      {
        title: "Check aptitude for advanced courses",
        detail: "For specialised courses (e.g. Python Intermediate, Advanced Xero for Non-Finance Professionals), hold a brief phone interview on relevant experience.",
      },
      {
        title: "Record withdrawals",
        detail: "If a learner withdraws before completion, the trainer or course advisor investigates the reason and records it on the attendance sheet.",
        owner: "Trainer / Course Advisor",
      },
      {
        title: "Act on failed assessments",
        detail: "The trainer immediately reports a failed assessment to the course advisor and advises whether the learner needs further coaching before re-assessment is arranged.",
        owner: "Trainer",
      },
      {
        title: "Review benchmarks monthly",
        detail: "Monitor attrition rate, passing rate, education level and age group; if a trend emerges for a group, refine the screening criteria.",
        timing: "Monthly",
      },
    ],
    source: `${POM}, §2.2a`,
  },
  {
    slug: "post-course-advisory-support",
    title: "Post-Course Advisory and Support",
    category: "Learner Services",
    summary: "The course completion email and the support channels learners can use after class.",
    owner: "Course Advisor",
    steps: [
      {
        title: "Send the course completion email",
        detail: "Covers digital certificates, feedback forms (TRAQOM and course feedback), post-course support channels, Google reviews and related courses.",
        timing: "Last day of the course",
      },
      {
        title: "Support learners on request",
        detail: "Through the hotline, WhatsApp, the Tertiary Courses GPT, email or a visit to the training centre at Woods Square: advise on certification, course content, upskilling and career progression, and recommend related courses.",
      },
      { title: "Print certificates on request", detail: "Learners may ask for printed copies of their e-certificates." },
    ],
    references: [ENQUIRY],
    source: `${POM}, §1.2b`,
  },
  {
    slug: "e-certificate-and-soa-requests",
    title: "e-Certificate and SOA Requests",
    category: "Learner Services",
    summary: "Helping a learner who cannot download their WSQ Statement of Attainment or needs a copy.",
    owner: "Training Executive",
    steps: [
      {
        title: "Tell learners where to find it",
        detail: "Learners who pass a WSQ assessment can download the SOA e-certificate from the MySkillsFuture portal about 3–4 weeks after course completion (stated in the course completion email).",
        links: [{ label: "MySkillsFuture", href: "https://www.myskillsfuture.gov.sg/" }],
      },
      { title: "Verify the learner's profile", detail: "On request, verify the learner's name, NRIC, course attended and assessment result." },
      { title: "Download from TPG", detail: "Log in to TPG and download a copy of the e-certificate." },
      {
        title: "Send the copy",
        detail: "Email the PDF for a soft-copy request; for a hard copy, print it and hand it over at the counter or mail it to the learner's mailing address.",
        timing: "Upon request",
      },
    ],
    source: `${POM}, §1.3.1b and Annex D.1 (item 28)`,
  },
  {
    slug: "course-advisor-training",
    title: "Training and Monitoring Course Advisors",
    category: "Learner Services",
    summary: "Onboarding new course advisors with a checklist, on-the-job training and ongoing monitoring.",
    owner: "Senior Course Advisor / Manager",
    steps: [
      {
        title: "Onboard with the training checklist",
        detail: "A senior advisor or manager guides the new advisor through the New Staff Training Checklist.",
        items: [
          "Navigating the website, online registration and course search",
          "Available grants and subsidies and their eligibility criteria",
          "Recommending courses by skill set, industry, software and job role",
        ],
      },
      { title: "On-the-job training", detail: "The new advisor works under a senior course advisor, who sits nearby and observes service delivery." },
      { title: "Monitor emails", detail: "Senior advisors are copied on all customer emails so they can give real-time feedback and coaching." },
      { title: "Coach or retrain", detail: "Where performance is lacking, provide additional coaching or re-training." },
      { title: "Brief the team on changes", detail: "Hold regular team meetings on policy changes (e.g. GST, SingPass e-attendance) and new initiatives." },
    ],
    source: `${POM}, §1.2c`,
  },

  // ───────────────────────────── Assessment ─────────────────────────────
  {
    slug: "final-assessment-scheduling",
    title: "Final Assessment Scheduling and Reassessment",
    category: "Assessment",
    summary: "Informing candidates of their Final Assessment slot, handling swaps and medical absence, and arranging reassessment.",
    steps: [
      { title: "Inform the FA schedule", detail: "Inform candidates of their Final Assessment (FA) schedule on the final day of training.", owner: "Trainer", timing: "Final day of training" },
      { title: "Check eligibility", detail: "Candidates need at least 75% attendance to sit the FA." },
      {
        title: "Candidate cannot attend",
        detail: "A candidate with a valid reason must notify the trainer immediately. The trainer swaps the slot with another candidate and updates the Training Manager.",
        owner: "Trainer",
      },
      { title: "Medical absence", detail: "A candidate who misses the FA through illness, with a valid medical certificate, is rescheduled to a later date." },
      {
        title: "Late for an online assessment",
        detail: "Admin support phones the learner and helps them into Zoom; a learner more than 15 minutes late may need the assessment rescheduled.",
      },
      {
        title: "Not Yet Competent",
        detail: "The trainer reports the result to the course advisor immediately and advises whether further coaching is needed before re-assessment. The candidate may also appeal (see Assessment Appeal SOP).",
        owner: "Trainer",
      },
    ],
    source: `${POM}, §1.1d (Final Assessment), §1.3.1c, §1.3.2f and §2.2a(iv)`,
  },
  {
    slug: "e-assessment-identity-verification",
    title: "Assessment Identity Verification",
    category: "Assessment",
    summary: "Authenticating learners and recording attendance for physical and online (Zoom) assessments.",
    owner: "Assessor",
    steps: [
      { title: "Check the candidate list", detail: "Online: only learners on the list provided to the assessor may join; learners must use their registered name." },
      { title: "Verify identity", detail: "Check the learner's name against their NRIC or photo." },
      { title: "Take assessment attendance", detail: "Learners log in to SingPass and scan the assessment QR attendance; the assessor checks it via the assessment attendance link." },
      {
        title: "Run the e-assessment",
        detail: "Release the e-assessment via Zoom chat. Cameras capture face and upper body and stay on until submission; the assessment is completed in one session without breaks. Oral clarification follows in a breakout room.",
      },
      { title: "Keep the recording", detail: "Zoom cloud recording runs for the whole session and is kept for 3 years." },
    ],
    source: `${POM}, §1.3.2f`,
  },
  {
    slug: "submit-assessment-results-to-tpg",
    title: "Submitting Assessment Results to TPG",
    category: "Assessment",
    summary: "Completing, checking and uploading assessment records and results to the Training Partners Gateway.",
    owner: "Assessor / Training Executive",
    steps: [
      { title: "Complete assessment records", detail: "Assessors check and complete the assessment records.", owner: "Assessor", timing: "Same day as the assessment" },
      {
        title: "Submit the records",
        detail: "Upload the soft copy to the course's Google Drive assessment folder and hand the physical copy to the Training Executive.",
        owner: "Assessor",
        timing: "Within 5 working days of the assessment",
      },
      {
        title: "Check and verify",
        detail: "Check the records for accuracy. If there are gaps, inform the assessor to correct them.",
        owner: "Training Executive",
      },
      {
        title: "Decide the outcome",
        detail: "Check attendance and assessment criteria: if both are met, update the learner as Competent; otherwise Not Yet Competent.",
        owner: "Training Executive",
      },
      {
        title: "Upload results to TPG",
        detail: "Upload the results to TPG via the API and record the assessment number and upload date in the database.",
        owner: "Training Executive",
        timing: "Within 7 working days of the assessment",
      },
      {
        title: "Grant check after completion",
        detail: "Update the training grant payment status in TPG via the API and check the assessment date (WSQ courses).",
        owner: "Training Grant Manager",
        timing: "Within 14 days of course completion",
      },
    ],
    source: `${POM}, §1.3.1a, §1.3.1b and Annex D.1 (items 22–24, 27)`,
  },
  {
    slug: "assessment-appeal",
    title: "Assessment Appeal",
    category: "Assessment",
    summary: "How a candidate assessed Not Yet Competent appeals or requests reassessment, and how the Appeal Panel decides.",
    owner: "Training Manager",
    triggers: ["A candidate disagrees with a Not Yet Competent (NYC) outcome"],
    steps: [
      {
        title: "Confirm the outcome with the candidate",
        detail: "When giving feedback, the assessor asks whether the candidate agrees with the outcome. If both agree, both sign the Assessment Summary Record; a candidate who disagrees does not sign.",
        owner: "Assessor",
      },
      {
        title: "Notify the intention to appeal",
        detail: "The candidate discusses the matter with the assessor and, if still unsatisfied, notifies the assessor, who informs the Training Manager.",
        owner: "Assessor",
      },
      {
        title: "Lodge the appeal in writing",
        detail: "The candidate submits the Assessment Appeal Form / letter with detailed grounds to the Training Manager.",
        timing: "Within 1 week of the assessment date",
      },
      {
        title: "Collect information",
        detail: "Collect information from the candidate and the assessor on the Review of Assessment Appeal Case Form, together with the assessor's Assessment Record Forms.",
        owner: "Training Manager",
      },
      {
        title: "Appeal Panel decides",
        detail: "The panel (Director, Training Manager, Finance / Grant Manager) reviews the appeal and decides: no change to NYC (candidate signs the Assessment Record Forms), or reassessment.",
        timing: "Outcome within 14 working days",
      },
      {
        title: "Reassessment",
        detail: "If recommended, conduct the reassessment; the outcome either remains NYC or is reversed to Competent with supporting reasons.",
        timing: "Within 2 weeks of the panel's decision",
      },
      {
        title: "Advise and file",
        detail: "Prepare formal advice to the candidate, send them a copy and file all appeal documentation in the Appeal File. All parties abide by the panel's outcome.",
        owner: "Training Manager",
      },
    ],
    source: `${POM}, §1.1d(iii) and Annexes A.13–A.14`,
  },
  {
    slug: "assessment-records-filing",
    title: "Assessment and Attendance Records Filing",
    category: "Assessment",
    summary: "Where assessment records, summary records and attendance records are kept, and how often they are filed.",
    owner: "Training Executive",
    steps: [
      {
        title: "Online classes",
        detail: "Trainers upload completed Assessment Records and Assessment Summary Records to Google Drive, organised by course, assessment date and trainer, and notify the Training Executive, who verifies the folders.",
      },
      {
        title: "Physical classes",
        detail: "Trainers hand the completed records to the Training Executive, who verifies them and files them in ring binders by year, month and date of assessment.",
        timing: "Filed every two weeks",
      },
      { title: "Class attendance records", detail: "Signed off by the trainer and Training Manager after each class and filed by year, month and date.", timing: "Filed every few days" },
      { title: "Restrict access", detail: "Assessment evidence, record forms, summary forms and appeal forms sit in each course's assessment subfolder with access limited to authorised staff." },
    ],
    source: `${POM}, §2.1 and §2.1a(ii)–(iv)`,
  },

  // ─────────────────────── Course Development & Quality ───────────────────────
  {
    slug: "new-course-development",
    title: "New Course Development and WSQ Accreditation",
    category: "Course Development & Quality",
    summary: "Planning a new course with stakeholders, designing it to WSQ requirements and submitting the course proposal to SSG (ADDIE model).",
    owner: "Course Development",
    steps: [
      {
        title: "Analyse the need",
        detail: "Run a course survey / interview with relevant stakeholders to analyse the need and relevance of the proposed course, identify performance gaps and confirm the new course (Annex B.6).",
      },
      {
        title: "Design the course",
        detail: "Define the content to WSQ requirements.",
        items: [
          "Clear, measurable learning outcomes using action verbs (produce, explain, compile, identify, create, analyse)",
          "Admission requirements pitched at the target audience",
          "Course scope: sequence of learning units and why; resources, facilities and equipment",
          "Assessment that meets the Principles of Assessment and Rules of Evidence",
          "Optimum duration, considering attention span, interactivity and amount of content",
        ],
      },
      { title: "Submit the course proposal", detail: "Submit the course proposal to SSG for approval and accreditation (Annex B.7 template)." },
      {
        title: "Develop the course materials",
        detail: "Profile the learners and choose instructional and assessment methods (Training Profiling Form, Annex B.8); research and contextualise the materials to the approved proposal and industry needs, following WSQ requirements.",
      },
      {
        title: "Review by the WSQ Committee",
        detail: "Send the final draft to the WSQ Committee for review using the Pre-Delivery Course Materials Evaluation Checklist (Annex B.9), then incorporate the recommendations.",
      },
      { title: "Publish on the LMS", detail: "Make training content and resources available to learners on Google Classroom." },
    ],
    source: `${POM}, §2 (Course Quality Assurance) and §2.1a(viii)`,
  },
  {
    slug: "courseware-development-and-review",
    title: "Courseware Development, Vetting and Updates",
    category: "Course Development & Quality",
    summary: "Building courseware from the approved proposal, vetting it against WSQ standards, piloting it and keeping it current.",
    owner: "Course Manager",
    steps: [
      {
        title: "Develop the courseware",
        detail: "Develop the courseware from the SSG-approved course proposal using standard WSQ templates: training materials, lesson plan, learner guide, facilitator guide and assessment plan.",
        timing: "Within a month of approval",
      },
      {
        title: "Vet against WSQ standards",
        detail: "The Course Manager checks the courseware is aligned with WSQ standards and the approved proposal; if not, it is revised.",
        owner: "Course Manager",
      },
      { title: "Review with trainers", detail: "Review the courseware with trainers for accuracy, relevance and instructional effectiveness." },
      { title: "Store in Google Drive", detail: "Store the finalised courseware and the approved course proposal in the course's Google Drive folder; track reviews and validation checklists in Notion." },
      { title: "Observe the first run", detail: "An observer sits in on the first class run; refine the courseware from the observations and trainer feedback." },
      {
        title: "Apply changes",
        detail: "When the template or course code changes, the Course Manager notifies the Training Executive to revise all courseware to the latest version.",
      },
    ],
    source: `${POM}, §2.1a and §2.1a(v)–(vii), (x)`,
  },
  {
    slug: "annual-courseware-review",
    title: "Annual Courseware Review and Assessment Validation",
    category: "Course Development & Quality",
    summary: "The yearly December review of existing course materials and post-assessment validation.",
    owner: "Course Manager / Training Manager",
    steps: [
      {
        title: "Review course materials every December",
        detail: "Review and update existing materials so they meet learners' needs and regulatory changes, using the Post-Delivery Course Materials Evaluation Checklist (Annex B.10).",
        timing: "Annually, December",
      },
      { title: "Check vendor updates", detail: "Update content when vendors such as AWS, CompTIA and Microsoft release changes (typically annually)." },
      {
        title: "Validate the assessments",
        detail: "Run post-assessment validation on the assessment process, methods and tools, and the evidence collected.",
        items: ["Assessment Process Validation Checklist (B.11)", "Assessment Methods and Tools Validation Checklist (B.12)", "Assessment Evidence Validation Checklist (B.13)"],
      },
    ],
    source: `${POM}, §2 (Review Existing Course Materials) and §2.4a(i)`,
  },
  {
    slug: "courseware-pdca-cycle",
    title: "Courseware Quality PDCA Cycle",
    category: "Course Development & Quality",
    summary: "Plan-Do-Check-Act review of courseware using ratings and feedback, with document control on every update.",
    owner: "Training Manager",
    steps: [
      {
        title: "Plan (analyse)",
        detail: "Plan courseware updates: compile course evaluations, monitor ratings below target, get content updates from vendors (AWS, CompTIA, Microsoft).",
        owner: "Training Executive / Training Manager",
        timing: "Annually, or when SSG confirms the courseware",
      },
      {
        title: "Do (implement)",
        detail: "Develop and integrate the updates into the courseware in line with industry standards.",
        owner: "Training Executive / Trainers & Assessors / General Manager",
        timing: "Throughout the year",
      },
      {
        title: "Check (monitor, review)",
        detail: "Review monthly reports, compare actual vs planned ratings, investigate low ratings through surveys or direct feedback, and discuss follow-up actions with stakeholders. Document notes, matters arising and follow-ups.",
        owner: "Training Manager / Training Executive",
        timing: "Monthly",
      },
      {
        title: "Act (improve)",
        detail: "Update the AP / LP / FG / LG, standardise best practices and carry open issues into the next cycle.",
        owner: "Training Manager / Training Executive",
        timing: "After evaluation of results",
      },
      {
        title: "Apply document control",
        detail: "Slides: put the version in the file name and on the first slide. AP, FG, LG and LP: record each revision with version number, effective date, description of changes and the person responsible.",
      },
    ],
    source: `${POM}, §2.4a`,
  },

  // ─────────────────────── Trainers & Adult Educators ───────────────────────
  {
    slug: "trainer-recruitment-and-induction",
    title: "Trainer Recruitment, Selection and Induction",
    category: "Trainers & Adult Educators",
    summary: "From trainer application to interview, contract and onboarding briefing.",
    owner: "HR / Training Manager",
    steps: [
      { title: "Receive the application", detail: "Applicants fill in the Singapore Trainer Application Form and send their CV, ACLP certificate and credentials." },
      {
        title: "Screen the CV",
        detail: "HR screens CVs against the recruitment criteria and passes shortlisted CVs to the Training Manager.",
        items: [
          "Trainer / Assessor: WPL level 5, a diploma or equivalent; WSQ ACLP or equivalent; 3 years' relevant industry or adult-training experience",
          "Course / Curriculum Developer: WSQ DACE; 5 years' relevant industry or adult-training experience",
        ],
        owner: "HR",
      },
      {
        title: "Interview",
        detail: "Arrange a physical or virtual interview with the Training Manager and HR; ask the applicant to bring documents for verification. Record the evaluation on the Interview / Selection Evaluation Form (Annex B.2 / B.3).",
        owner: "HR / Training Manager",
      },
      { title: "Notify the outcome", detail: "Notify applicants. Successful applicants receive the trainer contract to sign.", owner: "HR Manager" },
      {
        title: "Onboard the trainer",
        detail: "The Training Manager briefs the new trainer on training policies and procedures, the code of conduct, course materials, tools and platforms, SingPass e-attendance and the TRAQOM survey, and gives access to the Trainer Onboarding Google Classroom.",
        owner: "Training Manager",
      },
      { title: "Record the trainer", detail: "Record qualifications, skill sets, certifications and competencies in Notion (and Google Drive) for deployment." },
    ],
    source: `${POM}, §2.3a and Annexes B.1–B.3`,
  },
  {
    slug: "trainer-deployment",
    title: "Trainer Deployment and Assignment",
    category: "Trainers & Adult Educators",
    summary: "Assigning trainers to classes through the TMS (highest-rated first), with manual intervention when no one is available.",
    owner: "Training Manager",
    steps: [
      {
        title: "Automatic assignment",
        detail: "The TMS assigns trainers by availability, qualifications and course requirements, giving priority to the highest-rated trainers; if they are unavailable, the next best-rated eligible trainer is assigned.",
      },
      {
        title: "No suitable trainer",
        detail: "The system alerts the Training Manager, who assigns an available qualified trainer, reschedules the session or finds another solution.",
        owner: "Training Manager",
      },
      {
        title: "Confirm by calendar invite",
        detail: "Trainers are notified by Google Calendar invite and email with course details, schedule and materials, and confirm by accepting the invite.",
      },
      {
        title: "Give access to materials",
        detail: "After acceptance, grant access to the courseware and assessment materials.",
        timing: "At least 1 week before the course starts",
      },
      { title: "Monitor monthly", detail: "Track success/failure rate, error rate and time to deploy a trainer.", timing: "Monthly" },
    ],
    source: `${POM}, §2.3b`,
  },
  {
    slug: "trainer-monitoring-and-appraisal",
    title: "Trainer Monitoring and Appraisal",
    category: "Trainers & Adult Educators",
    summary: "Monthly review of trainer ratings, classroom observations for low ratings, and feedback to the trainer.",
    owner: "Training Manager / HR",
    steps: [
      { title: "Review ratings monthly", detail: "Monitor trainer ratings from course feedback forms (immediate) and TRAQOM (monthly); record overall ratings in Notion.", timing: "Monthly" },
      {
        title: "Flag low ratings",
        detail: "A rating of 3 or below, or negative learner feedback, raises a red flag: HR gathers learner insights and a classroom observation is arranged.",
      },
      { title: "Schedule the observation", detail: "Tell the trainer / assessor the observation schedule in advance.", timing: "At least 2 weeks ahead" },
      {
        title: "Observe and give feedback",
        detail: "The Senior Training Manager or HR observes and gives feedback on strengths and areas to improve, e.g. deviation from the lesson plan or learning objectives, or pace (too fast / too slow). Use the Trainer / Assessor Competencies Checklists (Annex B.4 / B.5).",
      },
      { title: "Improvement plan", detail: "Put targeted performance-improvement plans in place and closely monitor the trainer's next course evaluations." },
    ],
    source: `${POM}, §2.3c`,
  },
  {
    slug: "trainer-development",
    title: "Trainer Development (Train-the-Trainer)",
    category: "Trainers & Adult Educators",
    summary: "Preparing trainers for a new course and keeping their training records.",
    owner: "Training Manager",
    steps: [
      { title: "Run Train-the-Trainer", detail: "Arrange a Train-the-Trainer session before a trainer conducts a new course, as needed, covering content, methods and assessment criteria." },
      { title: "Record attendance", detail: "Trainers sign the Train-the-Trainer attendance record as proof of completion." },
      { title: "Give access", detail: "Grant access to the course's Google Drive folder and the Google Classroom (LMS)." },
      { title: "Share training opportunities", detail: "Identify suitable external training and share it with all adult educators (annual training calendar)." },
      { title: "Document certifications", detail: "Record training and certifications; continue to monitor trainer and course ratings through course surveys and TRAQOM." },
    ],
    source: `${POM}, §2.3d`,
  },
  {
    slug: "trainer-intervention",
    title: "Trainer and Assessor Intervention",
    category: "Trainers & Adult Educators",
    summary: "Checking assessment integrity and acting on feedback or breaches of the code of conduct or marketing policy.",
    owner: "Training Manager",
    triggers: ["Feedback about a trainer or assessor", "Suspected breach of SSG guidelines or the marketing policy"],
    steps: [
      { title: "Brief on codes of conduct", detail: "Brief every trainer and assessor on the code of conduct for assessors and for marketing." },
      { title: "Spot-check assessment records", detail: "Randomly check assessment records to make sure answers are not the same across a class." },
      {
        title: "Investigate feedback",
        detail: "Check with the trainee / trainer whether the feedback is valid. For a suspected SSG-guideline breach, check the assessment records for abnormalities and sit in on the assessor's class unannounced.",
      },
      { title: "Follow up", detail: "If valid, take follow-up action with the assessor (counselling, adherence to the code of conduct) and observe upcoming classes." },
      { title: "Report and escalate", detail: "Report findings to stakeholders; escalate repeated issues to more severe action, such as disciplinary measures." },
      {
        title: "Marketing policy breaches",
        detail: "Act immediately if a trainer markets WSQ courses without written authorisation, under a partner, affiliated or personal name, or offers money, rebates or gifts for sign-ups.",
        note: "Any breach of the marketing policy is a material breach of the trainer agreement and may lead to immediate termination.",
      },
    ],
    source: `${POM}, §2.3e and §1.5b (Marketing Policies)`,
  },

  // ───────────────────────────── Marketing ─────────────────────────────
  {
    slug: "marketing-materials-ssg-compliance",
    title: "Marketing Materials: SSG Compliance Review",
    category: "Marketing",
    summary: "Creating marketing assets and getting them vetted against the SSG Marketing Guidelines Checklist before release.",
    owner: "Marketing Executive / Course Manager",
    triggers: ["A new course or event", "A newsletter or roadshow promotion"],
    steps: [
      { title: "Check training is done", detail: "The Marketing Executive must have completed the training package and signed the code of conduct before producing assets." },
      {
        title: "Choose courses and create assets",
        detail: "Select courses for general promotion (e.g. MailerLite newsletters) or to match a roadshow theme, then create the assets manually or by automation.",
        owner: "Marketing Executive",
      },
      {
        title: "Vet against the SSG checklist",
        detail: "The Course Manager reviews the assets with the SSG Marketing Guidelines Checklist and keeps a vetting record.",
        items: [
          "No SSG / SkillsFuture logos or “SkillsFuture Approved” (“SFC-eligible” may be used)",
          "ACRA name, UEN, SSG-approved course title and duration, full and nett fees, subsidy period and mode of training shown",
          "No “free” / “paid by the government”, referral rewards, lucky draws, gifts or vouchers",
          "No superlatives, job guarantees or misleading claims; testimonials traceable",
          "Never ask for a learner's SingPass password or user ID",
        ],
        owner: "Course Manager",
      },
      { title: "Revise or approve", detail: "Assets that are not acceptable go back to marketing for revision until approved." },
      { title: "Publish", detail: "Upload to the website, send by automation or newsletter, post on social media, or print." },
      { title: "Annual check", detail: "Review the course website and standard brochure against the checklist every year.", owner: "Marketing Manager", timing: "Annually" },
    ],
    source: `${POM}, §1.5a, §1.5d, §3.1f and Annex A.15`,
  },
  {
    slug: "marketing-violation-handling",
    title: "Handling a Marketing Violation",
    category: "Marketing",
    summary: "Investigating reported marketing violations, stopping the practice and taking corrective action.",
    owner: "Course Manager",
    triggers: ["Feedback on a possible marketing violation from staff, customers or a regulator"],
    steps: [
      { title: "Acknowledge", detail: "The Marketing Executive acknowledges the reported issue.", owner: "Marketing Executive" },
      { title: "Investigate", detail: "Review the materials, communications and processes against the SSG guidelines and company standards.", owner: "Course Manager" },
      { title: "No violation", detail: "Document the finding and close the case." },
      { title: "Violation found", detail: "Stop the marketing practice immediately, then take corrective measures: revise materials, fix process gaps or give additional training." },
      { title: "Verify and monitor", detail: "Check the corrective actions worked, monitor future marketing activity and keep records of the whole case.", owner: "Course Manager" },
    ],
    source: `${POM}, §1.5e(ii)`,
  },
  {
    slug: "marketing-staff-onboarding-and-conduct",
    title: "Marketing Staff Onboarding and Code of Conduct",
    category: "Marketing",
    summary: "Training marketing staff and agents on SSG guidelines, the Marketing Code of Conduct and ongoing oversight.",
    owner: "Marketing Manager",
    steps: [
      {
        title: "Brief on SSG guidelines",
        detail: "Brief every new marketing team member on the SSG Marketing Guidelines (course details, disclaimers and attributions, no misleading claims) and give them a copy.",
      },
      {
        title: "Acknowledge the Code of Conduct",
        detail: "Marketing executives formally acknowledge the Marketing Code of Conduct; for marketing agents it is written into their contract.",
        items: [
          "Comply with SSG regulations and funding requirements",
          "Represent course details, eligibility, grants and subsidies accurately",
          "Use inclusive, respectful language and respond promptly to enquiries",
          "Respect learner privacy; disclose nothing sensitive without consent",
          "Avoid conflicts of interest and declare them immediately",
        ],
      },
      {
        title: "Keep materials current",
        detail: "Hold regular meetings to brief staff and agents on changes in course dates, times, fees or venues, and on SSG guideline updates; revise materials promptly.",
      },
      {
        title: "Oversee communications",
        detail: "The Manager is copied on all marketing-related emails to monitor tone, accuracy and professionalism and correct issues in time.",
        owner: "Manager",
      },
    ],
    source: `${POM}, §1.5b, §1.5c, §1.5e(i), §3.1f; Marketing Code of Conduct (TPQA evidence 1.5b)`,
  },

  // ───────────────────────────── Finance ─────────────────────────────
  {
    slug: "learner-invoicing",
    title: "Learner Invoicing and Adjustments",
    category: "Finance",
    summary: "Issuing invoices before class, SFC invoices, and revising invoices for reschedules and absentees.",
    owner: "Finance Team",
    steps: [
      { title: "Issue the invoice", detail: "Create the invoice in QuickBooks and send it to the learner.", timing: "At least 5 working days before the course starts" },
      {
        title: "SkillsFuture Credit payments",
        detail: "For SFC-eligible courses the Training Grant Executive confirms whether the learner will pay the nett fee by SFC; the invoice then shows payment by SFC and the SFC claim amount.",
      },
      { title: "Check the SFC claim", detail: "Check that the learner's SFC claim submission is approved.", timing: "Within 5 days before the course starts" },
      { title: "Reschedules", detail: "Not paid: issue a new invoice for the revised date. Paid: adjust the invoice and re-enrol the grant." },
      { title: "Absentees", detail: "Cancel or defer the training grant / delete the SFC claim via TPG and delete or revise the invoice.", timing: "Within 3 working days of the revised date / cancellation" },
    ],
    source: `${POM}, §1.1d(ii), §1.4.2a and Annex D.1 (items 15, 25, 26, 29)`,
  },
  {
    slug: "sfc-payout-and-grant-reconciliation",
    title: "SFC Payout and Training Grant Reconciliation",
    category: "Finance",
    summary: "Weekly SkillsFuture Credit payout requests, recording SSG grant payments and chasing outstanding grants on TPG.",
    owner: "Finance Team",
    steps: [
      { title: "Check and submit Ready for Payout SFC", detail: "Check for SFC claims marked 'Ready for Payout' on TPG and submit them.", timing: "Weekly" },
      { title: "Check payout disbursements", detail: "Check TPG notifications for SFC payout request disbursements.", timing: "Weekly" },
      {
        title: "Record the payment",
        detail: "On a payout notification, generate the SFC report or the SSG TG financial transaction report from TPG and receive the payment in QuickBooks.",
      },
      { title: "Reconcile with the bank", detail: "Reconcile the SFC payout / SSG TG disbursement with the bank statement and receive payment.", timing: "Within 2 days" },
      {
        title: "Chase outstanding grants",
        detail: "Generate the overdue invoice report and check each outstanding SSG TG / SFC item.",
        items: [
          "SFC payout not triggered: check with SSG",
          "Grant cancelled: delete the grant invoice",
          "Grant processing and criteria met: check with SSG",
          "Course completed but unpaid: log an appeal case with SSG",
        ],
      },
    ],
    source: `${POM}, §1.4.2a–b (Monitoring Outstanding Training Grants on TPGateway) and Annex D.1 (items 30–33)`,
  },
  {
    slug: "financial-reports-review",
    title: "Financial Reports Review",
    category: "Finance",
    summary: "Regular review of the aging report, P&L and GST report to catch overdue payments and errors early.",
    owner: "Finance Manager",
    steps: [
      { title: "Aging report", detail: "Track outstanding receivables and payables, prioritise overdue invoices for collection and plan cash flow; agree follow-up actions.", timing: "Weekly or monthly" },
      { title: "Profit and loss", detail: "Review revenue trends, cost drivers and net profit against expectations.", timing: "Monthly" },
      { title: "GST report", detail: "Verify every transaction carries the correct GST code before filing." },
      { title: "Act on issues", detail: "Raise overdue payments or budget deviations with management and agree corrective actions." },
    ],
    source: `${POM}, §1.4.2b`,
  },
  {
    slug: "finance-staff-training",
    title: "Finance Staff Training",
    category: "Finance",
    summary: "What every finance staff member is trained on: QuickBooks, TPGateway grants, SFC and grant tracking.",
    owner: "Finance Manager",
    steps: [
      { title: "QuickBooks", detail: "Creating accurate, compliant invoices and recording and reconciling payments received." },
      { title: "Applying SSG training subsidies on TPGateway", detail: "Applying for subsidies in line with SSG guidelines and preparing the required documents." },
      { title: "SkillsFuture Credit on TPGateway", detail: "Verifying SFC payments and requesting disbursements." },
      { title: "Monitoring outstanding grants", detail: "Tracking pending or incomplete claims and following up discrepancies or delays (see SFC Payout and Training Grant Reconciliation)." },
    ],
    source: `${POM}, §1.4.2a`,
  },

  // ─────────────────────────── Funding & Grants ───────────────────────────
  {
    slug: "ssg-funding-eligibility-check",
    title: "SSG Funding Eligibility Check",
    category: "Funding & Grants",
    summary: "Deciding a learner's SSG funding route (self- or employer-sponsored) and collecting the grant application form.",
    owner: "Training Grant Executive",
    triggers: ["A course registration order is received for an SSG-funded course"],
    steps: [
      { title: "Is the course SSG-funded?", detail: "If not, no grant processing is needed." },
      { title: "Check citizenship and age", detail: "Only Singapore Citizens and PRs aged 21 and above are eligible for SSG funding." },
      {
        title: "Self-sponsored learner",
        detail: "Ask the learner to submit the SSG grant application form with their information.",
        timing: "Within 3 working days of registration",
      },
      {
        title: "Employer-sponsored learner",
        detail: "Ask for the SSG grant application form with the learner's and employer's information, and supporting documents showing the learner is a direct employee.",
        timing: "Within 3 working days of registration",
      },
      {
        title: "Remind if no form is submitted",
        detail: "Email the learner about SSG funding and its eligibility criteria and remind them to submit the grant application if they are eligible.",
        note: "By submitting the form, the learner / sponsoring employer declares they will pay the full course fee if SSG revokes the grant because information was inaccurate or criteria were not met.",
      },
      { title: "Enrol the training grant via TPG", detail: "Enrol the learner for the training grant in TPG.", timing: "At least 5 working days before the course starts" },
    ],
    source: `${POM}, Annex A.12, Annex D.1 (items 7, 10) and Annex D.2`,
  },
  {
    slug: "utap-application",
    title: "UTAP Application",
    category: "Funding & Grants",
    summary: "How to submit new courses, or courses with a name change, to NTUC for UTAP (Union Training Assistance Programme) funding approval.",
    triggers: ["A new course is launched (WSQ or IBF)", "An existing UTAP-approved course changes its name"],
    steps: [
      {
        title: "Confirm the course needs a UTAP application",
        detail: "UTAP must be applied for whenever a course is NEW or when an approved course's NAME changes. No application is needed for unchanged courses.",
        items: [
          "Check whether the course is already approved: search it on the UTAP “Find a Course” portal.",
          "Currently under UTAP: 291 WSQ courses and 7 IBF courses.",
          "A course name change is treated like a new application: the old name must be re-submitted under the new name.",
        ],
        links: [{ label: "UTAP – Find a Course", href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course" }],
      },
      {
        title: "Gather the course information",
        detail: "Extract the official course details from TP Gateway and the Tertiary Infotech course website.",
        items: [
          "Use TP Gateway for the official course title, TGS reference number and funding validity.",
          "Use the Tertiary course website for the course description, outline and fees.",
          "The details must match TP Gateway exactly, especially the course title.",
        ],
        links: [
          { label: "TP Gateway", href: "https://www.tpgateway.gov.sg/" },
          { label: "Tertiary Courses website", href: "https://www.tertiarycourses.com.sg/" },
        ],
      },
      {
        title: "Fill up the UTAP application template",
        detail: "Complete the latest e2i application form (UTAP template) with the course information gathered in Step 2.",
        items: [
          "Always use the LATEST e2i template; check with the admin team for the current version before filling it in.",
          "Fill in only the editable fields.",
        ],
        note: "Colour code in the template: BLUE and YELLOW cells must NOT be changed. Only complete the uncoloured fields.",
      },
      {
        title: "Submit the application via email",
        detail: "Email the completed UTAP template to the NTUC UTAP support team for processing.",
        items: [
          "Send the completed template to UTAP_TP_Support@ntuc.org.sg.",
          "Keep the submission email in the thread; all follow-ups happen over the same email chain.",
        ],
        links: [
          { label: "Email UTAP Support", href: "mailto:UTAP_TP_Support@ntuc.org.sg" },
          { label: "e2i website", href: "https://www.e2i.com.sg" },
        ],
      },
      {
        title: "Follow up until approved",
        detail: "Track the application over email and chase UTAP support if there is no response.",
        items: [
          "Follow up via the same email thread with UTAP_TP_Support@ntuc.org.sg.",
          "Once approved, verify the course appears (with the correct name) on the UTAP “Find a Course” portal.",
        ],
        links: [{ label: "Verify on Find a Course", href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course" }],
      },
      {
        title: "Inform Sylvia once approved",
        detail: "After approval is confirmed, inform Sylvia so the course page and funding information can be updated.",
        items: [
          "This is the final step of the workflow: Fill up UTAP template → apply via email → approved → inform Sylvia.",
          "Record the approval in the course tracking sheet so the next review (e.g. quarterly follow-up) picks it up.",
        ],
      },
    ],
    references: [
      { label: "UTAP support email", value: "UTAP_TP_Support@ntuc.org.sg", href: "mailto:UTAP_TP_Support@ntuc.org.sg" },
      { label: "UTAP contact person", value: "Shi Ying (NTUC UTAP team)" },
      { label: "Find a Course portal", value: "ntuc.org.sg/uportal/how-we-help/find-a-course", href: "https://www.ntuc.org.sg/uportal/how-we-help/find-a-course" },
      { label: "TP Gateway", value: "tpgateway.gov.sg", href: "https://www.tpgateway.gov.sg/" },
      { label: "e2i", value: "e2i.com.sg", href: "https://www.e2i.com.sg" },
      { label: "Application form", value: "Latest e2i template (check with admin team)" },
    ],
    source: "Internal UTAP workflow (Apr 2026); not part of the TPQA POM",
  },

  // ───────────────────────── Governance & Compliance ─────────────────────────
  {
    slug: "annual-strategic-planning",
    title: "Annual Strategic Planning (Work Plan Meeting)",
    category: "Governance & Compliance",
    summary: "The yearly work plan meeting: review last year's KPIs, set new SMART targets and agree new initiatives.",
    owner: "Management",
    steps: [
      { title: "Review last year's KPIs", detail: "Analyse results, milestones and challenges (resources, process inefficiencies, external factors) and capture lessons learned." },
      {
        title: "Analyse the data",
        detail: "Look at class grouping distribution, class sizes (pax) and trainer engagement effectiveness to find where to act.",
      },
      { title: "Set new KPIs and targets", detail: "Set SMART targets based on priorities (learner satisfaction, programme effectiveness, efficiency) and growth objectives." },
      {
        title: "Agree initiatives",
        detail: "Discuss new programmes, changes in training methods or technology and shifts in learner demographics.",
        items: [
          "Optimise class sizes and consolidate small classes",
          "Prioritise resources for high-demand course groupings",
          "Flexible, demand-led scheduling",
          "Engagement target (e.g. average trainer score of 4 or higher); flag trainers below target",
        ],
      },
    ],
    source: `${POM}, §1.4.1 and §1.4.1a`,
  },
  {
    slug: "quarterly-management-review",
    title: "Quarterly Management Review",
    category: "Governance & Compliance",
    summary: "Each quarter, review KPIs against the annual targets and agree action plans with owners and timelines.",
    owner: "Management",
    steps: [
      {
        title: "Review KPIs against targets",
        detail: "Review current KPIs against the annual work plan targets, look at trends and consider internal and external factors.",
        items: [
          "Learner satisfaction (overall TRAQOM score)",
          "Revenue growth (course sales)",
          "Resource utilisation (training room usage)",
          "Trainer rating and course rating",
        ],
        timing: "Quarterly",
      },
      { title: "Plan actions", detail: "For each gap or opportunity, define measurable steps with timelines, milestones and owners, aligned with the company's goals." },
      { title: "Approve and communicate", detail: "Present the plans for management approval and communicate them across departments." },
      { title: "Follow up", detail: "Track KPI results and stakeholder input until targets are met." },
    ],
    source: `${POM}, §1.4.1b and §3.1e`,
  },
  {
    slug: "work-improvement-initiative",
    title: "Work Improvement Initiative",
    category: "Governance & Compliance",
    summary: "How a staff suggestion becomes a piloted, approved and handed-over process improvement.",
    owner: "Managers / Task Force",
    triggers: ["A staff member proposes a better way of working"],
    steps: [
      { title: "Submit the recommendation", detail: "Staff submit the challenge and proposed solution to their manager." },
      { title: "Preliminary and management review", detail: "The manager assesses feasibility; management evaluates viable suggestions against company goals and resources." },
      { title: "Form a task force", detail: "Set up a task force with the right expertise from relevant departments." },
      { title: "Collect data and plan", detail: "Review current processes, consult stakeholders and benchmark; analyse root causes and draft an improvement plan with actions, timelines and resources." },
      { title: "Management approval", detail: "Present the findings and plan to management for approval." },
      { title: "Pilot", detail: "Implement on a small scale, then report findings, lessons learned and recommendations for management to approve full roll-out." },
      { title: "Roll out", detail: "Communicate the new process to all staff through meetings, training or memos." },
      { title: "Monitor and hand over", detail: "Monitor for two weeks, collect feedback and track metrics, then do a final evaluation and hand ownership to the department.", timing: "2-week monitoring period" },
    ],
    source: `${POM}, §1.4.3a–c`,
  },
  {
    slug: "organisational-outcomes-traqom",
    title: "Tracking Organisational Outcomes and TRAQOM",
    category: "Governance & Compliance",
    summary: "Monthly TRAQOM monitoring, the 75% response-rate target and consolidated quality reviews.",
    owner: "Training Manager",
    steps: [
      { title: "Drive survey responses", detail: "Target a TRAQOM response rate of 75%: automated email on the course end date, and trainers remind learners to submit before dismissal." },
      { title: "Monitor the dashboard", detail: "Log in to the TRAQOM dashboard to review KPIs monthly and targets quarterly.", timing: "Monthly / quarterly" },
      { title: "Consolidate the data", detail: "Combine TRAQOM, course feedback surveys and TPG assessment results into PowerPoint / Excel reports; benchmark satisfaction and engagement at a score of 4 or above." },
      { title: "Review with management", detail: "Hold review meetings with key stakeholders to analyse trends and agree targeted actions." },
    ],
    source: `${POM}, §1.6, §2.1a(ix), §3.1a, §3.1d and §3.2a`,
  },
  {
    slug: "records-retention",
    title: "Records Management and Retention",
    category: "Governance & Compliance",
    summary: "Which training records are kept, where, for how long, and how they are destroyed.",
    owner: "Training Manager",
    steps: [
      { title: "Store securely", detail: "Keep documents in designated Google Drive folders with access restricted to authorised staff; keep physical records in secure files." },
      {
        title: "Keep the required records",
        detail: "Retain records that support administration, quality and outcomes.",
        items: [
          "Course administration: learner communications, WSQ training database, attendance records, assessment records and evidence, appeals and reassessment requests, invoices",
          "Training quality: course materials and assessment plans, trainer management and deployment records, course delivery records",
          "Training outcomes: validation and evaluation records, notes of meetings",
        ],
      },
      { title: "Retain for 3 years", detail: "Assessment records and class / assessment recordings are kept for 3 years from the date of assessment." },
      { title: "Destroy securely", detail: "After the retention period, destroy records securely in line with data-management and privacy requirements." },
    ],
    source: `${POM}, §2.1, §1.3.2a and §1.3.2f`,
  },
  {
    slug: "tpg-profile-update",
    title: "Keeping the TPG Profile Up to Date",
    category: "Governance & Compliance",
    summary: "Updating Training Partners Gateway profile data when organisation, course or trainer details change.",
    owner: "Training Manager",
    triggers: ["A change in organisation details, course information or adult educators"],
    steps: [
      {
        title: "Identify the change",
        detail: "Organisation information (address, telephone, email, officers); course information (title, fee, duration); adult educator information (new hire, resigned).",
      },
      { title: "Update TPG", detail: "Update the profile data on TPG.", timing: "Within 7 days of the change" },
    ],
    source: `${POM}, Annex D.1 (item 34)`,
  },
];

const CATEGORY_ORDER = new Map<string, number>(SOP_CATEGORIES.map((c, i) => [c.name, i]));

/** The full SOP list with a stable sortOrder (category order × 100 + position in category). */
export const SOPS: Sop[] = (() => {
  const seen = new Map<string, number>();
  return RAW.map((s) => {
    const n = seen.get(s.category) ?? 0;
    seen.set(s.category, n + 1);
    return { ...s, sortOrder: (CATEGORY_ORDER.get(s.category) ?? 99) * 100 + n };
  });
})();
