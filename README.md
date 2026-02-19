# HR Portal - Tertiary Infotech Academy

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.2-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql)](https://neon.tech/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?style=flat-square&logo=capacitorjs)](https://capacitorjs.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=flat-square&logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

A comprehensive, AI-powered Human Resource Management System built for **Tertiary Infotech Academy Pte Ltd**. Cross-platform (Web, iOS, Android) with role-based access control, employee management, leave tracking, payroll processing with Singapore CPF calculations, expense claims, Google OAuth, and an intelligent AI chatbot assistant.

<p align="center">
  <a href="https://hrms.tertiaryinfo.tech"><strong>Live Demo</strong></a> ·
  <a href="https://alfredang.github.io/tertiary-hrms/"><strong>Documentation</strong></a> ·
  <a href="https://github.com/alfredang/tertiary-hrms/issues"><strong>Report Bug</strong></a>
</p>

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Vercel (Cloud)                     │
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

The native apps load the Vercel-deployed URL inside a WebView via Capacitor, sharing a **single codebase** across all platforms.

---

## Features

### Authentication & Authorization
- **Credentials login** (email/password) with bcrypt password hashing
- **Google OAuth** social login via NextAuth v5 (Auth.js)
- Role-based access control: **Admin**, **HR**, **Manager**, **Staff**
- Admin/Staff **view toggle** — admins can switch between management and personal views
- JWT-based sessions with automatic role and employee data refresh
- Middleware-protected routes with `needsSetup` redirect for new OAuth users
- Dev quick-login buttons for testing (development mode only)

### Dashboard
- Real-time overview of HR metrics with role-aware stats
- **Admin view**: pending leave requests, pending MC, pending expense claims
- **Staff view**: personal leave balance, MC balance
- Recent activity feed (expenses and leave requests)
- Quick action cards for common tasks

### Staff Directory
- Complete employee database with search and filters
- Grid and list view options
- Inline employee editing via slide-out sheet
- Personal info, employment details, and salary management
- Role-based access control (Staff, Manager, HR, Admin)
- Manager assignment and organizational hierarchy

### Leave Management
- Multiple leave types (Annual Leave, Sick Leave, Medical Certificate, Compassionate)
- Leave balance tracking per employee per year with carry-over support
- **Leave request form** with date range picker and reason
- MC submission with **doctor's certificate upload**
- Pro-rated entitlements for new employees
- Admin approval/rejection workflow
- Status filtering (Pending, Approved, Rejected)
- Automatic balance deduction upon approval

### Payroll
- Singapore CPF contribution calculations
  - Employee contribution: 20% (age ≤55)
  - Employer contribution: 17% (age ≤55)
  - Age-based rate adjustments
  - Monthly OW ceiling: $8,000
  - Annual wage ceiling: $102,000
- **Payroll generation** for individual employees or all active staff
- Monthly payslip generation with PDF download
- Payment status tracking (Draft, Finalized, Paid)
- Admin payroll table with employee details and CPF breakdown

### Expense Claims
- Category-based expense submission (Transport, Meals, Equipment, etc.)
- **Receipt upload** with file attachment support
- **Expense submission form** with date, amount, and description
- Approval workflow for managers and admins
- Multiple status states (Pending, Approved, Rejected, Paid)
- Admin and staff views with appropriate filtering

### Calendar
- Full calendar view with color-coded events
- Leave events displayed with status indicators
- Admin sees all employees' leave; staff sees own leave

### Settings
- Company-wide settings management
- Leave policy configuration
- System preferences

### AI Chatbot
- HR assistant powered by Google Gemini / OpenAI / Anthropic (via Vercel AI SDK)
- Context-aware responses about HR policies, leave, CPF, and expenses
- Floating chat widget accessible from any page

### Cross-Platform Mobile
- **PWA** — installable from browser on any device
- **iOS** — native shell via Capacitor with status bar integration
- **Android** — native shell via Capacitor with status bar integration
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
| **Database** | Neon PostgreSQL (Serverless) |
| **ORM** | Prisma 6.2 |
| **Authentication** | NextAuth v5 (Auth.js) — Credentials + Google OAuth |
| **AI/LLM** | Vercel AI SDK (Gemini, OpenAI, Anthropic) |
| **File Upload** | Local filesystem (UploadThing installed, not wired) |
| **Mobile** | Capacitor 8 (iOS + Android) |
| **Email** | Resend (installed, not implemented) |
| **PDF** | jsPDF + jspdf-autotable |
| **Testing** | Vitest + Playwright |
| **Deployment** | Vercel + Coolify (self-hosted) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Neon](https://neon.tech) PostgreSQL database
- [Google Cloud Console](https://console.cloud.google.com) project (for OAuth)
- [Resend](https://resend.com) account (for emails, optional)
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
# Database (Neon Postgres)
DATABASE_URL="your-neon-connection-string"
DIRECT_URL="your-neon-direct-connection-string"

# NextAuth
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"

# Google OAuth (for Social Login)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Email (Resend)
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="hr@yourcompany.com"

# UploadThing (for receipt/document uploads)
UPLOADTHING_TOKEN="your-uploadthing-token"

# AI Chatbot (at least one required for chatbot feature)
GOOGLE_GENERATIVE_AI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_COMPANY_NAME="Your Company Name"
```

### Database Setup

```bash
npx prisma db push
npx tsx prisma/seed.ts --confirm
```

> **Warning:** The seed script deletes all leave requests, expenses, payslips, and calendar events before re-creating sample data. The `--confirm` flag is required to prevent accidental data wipe.

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Test Accounts

In development mode, use the **Dev Quick Login** buttons on the login page, or enter credentials manually:

| Email | Password | Role | Employee |
|-------|----------|------|----------|
| admin@tertiaryinfotech.com | 123456 | Admin | Ang Chew Hoe (EMP001, HR Director) |
| staff@tertiaryinfotech.com | 123456 | Staff | Test Staff (EMP007, Software Engineer) |
| sarah.johnson@tertiaryinfotech.com | 123456 | Staff | EMP002, Senior Software Engineer |
| michael.chen@tertiaryinfotech.com | 123456 | Staff | EMP003, Marketing Manager |
| emily.rodriguez@tertiaryinfotech.com | 123456 | Staff | EMP004, HR Coordinator |
| james.williams@tertiaryinfotech.com | 123456 | Staff | EMP005, Sales Representative |
| lisa.park@tertiaryinfotech.com | 123456 | Staff | EMP006, Financial Analyst |

---

## Testing

```bash
# Run unit tests
npm run test

# Run Playwright login tests
npx tsx scripts/test-login.ts
```

---

## Mobile Development

The native apps use Capacitor to wrap the web app in a native shell.

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

### Development Workflow

1. Make web changes with `npm run dev` — test in browser
2. Run `npm run cap:sync` to sync to native platforms
3. Build and test in Xcode / Android Studio

> **Note:** The native apps load the live Vercel deployment URL by default. For local development, temporarily update `server.url` in `capacitor.config.ts` to your local IP.

---

## Project Structure

```
tertiary-hrms/
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── seed.ts                    # Seed data with test accounts
├── scripts/
│   └── test-login.ts              # Playwright login tests
├── src/
│   ├── app/
│   │   ├── (auth)/                # Login page (dark theme)
│   │   ├── (dashboard)/           # Protected dashboard pages
│   │   │   ├── dashboard/         # Main dashboard
│   │   │   ├── employees/         # Employee directory + profiles
│   │   │   ├── leave/             # Leave management + request form
│   │   │   ├── expenses/          # Expense claims + submit form
│   │   │   ├── payroll/           # Payroll + generation
│   │   │   ├── calendar/          # Calendar view
│   │   │   ├── settings/          # System settings
│   │   │   └── pending-setup/     # OAuth user pending setup page
│   │   └── api/                   # API routes
│   │       ├── auth/              # NextAuth endpoints
│   │       ├── employees/         # Employee CRUD
│   │       ├── leave/             # Leave request submission
│   │       ├── expenses/          # Expense claim submission
│   │       ├── payroll/           # Payroll generation
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
| `npm run build` | Build for production (includes db push + seed) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed database with sample data |
| `npm run cap:sync` | Sync web to native platforms |
| `npm run cap:open:ios` | Open Xcode project |
| `npm run cap:open:android` | Open Android Studio project |

---

## Deployment

### Web (Vercel)

The app auto-deploys to Vercel on push to `main`. Visit [https://ai-hrms.vercel.app](https://ai-hrms.vercel.app).

### Web (Coolify — Self-Hosted)

Also deployed on Coolify with Traefik reverse proxy at [https://hrms.tertiaryinfo.tech](https://hrms.tertiaryinfo.tech). Auto-deploys on `git push` to `main`. Database is external (Neon) so data persists across redeployments.

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
- **Live (Vercel)**: [https://ai-hrms.vercel.app](https://ai-hrms.vercel.app)
- **Documentation**: [https://alfredang.github.io/tertiary-hrms/](https://alfredang.github.io/tertiary-hrms/)
- **Repository**: [https://github.com/alfredang/tertiary-hrms](https://github.com/alfredang/tertiary-hrms)

---

## License

This project is proprietary software developed for Tertiary Infotech Academy Pte Ltd.

## Support

For support, please contact the IT department or [raise an issue](https://github.com/alfredang/tertiary-hrms/issues).
