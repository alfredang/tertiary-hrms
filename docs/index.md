---
layout: default
title: Home
nav_order: 1
description: "AI-HRM is an intelligent HR Management System for Tertiary Infotech Academy Pte Ltd"
permalink: /
---

# HR Portal User Guide
{: .fs-9 }

A comprehensive, AI-powered Human Resource Management System built for Tertiary Infotech Academy Pte Ltd. Available on Web, iOS, and Android.
{: .fs-6 .fw-300 }

[Get Started]({{ site.baseurl }}/getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/alfredang/tertiary-hrms){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Welcome to HR Portal

HR Portal is a modern, cross-platform HR management system designed to streamline human resource operations. Built with Next.js and Capacitor, it provides an intuitive interface for managing employees, tracking leave, processing payroll, and handling expense claims - accessible on any device.

### Key Features

- **Dashboard** - Real-time HR metrics and pending approvals
- **Staff Directory** - Complete employee database with search and filters
- **Leave Management** - Request and approval workflow with balance tracking
- **Payroll** - Singapore CPF calculations and PDF payslip generation
- **Expense Claims** - Category-based submission with receipt uploads
- **Calendar** - Event management with color-coded categories
- **AI Chatbot** - Intelligent HR assistant for policy queries

### Quick Links

| Feature | Description |
|---------|-------------|
| [Dashboard]({{ site.baseurl }}/dashboard) | Overview of HR metrics |
| [Staff Directory]({{ site.baseurl }}/staff-directory) | Manage employees |
| [Leave Management]({{ site.baseurl }}/leave-management) | Handle leave requests |
| [Payroll]({{ site.baseurl }}/payroll) | Process salaries and payslips |
| [Expense Claims]({{ site.baseurl }}/expense-claims) | Manage expense reimbursements |
| [Calendar]({{ site.baseurl }}/calendar) | View events and schedules |

### User Roles

| Role | Access Level |
|------|--------------|
| **Staff** | View own profile, submit requests |
| **Manager** | Approve team requests, view team data |
| **HR** | Manage all employees, process payroll |
| **Admin** | Full system access, configuration |

---

## About

AI-HRM is developed for Tertiary Infotech Academy Pte Ltd to modernize HR operations with AI-powered assistance and streamlined workflows.

### Tech Stack

- Next.js 14 with App Router
- TypeScript & Tailwind CSS
- PostgreSQL with Prisma ORM
- NextAuth v5 for authentication
- Vercel AI SDK with Gemini
- Resend for email notifications
