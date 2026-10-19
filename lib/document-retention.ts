import { PrismaClient } from "@prisma/client";
import { DOCUMENTS_BUCKET, getStorageProvider } from "./storage.ts";

const prisma = new PrismaClient();

export const MIN_RETENTION_DAYS = 90;
export const MAX_RETENTION_DAYS = 3650; // 10 years upper bound
export const DEFAULT_RETENTION_DAYS = 90;

export interface PurgeExpiredDocumentsOptions {
  retentionDays?: number;
  dryRun?: boolean;
  actorUserId?: string | null;
  limit?: number;
}

export interface PurgedDocumentResult {
  id: string;
  studentId: string;
  storagePath: string;
  deletedAt: Date;
  outcome: "deleted" | "already_absent" | "dry_run";
}

export interface PurgeExpiredDocumentsSummary {
  cutoffDate: Date;
  retentionDays: number;
  dryRun: boolean;
  totalEligible: number;
  processed: number;
  succeeded: number;
  failed: number;
  results: PurgedDocumentResult[];
  errors: Array<{ id: string; error: string }>;
}

/**
 * Purge physical storage files for documents that have been soft-deleted
 * for at least the retention period (default: 90 days).
 *
 * Rules:
 * 1. Only documents with `deletedAt <= cutoffDate` AND `storagePurgedAt IS NULL` are eligible.
 * 2. Active documents (`deletedAt IS NULL`) are NEVER selected.
 * 3. Database metadata (`Document` row, original `storagePath`, etc.) is retained permanently.
 * 4. Idempotent: If the file was already deleted in storage, `already_absent` is treated as success.
 * 5. AuditLog entry with action `DOCUMENT_STORAGE_PURGE` is recorded for each purged document.
 * 6. Hard constraint: retentionDays cannot be less than 90 days.
 */
export async function purgeExpiredDocumentFiles(
  options: PurgeExpiredDocumentsOptions = {}
): Promise<PurgeExpiredDocumentsSummary> {
  const rawRetentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  if (
    typeof rawRetentionDays !== "number" ||
    !Number.isFinite(rawRetentionDays) ||
    !Number.isInteger(rawRetentionDays) ||
    rawRetentionDays < MIN_RETENTION_DAYS ||
    rawRetentionDays > MAX_RETENTION_DAYS
  ) {
    throw new Error(
      `Invalid retentionDays: ${rawRetentionDays}. Minimum retention period is ${MIN_RETENTION_DAYS} days (max: ${MAX_RETENTION_DAYS} days). Retention periods below 90 days are strictly prohibited.`
    );
  }
  const retentionDays = rawRetentionDays;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const dryRun = Boolean(options.dryRun);
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));

  // Find candidate documents meeting the strict retention cutoff
  // Use $queryRaw to query database directly, avoiding any in-memory Prisma client model cache drift
  const eligibleDocs = await prisma.$queryRaw<
    Array<{
      id: string;
      studentId: string;
      storagePath: string;
      fileName: string;
      fileSize: number;
      fileType: string;
      deletedAt: Date;
    }>
  >`
    SELECT "id", "studentId", "storagePath", "fileName", "fileSize", "fileType", "deletedAt"
    FROM "documents"
    WHERE "deletedAt" IS NOT NULL
      AND "deletedAt" <= ${cutoffDate}
      AND "storagePurgedAt" IS NULL
    ORDER BY "deletedAt" ASC
    LIMIT ${limit}
  `;

  const summary: PurgeExpiredDocumentsSummary = {
    cutoffDate,
    retentionDays,
    dryRun,
    totalEligible: eligibleDocs.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    errors: [],
  };

  if (dryRun) {
    summary.processed = eligibleDocs.length;
    summary.succeeded = eligibleDocs.length;
    summary.results = eligibleDocs.map((doc) => ({
      id: doc.id,
      studentId: doc.studentId,
      storagePath: doc.storagePath,
      deletedAt: doc.deletedAt,
      outcome: "dry_run",
    }));
    return summary;
  }

  const storage = getStorageProvider();

  for (const doc of eligibleDocs) {
    summary.processed++;

    try {
      // 1. Delete physical storage object (SupabaseStorageProvider)
      // Returns { outcome: "deleted" | "already_absent" }
      const deleteResult = await storage.delete({
        bucket: DOCUMENTS_BUCKET,
        path: doc.storagePath,
      });

      // 2. Update PostgreSQL metadata and write AuditLog in transaction
      const purgedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "documents"
          SET "storagePurgedAt" = ${purgedAt}
          WHERE "id" = ${doc.id}
        `;

        await tx.auditLog.create({
          data: {
            userId: options.actorUserId ?? null,
            action: "DOCUMENT_STORAGE_PURGE",
            entity: "Document",
            entityId: doc.id,
            changes: {
              documentId: doc.id,
              studentId: doc.studentId,
              storagePath: doc.storagePath,
              fileName: doc.fileName,
              fileSize: doc.fileSize,
              fileType: doc.fileType,
              deletedAt: doc.deletedAt?.toISOString(),
              storagePurgedAt: purgedAt.toISOString(),
              storageOutcome: deleteResult.outcome,
              retentionDays,
            },
          },
        });
      });

      summary.succeeded++;
      summary.results.push({
        id: doc.id,
        studentId: doc.studentId,
        storagePath: doc.storagePath,
        deletedAt: doc.deletedAt!,
        outcome: deleteResult.outcome,
      });
    } catch (error) {
      summary.failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      summary.errors.push({ id: doc.id, error: errorMessage });
      console.error(`Failed to purge storage for document ${doc.id}:`, error);
    }
  }

  return summary;
}
