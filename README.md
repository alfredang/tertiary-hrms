# HR Portal - Tertiary Infotech Academy

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.2-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?style=flat-square&logo=capacitorjs)](https://capacitorjs.com/)
[![Coolify](https://img.shields.io/badge/Coolify-Self--Hosted-purple?style=flat-square)](https://coolify.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

A comprehensive, AI-powered Human Resource Management System built for **Tertiary Infotech Academy Pte Ltd**. Cross-platform (Web, iOS, Android) with role-based access control, employee management, leave tracking with monthly accrual proration, payroll processing with Singapore CPF calculations, expense claims, Google OAuth, and an intelligent AI chatbot assistant.

<p align="center">
  <a href="https://hrms.tertiaryinfo.tech"><strong>Live Demo</strong></a> ·
  <a href="https://alfredang.github.io/tertiary-hrms/"><strong>Documentation</strong></a> ·
  <a href="https://github.com/alfredang/tertiary-hrms/issues"><strong>Report Bug</strong></a>
</p>

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Coolify (Self-Hosted)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           Next.js 14 (SSR + API)              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ Pages    │ │ API      │ │ Middleware    │  │  │
│  │  │ (React)  │ │ Routes   │ │ (Auth Guard) │  │  │
│  │  └──────────┘ └──────────┘ └──────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────┴────┐  ┌─────┴────┐  ┌────┴────┐
   │   Web   │  │   iOS    │  │ Android │
   │ Browser │  │ WebView  │  │ WebView │
   │  (PWA)  │  │(Capacitor│  │(Capacitor│
   └─────────┘  └──────────┘  └─────────┘
```

The native apps load the deployed URL inside a WebView via Capacitor, sharing a **single codebase** across all platforms.

---

## Features

### Authentication & Authorization
- **Credentials login** (email/password) with bcrypt password hashing
- **Google OAuth** social login via NextAuth v5 (Auth.js)
- **Native mobile Google Sign-In** via Capacitor plugin — verifies Google ID token server-side, creates NextAuth-compatible JWT session
- Role-based access control: **Admin**, **HR**, **Manager**, **Staff**
- Admin/Staff **view toggle** — admins can switch between management and personal views
- JWT-based sessions with automatic role and employee data refresh
- Middleware-protected routes with `needsSetup` redirect for new OAuth users
- **Inactive employee blocking** — employees with INACTIVE status are denied login (both credentials and OAuth)
- HR management routes (`/payroll/generate`, `/settings`) restricted to ADMIN/HR/MANAGER via middleware
- Dev quick-login buttons for testing (development mode only)

### RBAC (Role-Based Access Control)
- **Admin view**: full access to all employees, leave requests, expenses, payroll, and settings
- **Staff view**: can only see own leave, expenses, payslips, and personal profile
- View toggle lets admins preview the staff experience
- Settings page restricted to admin view only
- Employee list filters and edit buttons hidden in staff view
- All API routes enforce role-based permissions

### Dashboard
- Real-time overview of HR metrics with role-aware stats
- **Admin view**: pending leave requests, pending MC, pending expense claims
- **Staff view**: personal leave balance, MC balance, expense claims (YTD)
- Recent activity feed (expenses and leave requests), filtered by role
- Quick action cards for common tasks

### Staff Directory
- Complete employee database with search and filters
- Grid and list view options
- Inline employee editing via slide-out sheet (admin only)
- Personal info, employment details, and salary management
- Manager assignment and organizational hierarchy

### Leave Management
- **Leave types**: Annual Leave (AL: 14 days), Medical Certificate (MC: 14 days), Compassionate Leave (CL: 3 days), No-Pay Leave (NPL: 14 days)
- **Half-day leave** (AM/PM) — available for Annual Leave only, single-day or multi-day with first/last day half
- **Monthly accrual proration** for Annual Leave and Medical Leave — allocation = entitlement x completed months / 12, rounded down to nearest 0.5 day (join month excluded)
- **Year-end rollover** — admin triggers via Settings page; Annual Leave carries forward (no cap), MC/CL/NPL reset
- Leave balance tracking per employee per year with carry-over support
- Dashboard shows Entitlement, Allocation (pro-rated), Carry-over, Leave Taken, Leave Rejected, and Remaining Balance
- **Leave request form** with date range picker, day type selector (Full Day / AM Half / PM Half), and reason
- MC submission with **doctor's certificate upload**
- Admin approval/rejection workflow with optional rejection reason
- **Admin reset** — reset approved/rejected leave back to pending (with audit log)
- Staff can **edit** (change dates/reason) or **cancel** pending leave requests
- **Overlap prevention** — server-side detection blocks conflicting dates (two half-days on same day allowed)
- Status filtering (Pending, Approved, Rejected, Cancelled) with sortable columns
- Automatic balance deduction upon approval
- Calendar sync — approved leave/MC events automatically appear on the calendar

### Payroll
- Singapore CPF contribution calculations using `decimal.js` for precision
  - Employee contribution: 20% (age ≤55), with age-based rate adjustments
  - Employer contribution: 17% (age ≤55), with age-based rate adjustments
  - Monthly OW ceiling: $8,000
  - Annual wage ceiling: $102,000
- **Excel upload** — admin can upload an Excel file with salary and CPF data; payslips are auto-generated or overwritten for the selected month
  - Flexible column matching (supports "Basic Salary", "BasicSalary", "Basic", etc.)
  - Employee matching by Employee ID or Name
  - Detailed upload results with per-row error reporting
- **Auto-generate payroll** from employee salary data with CPF calculations
- Monthly payslip generation with PDF download
- Payment status tracking (Generated, Finalized, Paid)
- Admin payroll table with employee details and CPF breakdown

### Expense Claims
- Category-based expense submission (Transport, Meals, Equipment, etc.)
- **Receipt upload** with file attachment support
- **Expense submission form** with date, amount, and description (future dates blocked)
- Staff can **edit** or **cancel** pending expense claims
- Approval workflow for managers and admins with optional rejection reason
- **Admin reset** — reset approved/rejected expenses back to pending (with audit log)
- Multiple status states (Pending, Approved, Rejected, Cancelled, Paid)
- Status filtering with sortable columns
- YTD expense claim amount displayed on staff dashboard
- Admin and staff views with appropriate filtering

### Calendar
- **Personal planner** — each user's events are fully private (admins cannot see other employees' events)
- Full calendar month view with color-coded event types (Holiday, Meeting, Training, Company Event, Leave)
- Approved leave/MC automatically synced as calendar events
- **Leave visibility**: admin view shows all employees' leave; "Show as Staff" mode and staff role see only own leave
- Day detail view with event cards showing title, type, and time
- Add/edit/delete events with ownership enforcement
- Event type legend with color indicators
- Month navigation (prev/next) and Today button

### Settings (Admin Only)
- Company-wide settings management
- Leave policy configuration
- Approval email routing for leave/expense/MC notifications
- System preferences

### AI Chatbot
- HR assistant powered by Google Gemini / OpenAI / Anthropic (via AI SDK)
- Context-aware responses about HR policies, leave, CPF, and expenses
- Floating chat widget accessible from any page

### Privacy Policy
- Publicly accessible at `/privacy-policy` (no authentication required)
- Covers data collection, usage, third-party sharing, retention, and account deletion
- Compliant with Google Play Store and Apple App Store requirements
- Linked from login page footer

### Cross-Platform Mobile
- **PWA** — installable from browser on any device
- **iOS** — native shell via Capacitor with status bar integration
- **Android** — native shell via Capacitor with status bar integration and Google Auth plugin
- **Native Google Sign-In** — Capacitor Google Auth plugin for seamless mobile authentication
- Mobile hamburger menu + bottom tab navigation
- Safe area support for notched devices

---

## Tech Stack

<table>
  <tr>
    <td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" width="40"/><br/>Next.js 14</td>
    <td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="40"/><br/>TypeScript</td>
    <td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original.svg" width="40"/><br/>Tailwind</td>
    <td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg" width="40"/><br/>PostgreSQL</td>
    <td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/prisma/prisma-original.svg" width="40"/><br/>Prisma</td>
  </tr>
</table>

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 14 (App Router, SSR) |
| **Language** | TypeScript 5.7 |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | PostgreSQL (Coolify) |
| **ORM** | Prisma 6.2 |
| **Authentication** | NextAuth v5 (Auth.js) — Credentials + Google OAuth |
| **AI/LLM** | AI SDK (Gemini, OpenAI, Anthropic) |
| **CPF Calculator** | decimal.js for precise Singapore CPF calculations |
| **Excel Parsing** | xlsx (SheetJS) for payroll upload |
| **Mobile** | Capacitor 8 (iOS + Android) |
| **PDF** | jsPDF + jspdf-autotable |
| **Testing** | Vitest + Playwright |
| **Deployment** | Coolify (self-hosted) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database (via Coolify or local)
- [Google Cloud Console](https://console.cloud.google.com) project (for OAuth)
- AI API key (Google Gemini, OpenAI, or Anthropic — optional, for chatbot)

### Installation

```bash
git clone https://github.com/alfredang/tertiary-hrms.git
cd tertiary-hrms
npm install
```

### Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database"
DIRECT_URL="postgresql://user:password@host:5432/database"

# NextAuth
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"

# Google OAuth (for Social Login)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AI Chatbot (at least one required for chatbot feature)
GOOGLE_GENERATIVE_AI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_COMPANY_NAME="Your Company Name"

# Development (skip auth for quick testing)
SKIP_AUTH="false"
```

### Database Setup

```bash
npx prisma db push
npx tsx scripts/import-staff.ts
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Test Accounts

In development mode, use the **Dev Quick Login** buttons on the login page, or enter credentials manually:

| Email | Password | Role | Employee |
|-------|----------|------|----------|
| admin@tertiaryinfotech.com | 123456 | Admin | TEST ADMIN (EMP098) |
| staff@tertiaryinfotech.com | 123456 | Staff | TEST STAFF (EMP099) |
| staff2@tertiaryinfotech.com | 123456 | Staff | TEST STAFF 2 (EMP097) |

---

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests (Playwright)

48 end-to-end tests across 10 files covering auth, RBAC, dashboard, leave (full/half-day/MC), expenses, calendar CRUD, payroll, employees, settings, and view toggle. All write tests self-clean (cancel/delete created data).

```bash
# Run all e2e tests against local dev server (auto-starts npm run dev)
npx playwright test

# Run all e2e tests against production
TEST_ENV=production npx playwright test

# Run a specific test file
npx playwright test e2e/01-auth.spec.ts
```

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `01-auth.spec.ts` | 8 | Login (admin/staff/wrong pw/non-existent), Google OAuth button, RBAC nav |
| `02-dashboard.spec.ts` | 6 | Admin/staff stats, view toggle, Settings visibility |
| `03-leave-request.spec.ts` | 5 | 1-day, 2-day, half-day AM, MC leave + balance cards |
| `04-leave-actions.spec.ts` | 4 | Edit, cancel, admin approve+reset, admin reject+reset |
| `05-expense-submit.spec.ts` | 3 | Submit expense, stats display, future date block |
| `06-expense-actions.spec.ts` | 4 | Edit, cancel, admin approve+reset, admin reject+reset |
| `07-calendar.spec.ts` | 7 | Month view, navigation, legend, CRUD (create/edit/delete), staff access |
| `08-payroll.spec.ts` | 4 | Admin generate page, payroll list, staff view, staff RBAC block |
| `09-employees.spec.ts` | 4 | Employee directory, detail page, admin/staff profile |
| `10-settings.spec.ts` | 3 | Admin access, staff RBAC block, company name field |

### Utility Scripts

```bash
# Verify database state (read-only, safe for production)
npx dotenv-cli -e .env.local -- npx tsx scripts/verify-db.ts

# Create salary info for test accounts (safe, only touches test employees)
npx dotenv-cli -e .env.local -- npx tsx scripts/setup-test-salary.ts
```

> **Note:** Prisma doesn't auto-load `.env.local` on Windows — use the `dotenv-cli -e .env.local --` prefix for scripts.

---

## Mobile Development

The native apps use Capacitor to wrap the web app in a native shell. The Android build includes the Google Auth plugin for native sign-in.

### iOS

```bash
npm run cap:sync        # Sync web assets to native
npm run cap:open:ios    # Open Xcode project
```

Build and run from Xcode on a simulator or device.

### Android

```bash
npm run cap:sync          # Sync web assets to native
npm run cap:open:android  # Open Android Studio project
```

Build and run from Android Studio on an emulator or device.

### Google Auth Plugin (Native Mobile)

The Capacitor Google Auth plugin (`@codetrix-studio/capacitor-google-auth`) is configured in `capacitor.config.ts`. Requires:
- `GOOGLE_CLIENT_ID` env var (web client ID from Google Cloud Console)
- Android: SHA-1 fingerprint registered in Google Cloud Console
- iOS: Bundle ID registered in Google Cloud Console

### Development Workflow

1. Make web changes with `npm run dev` — test in browser
2. Run `npm run cap:sync` to sync to native platforms
3. Build and test in Xcode / Android Studio

> **Note:** The native apps load the configured server URL by default. For local development, update `server.url` in `capacitor.config.ts` to your local IP.

---

## Project Structure

```
tertiary-hrms/
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── seed.ts                    # Seed data with test accounts
├── e2e/
│   ├── helpers.ts                 # Login/logout, date utils, view toggle helpers
│   ├── 01-auth.spec.ts            # Auth + RBAC tests
│   ├── 02-dashboard.spec.ts       # Dashboard + view toggle tests
│   ├── 03-leave-request.spec.ts   # Leave request flows (full/half-day/MC)
│   ├── 04-leave-actions.spec.ts   # Leave edit, cancel, approve, reject, reset
│   ├── 05-expense-submit.spec.ts  # Expense submit + validation
│   ├── 06-expense-actions.spec.ts # Expense edit, cancel, approve, reject, reset
│   ├── 07-calendar.spec.ts        # Calendar view + CRUD + privacy
│   ├── 08-payroll.spec.ts         # Payroll view + RBAC
│   ├── 09-employees.spec.ts       # Employee directory + profile
│   └── 10-settings.spec.ts        # Company settings + RBAC
├── scripts/
│   ├── import-staff.ts            # Import staff from Excel + create test accounts
│   ├── verify-db.ts               # Read-only database verification
│   └── setup-test-salary.ts       # Create salary info for test accounts
├── src/
│   ├── app/
│   │   ├── (auth)/                # Login page (dark theme)
│   │   ├── privacy-policy/        # Public privacy policy (no auth)
│   │   ├── (dashboard)/           # Protected dashboard pages
│   │   │   ├── dashboard/         # Main dashboard
│   │   │   ├── employees/         # Employee directory + profiles
│   │   │   ├── leave/             # Leave management + request + edit
│   │   │   ├── expenses/          # Expense claims + submit + edit
│   │   │   ├── payroll/           # Payroll + generation + Excel upload
│   │   │   ├── calendar/          # Calendar view + day detail + add/edit
│   │   │   ├── settings/          # System settings (admin only)
│   │   │   └── pending-setup/     # OAuth user pending setup page
│   │   └── api/                   # API routes
│   │       ├── auth/              # NextAuth endpoints + mobile Google Sign-In
│   │       ├── employees/         # Employee CRUD
│   │       ├── leave/             # Leave request + approval
│   │       ├── expenses/          # Expense claim + approval
│   │       ├── payroll/           # Payroll generation + Excel upload
│   │       ├── upload/            # File uploads
│   │       ├── settings/          # Settings API
│   │       ├── cron/              # Scheduled tasks
│   │       └── chat/              # AI chatbot
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── layout/                # Sidebar, Header, MobileNav
│   │   ├── chat/                  # AI chatbot widget
│   │   ├── dashboard/             # Stats, Quick Actions, View Toggle
│   │   ├── staff/                 # Employee list components
│   │   ├── employees/             # Employee edit forms
│   │   ├── leave/                 # Leave list + request form
│   │   ├── payroll/               # Payroll list components
│   │   ├── expenses/              # Expense list + submit form
│   │   └── settings/              # Settings components
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (credentials + Google)
│   │   ├── prisma.ts              # Prisma client
│   │   ├── cpf-calculator.ts      # Singapore CPF calculations (decimal.js)
│   │   ├── utils.ts               # Formatting, leave proration, helpers
│   │   ├── view-mode.ts           # Admin/Staff view toggle
│   │   ├── constants.ts           # App constants
│   │   └── validations/           # Zod schemas
│   └── middleware.ts              # Auth guard + needsSetup redirect
├── ios/                           # Capacitor iOS project
├── android/                       # Capacitor Android project
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service worker
│   └── icons/                     # App icons
└── capacitor.config.ts            # Capacitor configuration
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npx playwright test` | Run e2e tests (local dev server) |
| `TEST_ENV=production npx playwright test` | Run e2e tests against production |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed database with sample data |
| `npm run cap:sync` | Sync web to native platforms |
| `npm run cap:open:ios` | Open Xcode project |
| `npm run cap:open:android` | Open Android Studio project |

---

## Deployment

### Web (Coolify — Self-Hosted)

Deployed on Coolify with Traefik reverse proxy at [https://hrms.tertiaryinfo.tech](https://hrms.tertiaryinfo.tech). Auto-deploys on `git push` to `main`. Database is PostgreSQL on Coolify.

### iOS (App Store)

1. Open in Xcode: `npm run cap:open:ios`
2. Set signing team and bundle ID
3. Archive and submit to App Store Connect

### Android (Play Store)

1. Open in Android Studio: `npm run cap:open:android`
2. Generate signed APK/AAB
3. Upload to Google Play Console

---

## Links

- **Live (Coolify)**: [https://hrms.tertiaryinfo.tech](https://hrms.tertiaryinfo.tech)
- **Documentation**: [https://alfredang.github.io/tertiary-hrms/](https://alfredang.github.io/tertiary-hrms/)
- **Repository**: [https://github.com/alfredang/tertiary-hrms](https://github.com/alfredang/tertiary-hrms)

---

## License

This project is proprietary software developed for Tertiary Infotech Academy Pte Ltd.

## Support

For support, please contact the IT department or [raise an issue](https://github.com/alfredang/tertiary-hrms/issues).
