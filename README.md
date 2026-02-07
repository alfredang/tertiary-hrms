# HR Portal - Tertiary Infotech Academy

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.2-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql)](https://neon.tech/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.0-119EFF?style=flat-square&logo=capacitorjs)](https://capacitorjs.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=flat-square&logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

A comprehensive, AI-powered Human Resource Management System built for **Tertiary Infotech Academy Pte Ltd**. Cross-platform (Web, iOS, Android) with employee management, leave tracking, payroll processing with Singapore CPF calculations, expense claims, and an intelligent AI chatbot assistant.

<p align="center">
  <a href="https://ai-hrms.vercel.app"><strong>Live Demo</strong></a> ·
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

### Dashboard
- Real-time overview of HR metrics
- Pending approvals count (leave requests, expense claims)
- Employee statistics and departmental breakdown
- Quick access to common tasks

### Staff Directory
- Complete employee database with search and filters
- Grid and list view options
- Employee profiles with contact information
- Role-based access control (Staff, Manager, HR, Admin)
- Manager assignment and organizational hierarchy

### Leave Management
- Multiple leave types (Annual, Sick, Medical, Compassionate)
- Leave balance tracking per employee per year
- Request submission with date picker and reason
- Approval workflow with email notifications
- Status filtering (Pending, Approved, Rejected)
- Automatic balance deduction upon approval

### Payroll
- Singapore CPF contribution calculations
  - Employee contribution: 20% (age ≤55)
  - Employer contribution: 17% (age ≤55)
  - Age-based rate adjustments
  - Monthly OW ceiling: $8,000
  - Annual wage ceiling: $102,000
- Monthly payslip generation with PDF download
- Payment status tracking

### Expense Claims
- Category-based expense submission with receipt upload
- Approval workflow with email notifications
- Multiple status states (Pending, Approved, Rejected, Paid)

### Calendar
- Full calendar view with color-coded events
- Automatic leave event creation upon approval

### AI Chatbot
- HR assistant powered by Google Gemini / OpenAI / Anthropic
- Context-aware responses about HR policies, leave, and CPF
- Floating chat widget accessible from any page

### Cross-Platform Mobile
- **PWA** - installable from browser on any device
- **iOS** - native shell via Capacitor with status bar integration
- **Android** - native shell via Capacitor with status bar integration
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
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5.7 |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | Neon PostgreSQL (Serverless) |
| **ORM** | Prisma 6.2 |
| **Authentication** | NextAuth v5 (Auth.js) |
| **AI/LLM** | Vercel AI SDK (Gemini, OpenAI, Anthropic) |
| **Mobile** | Capacitor 8 (iOS + Android) |
| **Email** | Resend |
| **PDF** | jsPDF + jspdf-autotable |
| **Deployment** | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Neon](https://neon.tech) PostgreSQL database
- [Resend](https://resend.com) account (for emails)
- AI API key (Google Gemini, OpenAI, or Anthropic)

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

# Email (Resend)
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="hr@yourcompany.com"

# AI Chatbot (at least one required)
GOOGLE_GENERATIVE_AI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_COMPANY_NAME="Tertiary Infotech Academy Pte Ltd"
```

### Database Setup

```bash
npx prisma db push
npx prisma db seed
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Default Login

| Email | Password | Role |
|-------|----------|------|
| admin@tertiaryinfotech.com | ***REMOVED*** | Admin |

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

1. Make web changes with `npm run dev` - test in browser
2. Run `npm run cap:sync` to sync to native platforms
3. Build and test in Xcode / Android Studio

> **Note:** The native apps load the live Vercel deployment URL by default. For local development, temporarily update `server.url` in `capacitor.config.ts` to your local IP.

---

## Project Structure

```
tertiary-hrms/
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.ts                  # Seed data
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login pages
│   │   ├── (dashboard)/         # Protected dashboard pages
│   │   └── api/                 # API routes
│   ├── components/
│   │   ├── ui/                  # shadcn/ui + Sheet components
│   │   ├── layout/              # Sidebar, Header, MobileNav
│   │   ├── chat/                # AI chatbot widget
│   │   ├── dashboard/           # Dashboard components
│   │   ├── staff/               # Employee components
│   │   ├── leave/               # Leave components
│   │   ├── payroll/             # Payroll components
│   │   ├── expenses/            # Expense components
│   │   └── calendar/            # Calendar components
│   └── lib/
│       ├── auth.ts              # NextAuth config
│       ├── prisma.ts            # Prisma client
│       ├── capacitor.ts         # Capacitor utilities
│       └── cpf-calculator.ts    # CPF calculation logic
├── ios/                         # Capacitor iOS project
├── android/                     # Capacitor Android project
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker
│   └── icons/                   # App icons
├── capacitor.config.ts          # Capacitor configuration
└── docs/                        # Documentation
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run cap:sync` | Sync web to native platforms |
| `npm run cap:open:ios` | Open Xcode project |
| `npm run cap:open:android` | Open Android Studio project |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed database with sample data |

---

## Deployment

### Web (Vercel)

The app auto-deploys to Vercel on push to `main`. Visit [https://ai-hrms.vercel.app](https://ai-hrms.vercel.app).

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

- **Live Demo**: [https://ai-hrms.vercel.app](https://ai-hrms.vercel.app)
- **Documentation**: [https://alfredang.github.io/tertiary-hrms/](https://alfredang.github.io/tertiary-hrms/)
- **Repository**: [https://github.com/alfredang/tertiary-hrms](https://github.com/alfredang/tertiary-hrms)

---

## License

This project is proprietary software developed for Tertiary Infotech Academy Pte Ltd.

## Support

For support, please contact the IT department or [raise an issue](https://github.com/alfredang/tertiary-hrms/issues).
