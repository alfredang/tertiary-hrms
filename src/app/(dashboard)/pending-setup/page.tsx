import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Clock, Mail } from "lucide-react";

export default async function PendingSetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.employeeId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-amber-950/50 rounded-full flex items-center justify-center">
          <Clock className="h-8 w-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Account Pending Setup</h1>
        <p className="text-gray-400">
          Your account has been created successfully. An HR administrator needs to
          complete your employee profile before you can access the system.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Mail className="h-4 w-4" />
          <span>{session.user.email}</span>
        </div>
      </div>
    </div>
  );
}
