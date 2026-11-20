-- No Pay Leave payback (Alfred, 20 Nov 2026). Additive only: one new table, no existing data touched.
-- CreateTable
CREATE TABLE "NplPayback" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "nplDate" DATE NOT NULL,
    "workDate" DATE NOT NULL,
    "days" DECIMAL(3,1) NOT NULL DEFAULT 1,
    "note" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalComment" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NplPayback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NplPayback_employeeId_status_idx" ON "NplPayback"("employeeId", "status");

-- CreateIndex
CREATE INDEX "NplPayback_leaveRequestId_idx" ON "NplPayback"("leaveRequestId");

-- CreateIndex
CREATE INDEX "NplPayback_status_idx" ON "NplPayback"("status");

-- AddForeignKey
ALTER TABLE "NplPayback" ADD CONSTRAINT "NplPayback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NplPayback" ADD CONSTRAINT "NplPayback_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NplPayback" ADD CONSTRAINT "NplPayback_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

