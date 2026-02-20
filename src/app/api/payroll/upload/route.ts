import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  try {
    if (process.env.SKIP_AUTH !== "true") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (session.user.role !== "ADMIN" && session.user.role !== "HR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const month = parseInt(formData.get("month") as string);
    const year = parseInt(formData.get("year") as string);

    if (!file || !month || !year) {
      return NextResponse.json(
        { error: "File, month and year are required" },
        { status: 400 }
      );
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Excel file is empty or has no data rows" },
        { status: 400 }
      );
    }

    // Pay period
    const payPeriodStart = new Date(year, month - 1, 1);
    const payPeriodEnd = new Date(year, month, 0);
    const paymentDate = new Date(year, month - 1, 28);

    // Get all employees for matching
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeId: true, name: true },
    });

    // Create lookup maps
    const empByIdCode = new Map(employees.map((e) => [e.employeeId.toUpperCase(), e]));
    const empByName = new Map(employees.map((e) => [e.name.toUpperCase().trim(), e]));

    const results = { created: 0, updated: 0, errors: 0, errorDetails: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed header + 1)

      try {
        // Try to match employee by Employee ID or Name
        const empIdVal = String(row["Employee ID"] || row["EmployeeID"] || row["Emp ID"] || row["EmpID"] || "").trim().toUpperCase();
        const nameVal = String(row["Name"] || row["Employee Name"] || row["EmployeeName"] || "").trim().toUpperCase();

        let matchedEmployee = empByIdCode.get(empIdVal) || empByName.get(nameVal);

        if (!matchedEmployee) {
          results.errors++;
          results.errorDetails.push(`Row ${rowNum}: Could not match employee "${nameVal || empIdVal}"`);
          continue;
        }

        // Parse salary fields - try multiple column name variants
        const basicSalary = parseNumber(row["Basic Salary"] || row["BasicSalary"] || row["Basic"] || 0);
        const allowances = parseNumber(row["Allowances"] || row["Allowance"] || 0);
        const overtime = parseNumber(row["Overtime"] || row["OT"] || 0);
        const bonus = parseNumber(row["Bonus"] || 0);
        const cpfEmployee = parseNumber(row["CPF Employee"] || row["CPF (Employee)"] || row["Employee CPF"] || row["CPFEmployee"] || 0);
        const cpfEmployer = parseNumber(row["CPF Employer"] || row["CPF (Employer)"] || row["Employer CPF"] || row["CPFEmployer"] || 0);
        const incomeTax = parseNumber(row["Income Tax"] || row["Tax"] || row["IncomeTax"] || 0);
        const otherDeductions = parseNumber(row["Other Deductions"] || row["OtherDeductions"] || row["Deductions"] || 0);

        const grossSalary = basicSalary + allowances + overtime + bonus;
        const totalDeductions = cpfEmployee + incomeTax + otherDeductions;
        const netSalary = grossSalary - totalDeductions;

        // Upsert payslip (create or overwrite)
        const existing = await prisma.payslip.findUnique({
          where: {
            employeeId_payPeriodStart_payPeriodEnd: {
              employeeId: matchedEmployee.id,
              payPeriodStart,
              payPeriodEnd,
            },
          },
        });

        const payslipData = {
          basicSalary,
          allowances,
          overtime,
          bonus,
          grossSalary,
          cpfEmployee,
          cpfEmployer,
          incomeTax,
          otherDeductions,
          totalDeductions,
          netSalary,
          paymentDate,
          status: "GENERATED" as const,
        };

        if (existing) {
          await prisma.payslip.update({
            where: { id: existing.id },
            data: payslipData,
          });
          results.updated++;
        } else {
          await prisma.payslip.create({
            data: {
              employeeId: matchedEmployee.id,
              payPeriodStart,
              payPeriodEnd,
              ...payslipData,
            },
          });
          results.created++;
        }
      } catch (error) {
        results.errors++;
        results.errorDetails.push(`Row ${rowNum}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      message: `Payroll uploaded for ${month}/${year}`,
      totalRows: rows.length,
      ...results,
    });
  } catch (error) {
    console.error("Error uploading payroll:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,$\s]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}
