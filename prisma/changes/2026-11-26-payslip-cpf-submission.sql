-- Payslip → the CPF EZPay statement it was generated from (Alfred, 26 Nov 2026).
-- Additive, nullable: safe to apply before or after the code that reads it.
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "cpfSubmissionFileId" TEXT;

-- Unpaid leave on base-salary payslips (Alfred, 26 Nov 2026): No Pay Leave for everyone, MC too
-- for interns, less approved paybacks. Additive with defaults.
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "unpaidLeaveDays" DECIMAL(4,1) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "unpaidLeaveDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Paybacks added back on the payslip as their own line (Alfred, 26 Nov 2026).
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "paybackDays" DECIMAL(4,1) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "paybackAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Where a payslip's figures came from: CPF statement or base salary (Alfred, 26 Nov 2026).
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "source" TEXT;
-- CPF-path payslips already recorded their statement.
UPDATE "Payslip" SET "source" = 'CPF' WHERE "source" IS NULL AND "cpfSubmissionFileId" IS NOT NULL;
