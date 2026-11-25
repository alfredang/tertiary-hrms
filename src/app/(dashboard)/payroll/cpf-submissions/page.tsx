import { redirect } from "next/navigation";
import { CpfSubmissionHistory } from "@/components/payroll/cpf-submission-history";
import { sessionCanViewCpfSubmissions } from "@/lib/cpf-submission-access";

export const dynamic = "force-dynamic";

// Past CPF EZPay statements (shared CPF Drive folder), latest first. Admins and accountants.
export default async function CpfSubmissionsPage() {
  if (!(await sessionCanViewCpfSubmissions())) redirect("/payroll");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">CPF Submissions</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Every CPF EZPay statement uploaded for payroll, latest first. Payslips are generated from these.
        </p>
      </div>
      <CpfSubmissionHistory />
    </div>
  );
}
