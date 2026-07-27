import { TimeOffRequestForm } from "@/components/time-off/time-off-request-form";

export const dynamic = "force-dynamic";

export default function TimeOffRequestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Time Off</h1>
        <p className="text-gray-400 mt-1">
          Submit a short time off request for your manager to approve
        </p>
      </div>

      <TimeOffRequestForm />
    </div>
  );
}
