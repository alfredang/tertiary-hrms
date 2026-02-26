import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { Building2, Mail, Phone, Calendar, Briefcase, User } from "lucide-react";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  let user;
  if (isDevAuthSkipped()) {
    user = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: {
        employee: {
          include: {
            department: true,
            salaryInfo: true,
          },
        },
      },
    });
  } else {
    if (!session?.user?.email) return null;
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        employee: {
          include: {
            department: true,
            salaryInfo: true,
          },
        },
      },
    });
  }

  if (!user || !user.employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Profile</h1>
        <p className="text-sm sm:text-base text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const emp = user.employee;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">My Profile</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">Your personal information</p>
      </div>

      {/* Profile Header */}
      <Card className="bg-gray-950 border-gray-800">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 bg-primary">
              <AvatarFallback className="bg-primary text-white text-xl sm:text-2xl">
                {getInitials(emp.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-bold text-white">{emp.name}</h2>
              <p className="text-gray-400">{emp.position ?? "—"}</p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  {emp.status}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  {user.role}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  {emp.employeeId}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white">{emp.email}</p>
              </div>
            </div>
            {emp.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Phone</p>
                  <p className="text-white">{emp.phone}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-400">Date of Birth</p>
                <p className="text-white">{emp.dateOfBirth ? format(emp.dateOfBirth, "d MMM yyyy") : "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">Gender</p>
              <p className="text-white">{emp.gender}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Nationality</p>
              <p className="text-white">{emp.nationality}</p>
            </div>
          </CardContent>
        </Card>

        {/* Employment Information */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5" />
              Employment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-400">Department</p>
                <p className="text-white">{emp.department?.name ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">Position</p>
              <p className="text-white">{emp.position ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Employment Type</p>
              <p className="text-white">{emp.employmentType.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Start Date</p>
              <p className="text-white">{emp.startDate ? format(emp.startDate, "d MMM yyyy") : "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
