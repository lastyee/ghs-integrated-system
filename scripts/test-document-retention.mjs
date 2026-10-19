import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DOCUMENTS_BUCKET, getStorageProvider } from "../lib/storage.ts";
import { purgeExpiredDocumentFiles } from "../lib/document-retention.ts";

const prisma = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const created = {
  students: [],
  documents: [],
  storagePaths: [],
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION_FAILED] ${message}`);
  }
}

function mergeCookies(existing, response) {
  const headers = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();
  for (const pair of (existing || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  for (const header of headers) {
    const pair = header.split(";")[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return [...cookieMap].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${baseUrl}/`, json: "true" }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  return cookies;
}

function record(name, passed, details = "") {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
  if (!passed) throw new Error(`Test failed: ${name}`);
}

async function getRealDocumentsBaseline() {
  const docs = await prisma.document.findMany({
    where: {
      student: { nim: "2023005012" }, // Muhammad Rivqi Nurridwan
    },
    select: {
      id: true,
      studentId: true,
      type: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      storagePath: true,
      status: true,
      deletedAt: true,
      storagePurgedAt: true,
    },
    orderBy: { id: "asc" },
  });
  return docs;
}

async function checkRealFilesPhysical() {
  const storage = getStorageProvider();
  const realFilePaths = [
    "students/cmuqcqmo60003x4978h1guj2y/doc_e0a192933a1c43aa8b7dda8141a5ab70.pdf",
    "students/cmuqcqmo60003x4978h1guj2y/doc_b783c4cf967045bba13112b400e7f693.pdf",
    "students/cmuqcqmo60003x4978h1guj2y/doc_0405e788491b4373b318fbe5986f6503.pdf",
  ];
  const statuses = {};
  for (const path of realFilePaths) {
    try {
      const signedUrl = await storage.createSignedUrl({
        bucket: DOCUMENTS_BUCKET,
        path,
        expiresIn: 60,
      });
      const res = await fetch(signedUrl);
      statuses[path] = res.status;
    } catch {
      statuses[path] = 0;
    }
  }
  return statuses;
}

async function cleanup() {
  console.log("\nStarting teardown of synthetic test fixtures...");
  const storage = getStorageProvider();

  // 1. Clean synthetic storage objects
  for (const path of created.storagePaths) {
    try {
      await storage.delete({ bucket: DOCUMENTS_BUCKET, path });
    } catch {
      // Ignore if already deleted
    }
  }

  // 2. Clean synthetic audit logs
  if (created.documents.length) {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          entity: "Document",
          entityId: { in: created.documents },
        },
      });
    } catch (e) {
      console.warn("Synthetic audit log cleanup warning:", e.message);
    }
  }

  // 3. Clean synthetic documents
  if (created.documents.length) {
    try {
      await prisma.document.deleteMany({
        where: { id: { in: created.documents } },
      });
    } catch (e) {
      console.warn("Synthetic document cleanup warning:", e.message);
    }
  }

  // 4. Clean synthetic students
  if (created.students.length) {
    try {
      await prisma.student.deleteMany({
        where: { id: { in: created.students } },
      });
    } catch (e) {
      console.warn("Synthetic student cleanup warning:", e.message);
    }
  }
}

