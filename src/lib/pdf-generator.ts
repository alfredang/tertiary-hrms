import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PayslipData {
  company: {
    name: string;
    address: string;
    logo?: string | null;
  };
  employee: {
    name: string;
    id: string;
    department: string;
    position: string;
    nric?: string | null;
  };
  payPeriod: {
    start: Date;
    end: Date;
  };
  paymentDate: Date;
  remarks?: string | null;
  titleTemplate?: string | null;
  headerNote?: string | null;
  /** Interns have no CPF: the payslip says so instead of showing CPF figures. */
  intern?: boolean;
  earnings: {
    basicSalary: number;
    allowances: number;
    overtime: number;
    bonus: number;
    /** Approved paybacks (off days worked) added back this month. */
    paybackDays?: number;
    paybackAmount?: number;
    gross: number;
  };
  deductions: {
    cpfEmployee: number;
    incomeTax: number;
    other: number;
    /** Unpaid days taken this month: No Pay Leave (and MC for interns). */
    unpaidLeaveDays?: number;
    unpaidLeaveAmount?: number;
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

function formatDays(days: number, amount?: number): string {
  const label = `${days} day${days === 1 ? "" : "s"}`;
  // Show the day rate so the line explains itself: "5 days × 45.45".
  return amount && days ? `${label} × ${formatCurrency(amount / days)}` : label;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function monthTitle(d: Date): string {
  return new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(d);
}

export function generatePayslipPDF(data: PayslipData): ArrayBuffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  let logoTop = 12;
  // Optional logo (data URL or http URL) — only data URLs work reliably with jsPDF on the server
  if (data.company.logo && data.company.logo.startsWith("data:image")) {
    try {
      const fmt = data.company.logo.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(data.company.logo, fmt, 14, 10, 25, 25);
      logoTop = 10;
    } catch {
      // Ignore logo failures
    }
  }

  // Header - Company Name
  doc.setFontSize(18);
  doc.setTextColor(79, 70, 229);
  doc.text(data.company.name, pageWidth / 2, 18, { align: "center" });

  if (data.company.address) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(data.company.address, pageWidth / 2, 25, { align: "center" });
  }

  // Optional editable header note (e.g. tagline) just below address
  let titleY = 40;
  if (data.headerNote && data.headerNote.trim()) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(data.headerNote.trim(), pageWidth / 2, 31, { align: "center" });
    titleY = 42;
  }

  // Title — editable template, defaults to "Payslip for the Month {MONTH}"
  const titleTpl = data.titleTemplate?.trim() || "Payslip for the Month {MONTH}";
  const renderedTitle = titleTpl.replace(/\{MONTH\}/g, monthTitle(data.payPeriod.start));
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text(renderedTitle, pageWidth / 2, titleY, { align: "center" });

  // Pay Period + Payment Date
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Pay Period: ${formatDate(data.payPeriod.start)} - ${formatDate(data.payPeriod.end)}`,
    14,
    50,
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
      ...(data.employee.nric ? [["NRIC", data.employee.nric]] : []),
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
      [data.intern ? "Monthly Allowance (flat)" : "Allowances", formatCurrency(data.earnings.allowances)],
      ["Overtime", formatCurrency(data.earnings.overtime)],
      ["Bonus", formatCurrency(data.earnings.bonus)],
      ...(data.earnings.paybackDays
        ? [[
            `Add back: payback, off days worked (${formatDays(data.earnings.paybackDays, data.earnings.paybackAmount)})`,
            `+ ${formatCurrency(data.earnings.paybackAmount ?? 0)}`,
          ]]
        : []),
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
      data.intern
        ? ["CPF (Employee): none, interns have no CPF", formatCurrency(0)]
        : ["CPF (Employee)", formatCurrency(data.deductions.cpfEmployee)],
      ...(data.deductions.unpaidLeaveDays
        ? [[
            `${data.intern ? "MC / No Pay Leave" : "No Pay Leave"} (${formatDays(data.deductions.unpaidLeaveDays, data.deductions.unpaidLeaveAmount)})`,
            `- ${formatCurrency(data.deductions.unpaidLeaveAmount ?? 0)}`,
          ]]
        : []),
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
    body: data.intern
      ? [["No CPF: interns are not CPF members (employee 0.00, employer 0.00)", formatCurrency(0)]]
      : [
          ["Employee Contribution", formatCurrency(data.cpf.employee)],
          ["Employer Contribution", formatCurrency(data.cpf.employer)],
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

  // Take Home Pay
  const netY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setTextColor(79, 70, 229);
  doc.text(`Take Home Pay: SGD ${formatCurrency(data.netSalary)}`, pageWidth / 2, netY, {
    align: "center",
  });

  // Remarks (optional, from template)
  if (data.remarks) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    const lines = doc.splitTextToSize(data.remarks, pageWidth - 28);
    doc.text(lines, 14, netY + 12);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "This is a computer-generated document. No signature is required.",
    pageWidth / 2,
    285,
    { align: "center" },
  );

  // Convert to ArrayBuffer for API response
  return doc.output("arraybuffer");
}
