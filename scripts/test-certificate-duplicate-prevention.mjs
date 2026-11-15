// scripts/test-certificate-duplicate-prevention.mjs
// Tahap 5E.2: Certificate Duplicate Prevention Test Suite

import { PrismaClient } from "@prisma/client";
import {
  assertSafeLocalApplicationTarget,
  assertSafeLocalDatabase,
} from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
assertSafeLocalApplicationTarget({ baseUrl });

const results = [];
let passed = 0;
let failed = 0;

function record(name, condition, errorMsg = "") {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    results.push({ name, pass: true });
  } else {
    failed++;
    console.error(`✗ ${name}: ${errorMsg}`);
    results.push({ name, pass: false, error: errorMsg });
  }
}

function mergeCookies(existingCookies, response) {
  const getSetCookie = response.headers.getSetCookie?.();
  const rawSetCookie =
    getSetCookie || [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();

  if (existingCookies) {
    existingCookies.split(";").forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(
          trimmed.slice(0, idx).trim(),
          trimmed.slice(idx + 1).trim()
        );
      }
    });
  }

  rawSetCookie.forEach((headerVal) => {
    headerVal.split(",").forEach((single) => {
      const part = single.split(";")[0].trim();
      const idx = part.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
    });
  });

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function request(reqPath, options = {}) {
  const url = `${baseUrl}${reqPath}`;
  return fetch(url, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

  const response = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${baseUrl}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  if (!cookies.includes("authjs.session-token")) {
    throw new Error(`Login failed for ${email}: No session token cookie set (HTTP ${response.status})`);
  }
  return cookies;
}

async function api(method, path, cookies = "", body = undefined) {
  const headers = {};
  if (cookies) {
    headers.Cookie = cookies;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function run() {
  console.log("=== TAHAP 5E.2 CERTIFICATE DUPLICATE PREVENTION TEST SUITE ===\n");

  const cleanupCertificateIds = [];
  const cleanupAuditLogIds = [];

  // 1. CAPTURE DATABASE BASELINE
  console.log("Capturing baseline database counts...");
  const initialCounts = {
    certificates: await prisma.certificate.count(),
    auditLogs: await prisma.auditLog.count(),
    students: await prisma.student.count(),
    enrollments: await prisma.enrollment.count(),
    batches: await prisma.batch.count(),
    programs: await prisma.program.count(),
  };

  console.log("Initial baseline counts:", initialCounts);
  record("0. Baseline certificates count is 0", initialCounts.certificates === 0, `found ${initialCounts.certificates}`);
  record("0. Baseline auditLog count is 148", initialCounts.auditLogs === 148, `found ${initialCounts.auditLogs}`);

  try {
    // 2. AUTHENTICATION
    console.log("\n--- Section 1: Authentication ---");
    const adminEmail = process.env.SUPERADMIN_EMAIL?.trim() || "muhamadrivqi83@gmail.com";
    const adminPassword = process.env.SUPERADMIN_PASSWORD?.trim() || "rivqi240205";
    const adminCookies = await login(adminEmail, adminPassword);
    const studentCookies = await login("student.demo@ghs.local", "rivqi321");
    const instructorCookies = await login("instructor.audit@ghs.test", "Password#123!");
    record("1.1 Admin authenticated successfully", Boolean(adminCookies));
    record("1.2 Student authenticated successfully", Boolean(studentCookies));
    record("1.3 Instructor authenticated successfully", Boolean(instructorCookies));

    // Master fixtures
    // studentA: TIARA ISMI LAILA (enrolled in batch 1 GHI-07)
    // studentB: MUHAMMAD DIMAS ANDIKA (enrolled in batch 2 GHI-08)
    const studentAId = "cmumfqfze002f63qgg411lmli";
    const studentBId = "cmumfqg11004f63qgtdxd8esw";
    const programId = "cmumfqfym002163qgem8odku5"; // HTP
    const batch1Id = "cmumfqfyu002363qgbjccnvyr";  // GHI-07
    const batch2Id = "cmumfqfyx002563qgckg107ch";  // GHI-08

    // 3. SEQUENTIAL DUPLICATE PREVENTION
    console.log("\n--- Section 2: Sequential Duplicate Prevention ---");
    const certNum1 = `GHS-DUP-SEQ-001-${Date.now()}`;
    const certNum2 = `GHS-DUP-SEQ-002-${Date.now()}`;

    // First certificate for valid combination -> 201 Created
    const firstCertRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNum1,
      issuedAt: new Date().toISOString(),
      path: "certificates/2026/seq-001.pdf",
    });
    record(
      "2.1 First certificate for combination is created (201)",
      firstCertRes.status === 201 && firstCertRes.payload?.data?.id,
      `status: ${firstCertRes.status}, body: ${JSON.stringify(firstCertRes.payload)}`
    );
    const cert1 = firstCertRes.payload?.data;
    if (cert1?.id) cleanupCertificateIds.push(cert1.id);

    // Second certificate for SAME combination (different certNumber) -> 409 Conflict
    const secondCertRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNum2, // DIFFERENT CERT NUMBER
      issuedAt: new Date().toISOString(),
      path: "certificates/2026/seq-002.pdf",
    });
    record(
      "2.2 Second request for same combination rejected with 409 Conflict",
      secondCertRes.status === 409 &&
        secondCertRes.payload?.error === "An active certificate already exists for this student in the specified batch",
      `status: ${secondCertRes.status}, error: ${secondCertRes.payload?.error}`
    );

    // Verify DB still only has exactly 1 certificate
    const countAfterSeq = await prisma.certificate.count({
      where: { studentId: studentAId, programId, batchId: batch1Id, deletedAt: null },
    });
    record("2.3 Database contains exactly 1 active certificate for combination", countAfterSeq === 1, `found ${countAfterSeq}`);

    // Clean up cert1 before next section
    await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: cert1.id } });
    await prisma.certificate.deleteMany({ where: { id: cert1.id } });
    cleanupCertificateIds.length = 0;

    // 4. CONCURRENT DUPLICATE PREVENTION (RACE CONDITION)
    console.log("\n--- Section 3: Concurrent Requests (Race Condition) ---");
    const concurrentCertNumA = `GHS-CONCURRENT-A-${Date.now()}`;
    const concurrentCertNumB = `GHS-CONCURRENT-B-${Date.now()}`;

    // Fire two simultaneous requests for the exact same student + program + batch
    const [resA, resB] = await Promise.all([
      api("POST", "/api/certificates", adminCookies, {
        studentId: studentAId,
        programId: programId,
        batchId: batch1Id,
        certificateNumber: concurrentCertNumA,
        issuedAt: new Date().toISOString(),
        path: "certificates/2026/conc-a.pdf",
      }),
      api("POST", "/api/certificates", adminCookies, {
        studentId: studentAId,
        programId: programId,
        batchId: batch1Id,
        certificateNumber: concurrentCertNumB,
        issuedAt: new Date().toISOString(),
        path: "certificates/2026/conc-b.pdf",
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    record(
      "3.1 Concurrent requests result in exactly one 201 and one 409",
      statuses[0] === 201 && statuses[1] === 409,
      `statuses: [${resA.status}, ${resB.status}], payloads: [${JSON.stringify(resA.payload)}, ${JSON.stringify(resB.payload)}]`
    );

    const winningCert = resA.status === 201 ? resA.payload?.data : resB.payload?.data;
    if (winningCert?.id) cleanupCertificateIds.push(winningCert.id);

    // Verify database count after concurrent requests
    const activeCountInDb = await prisma.certificate.count({
      where: {
        studentId: studentAId,
        programId,
        batchId: batch1Id,
        status: "ACTIVE",
        deletedAt: null,
      },
    });
    record(
      "3.2 Exactly one active certificate created in database under concurrency",
      activeCountInDb === 1,
      `active certificates in DB: ${activeCountInDb}`
    );

    // Clean up winning cert
    if (winningCert?.id) {
      await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: winningCert.id } });
      await prisma.certificate.deleteMany({ where: { id: winningCert.id } });
      cleanupCertificateIds.length = 0;
    }

    // 5. DIFFERENT VALID COMBINATIONS CAN BE CREATED
    console.log("\n--- Section 4: Different Valid Combinations Permitted ---");
    // studentA in batch1 vs studentB in batch2
    const certNumStudentA = `GHS-DIFF-A-${Date.now()}`;
    const certNumStudentB = `GHS-DIFF-B-${Date.now()}`;

    const certARes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumStudentA,
      issuedAt: new Date().toISOString(),
    });
    record("4.1 Student A in Batch 1 created (201)", certARes.status === 201);
    if (certARes.payload?.data?.id) cleanupCertificateIds.push(certARes.payload.data.id);

    const certBRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentBId,
      programId: programId,
      batchId: batch2Id, // DIFFERENT STUDENT & BATCH
      certificateNumber: certNumStudentB,
      issuedAt: new Date().toISOString(),
    });
    record("4.2 Student B in Batch 2 created (201)", certBRes.status === 201);
    if (certBRes.payload?.data?.id) cleanupCertificateIds.push(certBRes.payload.data.id);

    // Clean up both
    for (const cId of cleanupCertificateIds) {
      await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: cId } });
      await prisma.certificate.deleteMany({ where: { id: cId } });
    }
    cleanupCertificateIds.length = 0;

    // 6. REVOKED CERTIFICATE REPLACEMENT BEHAVIOR
    console.log("\n--- Section 5: Revoked Certificate Replacement Behavior ---");
    const certNumToRevoke = `GHS-REVOKE-ME-${Date.now()}`;
    const certNumReplacement = `GHS-REPLACE-ME-${Date.now()}`;

    // 5.1 Create certificate
    const origCertRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumToRevoke,
      issuedAt: new Date().toISOString(),
    });
    record("5.1 Original certificate created (201)", origCertRes.status === 201);
    const origCert = origCertRes.payload?.data;
    if (origCert?.id) cleanupCertificateIds.push(origCert.id);

    // 5.2 Attempt duplicate while ACTIVE -> 409
    const blockedRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumReplacement,
      issuedAt: new Date().toISOString(),
    });
    record("5.2 Blocked while original certificate is ACTIVE (409)", blockedRes.status === 409);

    // 5.3 Revoke the original certificate
    const revokeRes = await api("PATCH", `/api/certificates/${origCert.id}/revoke`, adminCookies, {
      reason: "Replacement for typo in original document",
    });
    record("5.3 Original certificate revoked successfully (200)", revokeRes.status === 200 && revokeRes.payload?.data?.status === "REVOKED");

    // 5.4 Issue replacement certificate for the SAME combination -> 201 Created!
    const replacementRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumReplacement,
      issuedAt: new Date().toISOString(),
      path: "certificates/2026/replacement.pdf",
    });
    record(
      "5.4 Replacement certificate for revoked combination accepted with 201 Created",
      replacementRes.status === 201 && replacementRes.payload?.data?.id,
      `status: ${replacementRes.status}, body: ${JSON.stringify(replacementRes.payload)}`
    );
    const replacementCert = replacementRes.payload?.data;
    if (replacementCert?.id) cleanupCertificateIds.push(replacementCert.id);

    // 5.5 Verify database state: 1 REVOKED + 1 ACTIVE
    const certsInDb = await prisma.certificate.findMany({
      where: { studentId: studentAId, programId, batchId: batch1Id, deletedAt: null },
      select: { id: true, status: true, certificateNumber: true },
    });
    record(
      "5.5 Database contains both REVOKED original and ACTIVE replacement",
      certsInDb.length === 2 &&
        certsInDb.some((c) => c.status === "REVOKED") &&
        certsInDb.some((c) => c.status === "ACTIVE"),
      `found: ${JSON.stringify(certsInDb)}`
    );

    // 5.6 Attempting 3rd certificate while replacement is ACTIVE -> 409
    const thirdCertRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: `GHS-THIRD-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("5.6 Third certificate blocked while replacement is ACTIVE (409)", thirdCertRes.status === 409);

    // Clean up
    for (const cId of cleanupCertificateIds) {
      await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: cId } });
      await prisma.certificate.deleteMany({ where: { id: cId } });
    }
    cleanupCertificateIds.length = 0;

    // 7. SOFT-DELETED CERTIFICATE REPLACEMENT BEHAVIOR
    console.log("\n--- Section 6: Soft-Deleted Certificate Replacement Behavior ---");
    const certNumSoft = `GHS-SOFT-ORIG-${Date.now()}`;
    const certNumAfterSoft = `GHS-AFTER-SOFT-${Date.now()}`;

    // 6.1 Create certificate
    const softOrigRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumSoft,
      issuedAt: new Date().toISOString(),
    });
    record("6.1 Certificate created for soft-delete test (201)", softOrigRes.status === 201);
    const softOrigCert = softOrigRes.payload?.data;
    if (softOrigCert?.id) cleanupCertificateIds.push(softOrigCert.id);

    // 6.2 Soft-delete the certificate directly
    await prisma.certificate.update({
      where: { id: softOrigCert.id },
      data: { deletedAt: new Date() },
    });
    record("6.2 Certificate soft-deleted", true);

    // 6.3 Issue new certificate for the SAME combination -> 201 Created!
    const newAfterSoftRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: programId,
      batchId: batch1Id,
      certificateNumber: certNumAfterSoft,
      issuedAt: new Date().toISOString(),
    });
    record(
      "6.3 New certificate accepted after previous was soft-deleted (201)",
      newAfterSoftRes.status === 201 && newAfterSoftRes.payload?.data?.id,
      `status: ${newAfterSoftRes.status}`
    );
    if (newAfterSoftRes.payload?.data?.id) cleanupCertificateIds.push(newAfterSoftRes.payload.data.id);

    // Clean up
    for (const cId of cleanupCertificateIds) {
      await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: cId } });
      await prisma.certificate.deleteMany({ where: { id: cId } });
    }
    cleanupCertificateIds.length = 0;

    // 8. TAHAP 5E.1 RELATIONSHIP REGRESSION CHECK
    console.log("\n--- Section 7: Tahap 5E.1 Relationship Regression Check ---");
    const notEnrolledRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentBId, // DIMAS enrolled in GHI-08
      programId: programId,
      batchId: batch1Id, // GHI-07
      certificateNumber: `GHS-REGRESS-1-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("7.1 Unenrolled student still rejected with 400", notEnrolledRes.status === 400 && notEnrolledRes.payload?.error === "Student is not enrolled in the specified batch");

    const mismatchedProgRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentAId,
      programId: "cmuqctrg6000cx497fvup8kz2", // HTS
      batchId: batch1Id, // GHI-07 (belongs to HTP)
      certificateNumber: `GHS-REGRESS-2-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("7.2 Batch not belonging to program still rejected with 400", mismatchedProgRes.status === 400 && mismatchedProgRes.payload?.error === "Batch does not belong to the selected program");

    // 9. ERROR BODY AUDIT (NO SQL, NO STACK TRACE, NO PII)
    console.log("\n--- Section 8: Error Body Sanitization & Privacy Audit ---");
    const errorResponses = [
      secondCertRes.payload,
      resA.status === 409 ? resA.payload : resB.payload,
      notEnrolledRes.payload,
      mismatchedProgRes.payload,
    ];
    const errorString = JSON.stringify(errorResponses);

    const hasSqlKeywords =
      errorString.includes("SELECT") ||
      errorString.includes("INSERT") ||
      errorString.includes("PrismaClientKnownRequestError") ||
      errorString.includes("unique_idx") ||
      errorString.includes("certificates_active_");
    record("8.1 Error responses contain NO SQL or database internals", !hasSqlKeywords, `found in: ${errorString}`);

    const hasStackTrace = errorString.includes("at ") || errorString.includes(".ts:") || errorString.includes(".js:");
    record("8.2 Error responses contain NO stack trace", !hasStackTrace);

    const hasPII =
      errorString.includes("TIARA") ||
      errorString.includes("DIMAS") ||
      errorString.includes("260405") ||
      errorString.includes("0812");
    record("8.3 Error responses contain NO student PII", !hasPII);

  } finally {
    // 10. CLEANUP & BASELINE RESTORATION
    console.log("\n--- Section 9: Teardown & Baseline Restoration ---");
    if (cleanupAuditLogIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: cleanupAuditLogIds } },
      }).catch((e) => console.error("Error deleting audit logs:", e));
    }
    if (cleanupCertificateIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Certificate", entityId: { in: cleanupCertificateIds } },
      }).catch((e) => console.error("Error deleting cert audit logs:", e));
      await prisma.certificate.deleteMany({
        where: { id: { in: cleanupCertificateIds } },
      }).catch((e) => console.error("Error deleting certificates:", e));
    }

    const finalCounts = {
      certificates: await prisma.certificate.count(),
      auditLogs: await prisma.auditLog.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      batches: await prisma.batch.count(),
      programs: await prisma.program.count(),
    };
    console.log("Final database counts:", finalCounts);

    record("9.1 Certificates count perfectly restored to baseline (0)", finalCounts.certificates === initialCounts.certificates, `initial: ${initialCounts.certificates}, final: ${finalCounts.certificates}`);
    record("9.2 AuditLog count perfectly restored to baseline (148)", finalCounts.auditLogs === initialCounts.auditLogs, `initial: ${initialCounts.auditLogs}, final: ${finalCounts.auditLogs}`);
    record("9.3 Students count perfectly preserved", finalCounts.students === initialCounts.students);
    record("9.4 Enrollments count perfectly preserved", finalCounts.enrollments === initialCounts.enrollments);
    record("9.5 Batches count perfectly preserved", finalCounts.batches === initialCounts.batches);
    record("9.6 Programs count perfectly preserved", finalCounts.programs === initialCounts.programs);

    await prisma.$disconnect();
  }

  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("==========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
