CREATE TABLE "report_action" ("id" TEXT NOT NULL, "reportId" TEXT NOT NULL, "operator" TEXT NOT NULL, "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "previousStatus" TEXT, "nextStatus" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "report_action_pkey" PRIMARY KEY ("id"));
CREATE INDEX "report_action_reportId_createdAt_idx" ON "report_action"("reportId", "createdAt");
ALTER TABLE "report_action" ADD CONSTRAINT "report_action_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
