-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "storagePurgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documents_deletedAt_storagePurgedAt_idx" ON "documents"("deletedAt", "storagePurgedAt");
