import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { PasswordChangeCard } from "@/components/profile/password-change-card";
import { ThemeCard } from "@/components/profile/theme-card";
import { EmployeeDetailEditable } from "@/components/employees/employee-detail-editable";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  const email = isDevAuthSkipped()
    ? "admin@tertiaryinfotech.com"
    : session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      employee: {
        include: { department: true, salaryInfo: true },
      },
    },
  });

  if (!user || !user.employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Profile</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Your employee profile has not been set up yet. Please contact HR.
        </p>
      </div>
    );
  }

  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
  const employeeWithUser = { ...user.employee, user: { roles: user.roles } };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Profile</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">Your personal information</p>
      </div>

      <EmployeeDetailEditable
        employee={employeeWithUser}
        departments={departments}
        canEdit={true}
      />

      <ThemeCard />

      <PasswordChangeCard />
    </div>
  );
}
