#!/usr/bin/env node

/**
 * CLI Runner: Document Storage Retention Purge (90-Day Policy)
 *
 * NOTE: This CLI script is an EXECUTION WORKER / RUNNER, NOT a scheduler.
 * In production, it should be invoked periodically (e.g. daily at 02:00 AM)
 * by a system orchestrator (e.g., Linux crontab, systemd timer, or task runner).
 *
 * Security Constraints:
 * 1. Minimum retention policy is 90 days (enforced on server and runner).
 * 2. Live execution rejects any --retention-days < 90 with exit code 1.
 * 3. No backdoors or overrides exist that can delete real documents prematurely.
 * 4. --dry-run mode is strictly non-mutating on database and physical storage.
 *
 * Usage:
 *   node scripts/purge-expired-documents.mjs [--retention-days=90] [--dry-run] [--limit=100]
 */

import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  purgeExpiredDocumentFiles,
} from "../lib/document-retention.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    retentionDays: DEFAULT_RETENTION_DAYS,
    dryRun: false,
    limit: 100,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--retention-days=")) {
      const rawVal = arg.split("=")[1];
      if (!/^\d+$/.test(rawVal)) {
        console.error(
          `[SECURITY ERROR] --retention-days must be a valid positive integer, received: "${rawVal}"`
        );
        process.exit(1);
      }
      const val = parseInt(rawVal, 10);
      if (val < MIN_RETENTION_DAYS) {
        console.error(
          `[SECURITY VIOLATION] Retention days cannot be less than ${MIN_RETENTION_DAYS} days (received: ${val}). Execution aborted to prevent premature deletion of document records.`
        );
        process.exit(1);
      }
      if (val > MAX_RETENTION_DAYS) {
        console.error(
          `[SECURITY ERROR] --retention-days exceeds maximum allowed limit of ${MAX_RETENTION_DAYS} days (received: ${val}).`
        );
        process.exit(1);
      }
      options.retentionDays = val;
    } else if (arg.startsWith("--limit=")) {
      const rawVal = arg.split("=")[1];
      if (!/^\d+$/.test(rawVal)) {
        console.error(
          `[ERROR] --limit must be a valid positive integer, received: "${rawVal}"`
        );
        process.exit(1);
      }
      const val = parseInt(rawVal, 10);
      if (val < 1 || val > 500) {
        console.error(
          `[ERROR] --limit must be an integer between 1 and 500, received: ${val}`
        );
        process.exit(1);
      }
      options.limit = val;
    } else {
      console.error(`[ERROR] Unrecognized argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

async function run() {
  const { retentionDays, dryRun, limit } = parseArgs();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  console.log("=== GHS Document Retention Purge Runner ===");
  console.log(`Execution Time: ${now.toISOString()}`);
  console.log(`Retention Policy: ${retentionDays} days (Enforced Floor: ${MIN_RETENTION_DAYS} days)`);
  console.log(`Cutoff Date: ${cutoffDate.toISOString()}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (No deletions)" : "LIVE EXECUTION"}`);
  console.log(`Batch Limit: ${limit}\n`);

  // Invoke core retention service which shares unified transaction and storage deletion logic
  const summary = await purgeExpiredDocumentFiles({
    retentionDays,
    dryRun,
    limit,
    actorUserId: null,
  });

  console.log(`Found ${summary.totalEligible} eligible document(s) for physical purge.`);

  if (dryRun) {
    if (summary.totalEligible > 0) {
      console.log("\n[DRY RUN] Candidate documents to be purged:");
      for (const doc of summary.results) {
        const deletedAtStr = doc.deletedAt instanceof Date ? doc.deletedAt.toISOString() : String(doc.deletedAt);
        console.log(` - ID: ${doc.id} | DeletedAt: ${deletedAtStr} | Path: ${doc.storagePath}`);
      }
    } else {
      console.log("No documents meet the 90-day retention cutoff for purging.");
    }
    console.log("\nDry run completed. 0 files modified or deleted.");
    return;
  }

  if (summary.totalEligible === 0) {
    console.log("No documents require purging at this time.");
    return;
  }

  console.log(`\n=== Purge Execution Results ===`);
  for (const doc of summary.results) {
    console.log(`[PURGED] ${doc.id} (${doc.outcome}): ${doc.storagePath}`);
  }
  for (const err of summary.errors) {
    console.error(`[ERROR] Failed to purge document ${err.id}: ${err.error}`);
  }

  console.log(`\n=== Purge Summary ===`);
  console.log(`Total Eligible: ${summary.totalEligible}`);
  console.log(`Succeeded: ${summary.succeeded}`);
  console.log(`Failed: ${summary.failed}`);
}

run().catch((err) => {
  console.error("Purge runner failed:", err);
  process.exitCode = 1;
});
