import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_NAME } from "./constants";

interface PayslipData {
  employee: {
    name: string;
    id: string;
    department: string;
    position: string;
  };
  payPeriod: {
    start: Date;
    end: Date;
  };
  paymentDate: Date;
  earnings: {
    basicSalary: number;
    allowances: number;
    overtime: number;
    bonus: number;
    gross: number;
  };
  deductions: {
    cpfEmployee: number;
    incomeTax: number;
    other: number;
    total: number;
  };
  cpf: {
    employee: number;
    employer: number;
    total: number;
  };
  netSalary: number;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function generatePayslipPDF(data: PayslipData): ArrayBuffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header - Company Name
  doc.setFontSize(20);
  doc.setTextColor(79, 70, 229); // Indigo
  doc.text(COMPANY_NAME, pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("123 Business Street, Singapore 123456", pageWidth / 2, 27, {
    align: "center",
  });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("PAYSLIP", pageWidth / 2, 40, { align: "center" });

  // Pay Period
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Pay Period: ${formatDate(data.payPeriod.start)} - ${formatDate(data.payPeriod.end)}`,
    14,
    50
  );
  doc.text(`Payment Date: ${formatDate(data.paymentDate)}`, pageWidth - 14, 50, {
    align: "right",
  });

  // Employee Info Table
  autoTable(doc, {
    startY: 55,
    head: [["Employee Details", ""]],
    body: [
      ["Name", data.employee.name],
      ["Employee ID", data.employee.id],
      ["Department", data.employee.department],
      ["Position", data.employee.position],
    ],
    theme: "grid",
    headStyles: { fillColor: [79, 70, 229], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40 },
      1: { cellWidth: "auto" },
    },
  });

  // Earnings Table
  const earningsY = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: earningsY,
    head: [["Earnings", "Amount (SGD)"]],
    body: [
      ["Basic Salary", formatCurrency(data.earnings.basicSalary)],
      ["Allowances", formatCurrency(data.earnings.allowances)],
      ["Overtime", formatCurrency(data.earnings.overtime)],
      ["Bonus", formatCurrency(data.earnings.bonus)],
      [
        { content: "Gross Salary", styles: { fontStyle: "bold" } },
        {
          content: formatCurrency(data.earnings.gross),
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [34, 197, 94], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: "right" },
    },
  });

  // Deductions Table
  const deductionsY = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: deductionsY,
    head: [["Deductions", "Amount (SGD)"]],
    body: [
      ["CPF (Employee)", formatCurrency(data.deductions.cpfEmployee)],
      ["Income Tax", formatCurrency(data.deductions.incomeTax)],
      ["Other Deductions", formatCurrency(data.deductions.other)],
      [
        { content: "Total Deductions", styles: { fontStyle: "bold" } },
        {
          content: formatCurrency(data.deductions.total),
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [239, 68, 68], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: "right" },
    },
  });

  // CPF Summary Table
  const cpfY = (doc as any).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: cpfY,
    head: [["CPF Contributions", "Amount (SGD)"]],
    body: [
      ["Employee Contribution (20%)", formatCurrency(data.cpf.employee)],
      ["Employer Contribution (17%)", formatCurrency(data.cpf.employer)],
      [
        { content: "Total CPF", styles: { fontStyle: "bold" } },
        {
          content: formatCurrency(data.cpf.total),
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: "right" },
    },
  });

  // Net Salary
  const netY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setTextColor(79, 70, 229);
  doc.text(`Net Salary: SGD ${formatCurrency(data.netSalary)}`, pageWidth / 2, netY, {
    align: "center",
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "This is a computer-generated document. No signature is required.",
    pageWidth / 2,
    280,
    { align: "center" }
  );

  // Convert to ArrayBuffer for API response
  return doc.output("arraybuffer");
}
