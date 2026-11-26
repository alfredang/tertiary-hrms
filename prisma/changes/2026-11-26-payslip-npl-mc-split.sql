-- Intern payslip formula (Alfred, 26 Nov 2026): No Pay Leave and MC as their own lines.
-- Additive only; existing rows keep 0 (their combined unpaid days stay in unpaidLeaveDays).
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "mcDays" DECIMAL(4,1) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "mcDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "nplDays" DECIMAL(4,1) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "nplDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;