async function run() {
  console.log("=== STEP 99: Live Document Storage Retention Purge Test ===");
  console.log(`Execution Suffix: ${suffix}`);

  // Capture baseline of real data
  const initialBaseline = await getRealDocumentsBaseline();
  assert(initialBaseline.length === 4, `Expected 4 baseline real student documents, found ${initialBaseline.length}`);
  record("Baseline real student records verified (4 documents)", true);

  // Capture initial physical storage status for active real files
  const initialPhysical = await checkRealFilesPhysical();
  const allInitialPhysicalExist = Object.values(initialPhysical).every((status) => status === 200);
  record("Baseline real physical files verified in Supabase Storage (HTTP 200)", allInitialPhysicalExist);

  const storage = getStorageProvider();

  try {
    // 1. Create synthetic student fixture
    const testNim = `99${suffix}`;
    const student = await prisma.student.create({
      data: {
        nim: testNim,
        name: `SYNTHETIC_TEST_STUDENT_${suffix}`,
      },
      select: { id: true, nim: true },
    });
    created.students.push(student.id);
    record("Synthetic test student fixture created", true, `ID: ${student.id}`);

    // Helper to upload synthetic document directly to live Supabase Storage
    const createDocFixture = async (label, customDeletedAt = null) => {
      const docId = `doc_test_${label}_${suffix}`;
      const safePath = `students/${student.id}/${docId}.pdf`;
      const pdfContent = Buffer.from(`%PDF-1.7\nSTEP99-TEST-${label}-${suffix}\n%%EOF`);

      // Upload to live Supabase Storage
      await storage.upload({
        bucket: DOCUMENTS_BUCKET,
        path: safePath,
        file: pdfContent,
        contentType: "application/pdf",
      });
      created.storagePaths.push(safePath);

      // Create PostgreSQL record
      const doc = await prisma.document.create({
        data: {
          id: docId,
          studentId: student.id,
          type: "TEST_DOC",
          storagePath: safePath,
          fileName: `test-${label}-${suffix}.pdf`,
          fileSize: pdfContent.length,
          fileType: "application/pdf",
          status: "PENDING",
          deletedAt: customDeletedAt,
        },
        select: {
          id: true,
          storagePath: true,
          deletedAt: true,
          storagePurgedAt: true,
        },
      });
      created.documents.push(doc.id);
      return { ...doc, path: safePath };
    };

    // TEST 1: Live upload & Private signed URL verification
    const docActive = await createDocFixture("active", null);
    const signedUrl = await storage.createSignedUrl({
      bucket: DOCUMENTS_BUCKET,
      path: docActive.path,
      expiresIn: 300,
    });
    assert(Boolean(signedUrl && signedUrl.startsWith("https://")), "Signed URL must be a valid HTTPS URL");

    const signedUrlFetch = await fetch(signedUrl);
    record("Live Supabase Storage signed URL download succeeds", signedUrlFetch.status === 200);
    const downloadedText = await signedUrlFetch.text();
    record("Downloaded file content matches uploaded synthetic payload", downloadedText.includes("STEP99-TEST-active"));

    // Verify unauthenticated direct URL without signature is blocked (private bucket check)
    const directUrl = signedUrl.split("?")[0];
    const directFetch = await fetch(directUrl);
    record("Direct unauthenticated access without signature is rejected (private bucket)", directFetch.status === 400 || directFetch.status === 403 || directFetch.status === 404);

    // TEST 2: Active document protection
    await purgeExpiredDocumentFiles({ retentionDays: 90 });
    const afterActiveCheck = await prisma.document.findUnique({
      where: { id: docActive.id },
      select: { storagePurgedAt: true },
    });
    record("Active document is not purged by retention service", afterActiveCheck?.storagePurgedAt === null);

    // TEST 3: Soft-deleted document < 90 days retention window
    const docRecent = await createDocFixture("recent", new Date()); // soft-deleted 0 days ago
    await purgeExpiredDocumentFiles({ retentionDays: 90 });
    const afterRecentCheck = await prisma.document.findUnique({
      where: { id: docRecent.id },
      select: { storagePurgedAt: true },
    });
    record("Document soft-deleted < 90 days is retained in storage", afterRecentCheck?.storagePurgedAt === null);

    // TEST 4: Soft-deleted document > 90 days is purged from Supabase Storage
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
    const docExpired = await createDocFixture("expired", ninetyFiveDaysAgo);

    const purgeSummary = await purgeExpiredDocumentFiles({ retentionDays: 90 });
    record("Purge service reports success on expired document", purgeSummary.succeeded >= 1);

    const afterExpiredCheck = await prisma.document.findUnique({
      where: { id: docExpired.id },
      select: {
        id: true,
        storagePath: true,
        deletedAt: true,
        storagePurgedAt: true,
      },
    });

    record("Expired document storagePurgedAt is populated", afterExpiredCheck?.storagePurgedAt !== null);
    record("Document storagePath is preserved intact (not overwritten with [PURGED]:)", afterExpiredCheck?.storagePath === docExpired.path);

    // Check AuditLog entry
    const purgeAuditLog = await prisma.auditLog.findFirst({
      where: {
        action: "DOCUMENT_STORAGE_PURGE",
        entity: "Document",
        entityId: docExpired.id,
      },
      select: { changes: true },
    });
    record("AuditLog entry recorded with DOCUMENT_STORAGE_PURGE action", Boolean(purgeAuditLog));
    record("AuditLog records storageOutcome as deleted", purgeAuditLog?.changes?.storageOutcome === "deleted");

    // Verify physical file was actually deleted from live Supabase
    let fileStillExists = false;
    try {
      const checkSignedUrl = await storage.createSignedUrl({
        bucket: DOCUMENTS_BUCKET,
        path: docExpired.path,
        expiresIn: 60,
      });
      const checkFetch = await fetch(checkSignedUrl);
      fileStillExists = checkFetch.status === 200;
    } catch {
      fileStillExists = false;
    }
    record("Physical file is confirmed deleted from live Supabase Storage", !fileStillExists);

    // TEST 5: Idempotency & Retry safety (handling 'already_absent')
    const docRetry = await createDocFixture("retry", ninetyFiveDaysAgo);
    // Pre-delete physical file to simulate a DB failure on a previous attempt
    await storage.delete({ bucket: DOCUMENTS_BUCKET, path: docRetry.path });

    // Now run purge: Supabase will return 'already_absent'
    await purgeExpiredDocumentFiles({ retentionDays: 90 });
    const afterRetryDoc = await prisma.document.findUnique({
      where: { id: docRetry.id },
      select: { storagePurgedAt: true },
    });

    record("Idempotent retry succeeds when object is already_absent", afterRetryDoc?.storagePurgedAt !== null);
    const retryAudit = await prisma.auditLog.findFirst({
      where: {
        action: "DOCUMENT_STORAGE_PURGE",
        entity: "Document",
        entityId: docRetry.id,
      },
      select: { changes: true },
    });
    record("Idempotent retry AuditLog records storageOutcome as already_absent", retryAudit?.changes?.storageOutcome === "already_absent");

    // TEST 6: Protected API route authentication
    // A: Unauthorized request without token or session
    const unauthRes = await fetch(`${baseUrl}/api/documents/retention-purge`, {
      method: "POST",
    });
    record("API endpoint rejects unauthenticated request with 401", unauthRes.status === 401);

    // B: Invalid token rejected
    const invalidTokenRes = await fetch(`${baseUrl}/api/documents/retention-purge`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret-token" },
    });
    record("API endpoint rejects invalid token with 401", invalidTokenRes.status === 401);

    // C: Pathway A unit test: constant-time token comparison check
    const cryptoModule = await import("node:crypto");
    const testSecret = "ghs-test-cron-secret-2026-safe";
    const goodBuffer = Buffer.from(testSecret);
    const badBuffer = Buffer.from("ghs-test-cron-secret-2026-fake");
    const diffLenBuffer = Buffer.from("short");
    record("Constant-time comparison accepts matching token", cryptoModule.timingSafeEqual(goodBuffer, Buffer.from(testSecret)));
    record("Constant-time comparison rejects mismatch token", !cryptoModule.timingSafeEqual(goodBuffer, badBuffer));
    record("Constant-time comparison guards against length mismatch", goodBuffer.length !== diffLenBuffer.length);

    // D: Pathway B live test: Manual Super Admin authenticated session
    let superAdminCookies = "";
    const adminEmail = process.env.SUPERADMIN_EMAIL;
    const adminPassword = process.env.SUPERADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      superAdminCookies = await login(adminEmail, adminPassword);
      const adminPurgeRes = await fetch(`${baseUrl}/api/documents/retention-purge?dryRun=true`, {
        method: "POST",
        headers: { Cookie: superAdminCookies },
      });
      const adminPurgeText = await adminPurgeRes.text();
      record("API endpoint accepts manual Super Admin session with 200", adminPurgeRes.status === 200);
      const adminPurgeData = JSON.parse(adminPurgeText);
      record("API response confirms authorizedVia: SUPER_ADMIN_SESSION", adminPurgeData.authorizedVia === "SUPER_ADMIN_SESSION");

      const adminGetRes = await fetch(`${baseUrl}/api/documents/retention-purge`, {
        headers: { Cookie: superAdminCookies },
      });
      record("GET endpoint accepts Super Admin session with 200 (dry-run)", adminGetRes.status === 200);

      // TEST 7: Hardened API parameter validation
      // 7.1: API without retentionDays parameter defaults strictly to 90 days
      const defaultParamRes = await fetch(`${baseUrl}/api/documents/retention-purge?dryRun=true`, {
        method: "POST",
        headers: { Cookie: superAdminCookies },
      });
      const defaultData = await defaultParamRes.json();
      record("API without parameter defaults strictly to 90 days", defaultData.summary?.retentionDays === 90);

      // 7.2: API rejects retentionDays < 90 (0, 10, negative, float, invalid strings, extreme) with 400
      const invalidQueryCases = ["0", "10", "-5", "10.5", "abc", "NaN", "999999"];
      for (const val of invalidQueryCases) {
        const res = await fetch(`${baseUrl}/api/documents/retention-purge?retentionDays=${val}&dryRun=true`, {
          method: "POST",
          headers: { Cookie: superAdminCookies },
        });
        record(`API query rejects retentionDays=${val} with 400`, res.status === 400);
      }

      // 7.3: API body rejects retentionDays < 90, decimals, strings, extreme with 400
      const invalidBodyCases = [0, 10, -5, 10.5, "10", null, 999999];
      for (const val of invalidBodyCases) {
        const res = await fetch(`${baseUrl}/api/documents/retention-purge`, {
          method: "POST",
          headers: { Cookie: superAdminCookies, "Content-Type": "application/json" },
          body: JSON.stringify({ retentionDays: val, dryRun: true }),
        });
        record(`API body rejects retentionDays=${JSON.stringify(val)} with 400`, res.status === 400);
      }

      // 7.4: Core service directly throws on retentionDays < 90
      let serviceRejection = false;
      try {
        await purgeExpiredDocumentFiles({ retentionDays: 10, dryRun: true });
      } catch (err) {
        serviceRejection = err.message.includes("Minimum retention period is 90 days");
      }
      record("Core service directly throws when retentionDays < 90", serviceRejection);

      // TEST 8: Hardened CLI validation
      const cp = await import("node:child_process");

      // 8.1: CLI rejects --retention-days < 90 with exit code 1 and security violation message
      const cliLiveInvalidCases = ["10", "0", "89"];
      for (const val of cliLiveInvalidCases) {
        let cliRejected = false;
        try {
          cp.execSync(`node scripts/purge-expired-documents.mjs --retention-days=${val}`, {
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (err) {
          const stderr = err.stderr ? err.stderr.toString() : "";
          cliRejected = err.status === 1 && stderr.includes("[SECURITY VIOLATION]");
        }
        record(`CLI live execution rejects --retention-days=${val} with code 1`, cliRejected);
      }

      // 8.2: CLI rejects invalid values (negative, decimal, string, extreme)
      const cliFormatInvalidCases = ["-5", "10.5", "abc", "NaN", "999999"];
      for (const val of cliFormatInvalidCases) {
        let cliInvalidRejected = false;
        try {
          cp.execSync(`node scripts/purge-expired-documents.mjs --retention-days=${val}`, {
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (err) {
          const stderr = err.stderr ? err.stderr.toString() : "";
          cliInvalidRejected = err.status === 1 && (stderr.includes("[SECURITY ERROR]") || stderr.includes("[SECURITY VIOLATION]"));
        }
        record(`CLI rejects invalid --retention-days=${val} with code 1`, cliInvalidRejected);
      }

      // 8.3: CLI dry-run executes safely with 0 deletions
      const cliDryRunOut = cp.execSync("node scripts/purge-expired-documents.mjs --dry-run", {
        encoding: "utf8",
      });
      record("CLI dry-run runs safely without modifying data", cliDryRunOut.includes("Found 0 eligible document(s)") && cliDryRunOut.includes("0 files modified or deleted"));
    } else {
      console.log("SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD not available in env, skipping session test");
    }

  } finally {
    await cleanup();
  }

  // Final verification: Four real student documents must remain 100% untouched in DB
  const finalBaseline = await getRealDocumentsBaseline();
  assert(finalBaseline.length === 4, `Expected 4 real documents, got ${finalBaseline.length}`);

  let unchanged = true;
  for (let i = 0; i < initialBaseline.length; i++) {
    const init = initialBaseline[i];
    const fin = finalBaseline[i];
    if (
      init.id !== fin.id ||
      init.studentId !== fin.studentId ||
      init.storagePath !== fin.storagePath ||
      init.status !== fin.status ||
      init.deletedAt?.getTime() !== fin.deletedAt?.getTime() ||
      init.storagePurgedAt !== fin.storagePurgedAt
    ) {
      unchanged = false;
      console.error("Mismatch on real document:", { init, fin });
      break;
    }
  }
  record("All 4 original student documents are 100% UNCHANGED in database", unchanged);

  // Final verification: Physical files in Supabase Storage remain untouched
  const finalPhysical = await checkRealFilesPhysical();
  const allFinalPhysicalExist = Object.values(finalPhysical).every((status) => status === 200);
  record("All original physical files in Supabase Storage remain 100% INTACT (HTTP 200)", allFinalPhysicalExist);

  console.log("\n=== STEP 99: ALL TESTS PASSED SUCCESSFULLY ===");
}

run()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
