-- Additive only. Existing rows retain calendar-year behavior (all three values NULL).
ALTER TABLE "LeaveBalance" ADD COLUMN IF NOT EXISTS "periodStart" DATE;
ALTER TABLE "LeaveBalance" ADD COLUMN IF NOT EXISTS "periodEnd" DATE;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "balanceYear" INTEGER;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "balanceDays" DECIMAL(5,2);
