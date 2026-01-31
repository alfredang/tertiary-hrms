---
layout: default
title: Admin Guide
nav_order: 10
---

# Administrator Guide
{: .no_toc }

System administration and configuration.
{: .fs-6 .fw-300 }

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Admin Responsibilities

As a system administrator, you can:

- Manage all employee records
- Configure departments and roles
- Process payroll
- Set up leave types and policies
- Manage expense categories
- Create company-wide events
- Access all reports

---

## User Management

### Creating Users

1. Navigate to **Staff Directory** > **Add Employee**
2. Fill in required fields:
   - Email (must be unique)
   - First and last name
   - Department
   - Position
   - Role (Staff, Manager, HR, Admin)
3. System generates temporary password
4. Employee receives welcome email

### Resetting Passwords

1. Go to employee profile
2. Click **Actions** > **Reset Password**
3. New temporary password generated
4. Employee notified by email

### Role Management

| Role | Permissions |
|------|-------------|
| Staff | View own data, submit requests |
| Manager | + Approve team requests |
| HR | + Manage employees, payroll |
| Admin | Full system access |

---

## Department Configuration

### Adding Departments

1. Go to **Settings** > **Departments**
2. Click **Add Department**
3. Enter:
   - Name
   - Code (unique identifier)
   - Description
4. Save

### Assigning Employees
Employees are assigned to departments via their profile.

---

## Leave Configuration

### Leave Types

1. Navigate to **Settings** > **Leave Types**
2. View/edit existing types:
   - Name
   - Code
   - Default days
   - Description

### Annual Reset
Leave balances automatically reset on January 1st.

---

## Payroll Administration

### Monthly Payroll Process

1. **Prepare**
   - Verify employee salary info is current
   - Check for new hires/terminations

2. **Generate**
   - Navigate to **Payroll** > **Run Payroll**
   - Select month/year
   - Review calculations
   - Generate payslips

3. **Review**
   - Check CPF calculations
   - Verify deductions
   - Compare to previous month

4. **Finalize**
   - Approve payroll
   - Mark as Paid after bank transfer

### CPF Submission
Export CPF data for submission to CPF Board.

---

## Expense Administration

### Category Management

1. Go to **Settings** > **Expense Categories**
2. Add/edit categories:
   - Name
   - Code
   - Description

### Bulk Approval
Approve multiple expenses at once:
1. Select expenses in list
2. Click **Bulk Actions** > **Approve**
3. Confirm

---

## Calendar Administration

### Managing Holidays

1. Navigate to **Calendar**
2. Add public holidays for the year
3. Set as "All Day" events
4. Choose "Holiday" type

### Company Events
Create company-wide events visible to all employees.

---

## Reports

### Available Reports

| Report | Description |
|--------|-------------|
| Employee List | All employees with details |
| Leave Summary | Leave taken by employee |
| Payroll Summary | Monthly payroll totals |
| Expense Report | Claims by category/period |
| CPF Report | CPF contributions summary |

### Exporting
All reports can be exported as:
- PDF
- CSV
- Excel

---

## System Settings

### Company Information
Update company details displayed in the system:
- Company name
- Address
- Contact information
- Logo

### Email Configuration
Configure email notifications:
- Sender address
- Email templates
- Notification preferences

---

## Security

### Best Practices
- Use strong passwords
- Review user access regularly
- Monitor audit logs
- Keep the system updated

### Audit Logs
View system activity:
- User logins
- Data changes
- Approvals
