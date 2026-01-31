# AI-HRM - Intelligent HR Management System

A comprehensive, AI-powered Human Resource Management System built for **Tertiary Infotech**. This modern web application streamlines HR operations with features like employee management, leave tracking, payroll processing with Singapore CPF calculations, expense claims, and an intelligent AI chatbot assistant.

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
- Salary configuration per employee
- Monthly payslip generation
- PDF payslip download with detailed breakdown
- Payment status tracking

### Expense Claims
- Category-based expense submission
- Receipt upload support
- Approval workflow with email notifications
- Multiple status states (Pending, Approved, Rejected, Paid)
- Expense history and reporting

### Calendar
- Full calendar view with event management
- Color-coded event types
  - Holidays (red)
  - Meetings (blue)
  - Training (purple)
  - Company Events (green)
  - Leave (orange)
- Automatic leave event creation upon approval

### AI Chatbot
- Intelligent HR assistant powered by Google Gemini
- Context-aware responses about HR policies
- Leave and CPF information queries
- Fallback to OpenAI/Anthropic if configured
- Floating chat widget for easy access

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **UI Components** | shadcn/ui |
| **Database** | Neon Postgres (Serverless) |
| **ORM** | Prisma |
| **Authentication** | NextAuth v5 (Auth.js) |
| **AI/LLM** | Vercel AI SDK with Gemini |
| **Email** | Resend |
| **PDF Generation** | jsPDF + jspdf-autotable |
| **Deployment** | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Neon Postgres database account
- Resend account (for emails)
- Google AI API key (for chatbot)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/alfredang/ai-hrm.git
cd ai-hrm
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
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

# AI Chatbot
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_COMPANY_NAME="Your Company Name"
```

4. Set up the database:
```bash
npx prisma db push
npx prisma db seed
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

### Default Login Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@tertiaryinfotech.com | ***REMOVED*** | Admin |

## Project Structure

```
hr-management/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login pages
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   └── api/               # API routes
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── layout/            # Sidebar, Header
│   │   ├── dashboard/         # Dashboard components
│   │   ├── staff/             # Employee components
│   │   ├── leave/             # Leave components
│   │   ├── payroll/           # Payroll components
│   │   ├── expenses/          # Expense components
│   │   ├── calendar/          # Calendar components
│   │   └── chat/              # AI chatbot widget
│   └── lib/
│       ├── prisma.ts          # Prisma client
│       ├── auth.ts            # NextAuth config
│       ├── cpf-calculator.ts  # CPF calculation logic
│       ├── pdf-generator.ts   # Payslip PDF generation
│       └── email.ts           # Email service
├── public/                    # Static assets
└── docs/                      # Documentation
```

## Documentation

For detailed documentation, visit the [User Guide](https://alfredang.github.io/ai-hrm/).

## License

This project is proprietary software developed for Tertiary Infotech.

## Support

For support, please contact the IT department or raise an issue in the repository.
