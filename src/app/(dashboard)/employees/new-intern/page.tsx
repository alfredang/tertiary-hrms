import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddEmployeeForm } from "../new/add-employee-form";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

async function getDepartments() {
  return prisma.department.findMany({ orderBy: { name: "asc" } });
}

export default async function CreateInternPage() {
  const session = await auth();

  if (!isDevAuthSkipped()) {
    if (!session?.user) {
      redirect("/login");
    }
    if (!["ADMIN", "HR"].includes(session.user.role)) {
      redirect("/employees");
    }
  }

  const departments = await getDepartments();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Create Intern</h1>
        <p className="text-gray-400 mt-1">Register a new intern</p>
      </div>
      <AddEmployeeForm departments={departments} intent="INTERN" />
    </div>
  );
}
