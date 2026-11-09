import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTrainerAccess } from "@/lib/trainer-access";
import { Card } from "@/components/ui/card";
import { TrainerForm, EMPTY_TRAINER } from "@/components/trainers/trainer-form";

export const dynamic = "force-dynamic";

export default async function NewTrainerPage() {
  const access = await getTrainerAccess();
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/trainers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Trainer directory
      </Link>
      <h1 className="text-2xl font-bold">Add trainer</h1>
      <Card className="p-5">
        <TrainerForm initial={EMPTY_TRAINER} />
      </Card>
    </div>
  );
}
