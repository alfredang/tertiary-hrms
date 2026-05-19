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

  // Title — "Payslip for May 2026"
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text(`Payslip for ${monthTitle(data.payPeriod.start)}`, pageWidth / 2, 40, {
    align: "center",
  });

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
