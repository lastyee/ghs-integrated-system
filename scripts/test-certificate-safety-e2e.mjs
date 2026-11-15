// scripts/test-certificate-safety-e2e.mjs
// Tahap 5E.4: Certificate Issuance & Revocation Safety Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getStorageProvider, CERTIFICATES_BUCKET } from "../lib/storage.ts";
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
  if (cookies) headers["Cookie"] = cookies;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  console.log("=== TAHAP 5E.4: CERTIFICATE ISSUANCE & REVOCATION SAFETY TEST SUITE ===");

  const cleanup = {
    certificates: [],
    enrollments: [],
    students: [],
    users: [],
    storageFiles: [],
    auditLogs: [],
  };

  const initialCertCount = await prisma.certificate.count();
  const initialAuditCount = await prisma.auditLog.count();
  console.log(`Initial DB Baseline -> Certificates: ${initialCertCount}, AuditLogs: ${initialAuditCount}`);
  record("0. Initial DB baseline clean (Certificates == 0)", initialCertCount === 0, `Expected 0, got ${initialCertCount}`);
  record("0b. Initial DB baseline recorded (AuditLogs >= 0)", initialAuditCount >= 0, `Got ${initialAuditCount}`);

  try {
    const timestamp = Date.now();

    // 1. Authenticate Super Admin session
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || "muhamadrivqi83@gmail.com";
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "rivqi240205";
    const adminCookies = await login(superAdminEmail, superAdminPassword);
    record("1. Authenticate Super Admin session", !!adminCookies, "Failed to login as Super Admin");

    // Provision temporary MANAGEMENT user for RBAC verification
    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    if (!mgmtRole) throw new Error("Role MANAGEMENT not found in database");
    const tempPasswordHash = await bcrypt.hash("SafePassword@123", 10);
    const tempMgmtEmail = `test.mgmt.5e4.${timestamp}@ghs.test`;
    const tempMgmtUser = await prisma.user.create({
      data: {
        email: tempMgmtEmail,
        name: `Test Management 5E4 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: mgmtRole.id,
      },
    });
    cleanup.users.push(tempMgmtUser.id);
    const mgmtCookies = await login(tempMgmtEmail, "SafePassword@123");
    record("2. Authenticate Management session", !!mgmtCookies, "Failed to login as Management");

    // Provision temporary STUDENT 1 user (owner)
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });
    if (!studentRole) throw new Error("Role STUDENT not found in database");
    const tempStudent1Email = `student1.5e4.${timestamp}@ghs.test`;
    const tempStudent1User = await prisma.user.create({
      data: {
        email: tempStudent1Email,
        name: `Student One 5E4 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: studentRole.id,
      },
    });
    cleanup.users.push(tempStudent1User.id);
    const student1Cookies = await login(tempStudent1Email, "SafePassword@123");
    record("3. Authenticate Student 1 (Owner) session", !!student1Cookies, "Failed to login as Student 1");

    // Provision temporary STUDENT 2 user (other student)
    const tempStudent2Email = `student2.5e4.${timestamp}@ghs.test`;
    const tempStudent2User = await prisma.user.create({
      data: {
        email: tempStudent2Email,
        name: `Student Two 5E4 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: studentRole.id,
      },
    });
    cleanup.users.push(tempStudent2User.id);
    const student2Cookies = await login(tempStudent2Email, "SafePassword@123");
    record("4. Authenticate Student 2 (Non-Owner) session", !!student2Cookies, "Failed to login as Student 2");

    // 2. Fetch active Program and Batch fixtures
    const program = await prisma.program.findFirst({
      where: { deletedAt: null, batches: { some: { deletedAt: null } } },
      include: { batches: { where: { deletedAt: null } } },
    });
    if (!program || !program.batches[0]) {
      throw new Error("No active Program with active Batch found in database");
    }
    const batch = program.batches[0];

    // Create Student 1 DB record linked to user
    const student1 = await prisma.student.create({
      data: {
        name: `Student One ${timestamp}`,
        nim: `NIM-5E4-1-${timestamp}`,
        userId: tempStudent1User.id,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student1.id);

    const enrollment1 = await prisma.enrollment.create({
      data: {
        studentId: student1.id,
        batchId: batch.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment1.id);

    // Create Student 2 DB record linked to user
    const student2 = await prisma.student.create({
      data: {
        name: `Student Two ${timestamp}`,
        nim: `NIM-5E4-2-${timestamp}`,
        userId: tempStudent2User.id,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student2.id);

    const enrollment2 = await prisma.enrollment.create({
      data: {
        studentId: student2.id,
        batchId: batch.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment2.id);

    console.log("\n--- SECTION 1: MANUAL CERTIFICATE NUMBER VALIDATION ---");
    // 1.1 Empty string certificateNumber -> 400
    const emptyNumRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: "",
      issuedAt: new Date().toISOString(),
    });
    record("5. Empty certificateNumber rejected with 400 Bad Request", emptyNumRes.status === 400, `Status: ${emptyNumRes.status}`);

    // 1.2 Whitespace-only certificateNumber -> 400
    const spaceNumRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: "   ",
      issuedAt: new Date().toISOString(),
    });
    record("6. Whitespace-only certificateNumber rejected with 400 Bad Request", spaceNumRes.status === 400, `Status: ${spaceNumRes.status}`);

    // 1.3 Missing certificateNumber field -> 400
    const missingNumRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      issuedAt: new Date().toISOString(),
    });
    record("7. Missing certificateNumber rejected with 400 Bad Request", missingNumRes.status === 400, `Status: ${missingNumRes.status}`);

    console.log("\n--- SECTION 2: VALID ISSUANCE & AUDIT LOGGING ---");
    const manualCertNum1 = `CERT-5E4-SAFE-001-${timestamp}`;
    const testStoragePath = `test-cert-${timestamp}.pdf`;

    const storage = getStorageProvider();
    try {
      await storage.upload({
        bucket: CERTIFICATES_BUCKET,
        path: testStoragePath,
        file: Buffer.from("%PDF-1.4 test certificate content"),
        contentType: "application/pdf",
      });
      cleanup.storageFiles.push(testStoragePath);
    } catch (upErr) {
      console.warn("Storage upload warning:", upErr.message);
    }

    const createRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: manualCertNum1,
      issuedAt: new Date().toISOString(),
      path: testStoragePath,
    });
    record("8. Valid certificate issuance returns 201 Created", createRes.status === 201, `Status: ${createRes.status}`);
    const cert1 = createRes.data?.data;
    if (cert1?.id) cleanup.certificates.push(cert1.id);
    record("8b. Issued certificate has ACTIVE status", cert1?.status === "ACTIVE", `Status: ${cert1?.status}`);
    record("8c. Certificate number matches input", cert1?.certificateNumber === manualCertNum1, `Expected ${manualCertNum1}, got ${cert1?.certificateNumber}`);

    // Verify CREATE AuditLog
    const createAuditLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Certificate",
        entityId: cert1?.id,
        action: "CREATE",
      },
    });
    record("9. AuditLog created with action CREATE", !!createAuditLog, "AuditLog not found");
    record("9b. CREATE AuditLog contains no PII or sensitive keys",
      !JSON.stringify(createAuditLog?.changes).includes("password") &&
      !JSON.stringify(createAuditLog?.changes).includes("nik"),
      "Sensitive data found in audit log");

    console.log("\n--- SECTION 3: DUPLICATE VALIDATION ---");
    // 3.1 Duplicate active certificate for same student + batch -> 409
    const dupActiveRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: `CERT-OTHER-NUM-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("10. Duplicate active certificate for student in batch rejected with 409 Conflict",
      dupActiveRes.status === 409, `Status: ${dupActiveRes.status}`);
    record("10b. Duplicate message explains active certificate already exists",
      dupActiveRes.data?.error?.includes("An active certificate already exists"),
      JSON.stringify(dupActiveRes.data));

    // 3.2 Duplicate certificateNumber for different student -> 409
    const dupNumRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student2.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: manualCertNum1, // Reusing manualCertNum1 from student 1
      issuedAt: new Date().toISOString(),
    });
    record("11. Reusing certificateNumber rejected with 409 Conflict",
      dupNumRes.status === 409, `Status: ${dupNumRes.status}`);
    record("11b. Duplicate number message is clear",
      dupNumRes.data?.error?.includes("already exists"),
      JSON.stringify(dupNumRes.data));

    console.log("\n--- SECTION 4: ACTIVE CERTIFICATE DOWNLOAD & RBAC ---");
    // 4.1 Owner student download -> 200
    const ownerDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, student1Cookies);
    record("12. Student owner can download active certificate (200 OK)", ownerDlRes.status === 200, `Status: ${ownerDlRes.status}`);
    record("12b. Active download response indicates ACTIVE status", ownerDlRes.data?.data?.status === "ACTIVE", `Status: ${ownerDlRes.data?.data?.status}`);
    record("12c. Active download response provides signedUrl", !!ownerDlRes.data?.data?.signedUrl, "signedUrl missing");

    // 4.2 Non-owner student download (IDOR attempt) -> 403 Forbidden
    const nonOwnerDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, student2Cookies);
    record("13. Non-owner student download blocked with 403 Forbidden", nonOwnerDlRes.status === 403, `Status: ${nonOwnerDlRes.status}`);

    // 4.3 Anonymous download attempt -> 401 Unauthorized
    const unauthDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, "");
    record("14. Anonymous download blocked with 401 Unauthorized", unauthDlRes.status === 401, `Status: ${unauthDlRes.status}`);

    // 4.4 Admin download -> 200 OK
    const adminDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, adminCookies);
    record("15. Admin can download certificate (200 OK)", adminDlRes.status === 200, `Status: ${adminDlRes.status}`);

    console.log("\n--- SECTION 5: REVOCATION SAFETY & IDEMPOTENCY ---");
    // 5.1 Student cannot revoke certificate -> 403 Forbidden
    const studentRevokeRes = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, student1Cookies, {
      reason: "Unauthorized student revocation attempt",
    });
    record("16. Student cannot revoke certificate (403 Forbidden)", studentRevokeRes.status === 403, `Status: ${studentRevokeRes.status}`);

    // 5.2 Management cannot revoke certificate -> 403 Forbidden
    const mgmtRevokeRes = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, mgmtCookies, {
      reason: "Unauthorized management revocation attempt",
    });
    record("17. Management cannot revoke certificate (403 Forbidden)", mgmtRevokeRes.status === 403, `Status: ${mgmtRevokeRes.status}`);

    // 5.3 Admin revokes certificate -> 200 OK
    const revokeReason = "Administrative audit revocation 5E4";
    const adminRevokeRes = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, adminCookies, {
      reason: revokeReason,
    });
    record("18. Admin can revoke certificate (200 OK)", adminRevokeRes.status === 200, `Status: ${adminRevokeRes.status}`);
    record("18b. Certificate status updated to REVOKED", adminRevokeRes.data?.data?.status === "REVOKED", `Status: ${adminRevokeRes.data?.data?.status}`);

    // Verify REVOKE AuditLog
    const revokeAuditLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Certificate",
        entityId: cert1.id,
        action: "REVOKE",
      },
    });
    record("19. AuditLog created with action REVOKE", !!revokeAuditLog, "AuditLog for REVOKE not found");
    record("19b. REVOKE AuditLog records revocation reason",
      JSON.stringify(revokeAuditLog?.changes).includes(revokeReason),
      "Reason not found in audit log changes");

    // 5.4 Revoke is idempotent: second call succeeds with 200 and does not duplicate
    const idempotentRevokeRes = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, adminCookies, {
      reason: "Redundant second revoke",
    });
    record("20. Second revoke call is safe and idempotent (200 OK)", idempotentRevokeRes.status === 200, `Status: ${idempotentRevokeRes.status}`);
    record("20b. Idempotent revoke status remains REVOKED", idempotentRevokeRes.data?.data?.status === "REVOKED", `Status: ${idempotentRevokeRes.data?.data?.status}`);

    console.log("\n--- SECTION 6: REVOKED CERTIFICATE PRESENTATION & DOWNLOAD ---");
    // 6.1 Detail endpoint reflects REVOKED status (not presented as active)
    const detailAfterRevoke = await api("GET", `/api/certificates/${cert1.id}`, adminCookies);
    record("21. Certificate detail reflects status REVOKED", detailAfterRevoke.data?.data?.status === "REVOKED", `Status: ${detailAfterRevoke.data?.data?.status}`);

    // 6.2 Student detail view also reflects REVOKED status
    const studentDetailAfterRevoke = await api("GET", `/api/certificates/${cert1.id}`, student1Cookies);
    record("22. Student view reflects status REVOKED", studentDetailAfterRevoke.data?.data?.status === "REVOKED", `Status: ${studentDetailAfterRevoke.data?.data?.status}`);

    // 6.3 Download endpoint blocks student from downloading revoked certificate -> 403 Forbidden
    const studentRevokedDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, student1Cookies);
    record("23a. Student cannot download revoked certificate (403 Forbidden)", studentRevokedDlRes.status === 403, `Status: ${studentRevokedDlRes.status}`);
    record("23b. Student revoked download does not return signedUrl", studentRevokedDlRes.data?.data?.signedUrl === undefined, `signedUrl: ${studentRevokedDlRes.data?.data?.signedUrl}`);

    // 6.4 Authorized staff can download archive of revoked certificate -> 200 OK with REVOKED status
    const staffRevokedDlRes = await api("GET", `/api/certificates/${cert1.id}/download`, adminCookies);
    record("23c. Authorized staff can download revoked certificate archive (200 OK)", staffRevokedDlRes.status === 200, `Status: ${staffRevokedDlRes.status}`);
    record("23d. Staff revoked download returns status REVOKED and signedUrl", staffRevokedDlRes.data?.data?.status === "REVOKED" && !!staffRevokedDlRes.data?.data?.signedUrl, `Status: ${staffRevokedDlRes.data?.data?.status}`);

    console.log("\n--- SECTION 7: RE-ISSUANCE AFTER REVOCATION SAFETY ---");
    // 7.1 Cannot reissue with same certificateNumber as revoked cert -> 409 Conflict
    const reissueSameNumRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: manualCertNum1, // Reusing number of revoked certificate
      issuedAt: new Date().toISOString(),
    });
    record("24. Re-issuance with reused certificateNumber rejected with 409 Conflict",
      reissueSameNumRes.status === 409, `Status: ${reissueSameNumRes.status}`);

    // 7.2 Can reissue with NEW manual certificateNumber -> 201 Created
    const replacementCertNum = `CERT-5E4-REPLACE-${timestamp}`;
    const reissueRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: replacementCertNum,
      issuedAt: new Date().toISOString(),
    });
    record("25. Re-issuance with new manual number succeeds with 201 Created",
      reissueRes.status === 201, `Status: ${reissueRes.status}`);
    const replaceCert = reissueRes.data?.data;
    if (replaceCert?.id) cleanup.certificates.push(replaceCert.id);
    record("25b. Replacement certificate has status ACTIVE", replaceCert?.status === "ACTIVE", `Status: ${replaceCert?.status}`);

    // 7.3 Attempting a third certificate while replacement is ACTIVE is blocked -> 409 Conflict
    const thirdCertAttempt = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: `CERT-5E4-THIRD-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("26. Additional active certificate blocked while replacement is active (409)",
      thirdCertAttempt.status === 409, `Status: ${thirdCertAttempt.status}`);

    console.log("\n--- SECTION 8: ERROR SANITIZATION & PRIVACY ---");
    // 8.1 Invalid JSON body error doesn't leak stack trace
    const malformedJsonRes = await fetch(`${baseUrl}/api/certificates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: "INVALID_JSON{",
    });
    const malformedText = await malformedJsonRes.text();
    record("27. Malformed JSON returns 400 without stack trace",
      malformedJsonRes.status === 400 && !malformedText.includes("SyntaxError"),
      `Status: ${malformedJsonRes.status}`);

    // 8.2 Non-existent ID errors do not leak internal database errors
    const nonExistentRes = await api("GET", "/api/certificates/non-existent-cuid-99999", adminCookies);
    record("28. Non-existent certificate returns 404 without internal leakage",
      nonExistentRes.status === 404 && !JSON.stringify(nonExistentRes.data).includes("PrismaClient"),
      `Status: ${nonExistentRes.status}`);

    // 8.3 Download null path returns 400 cleanly
    const nullPathCert = await prisma.certificate.create({
      data: {
        studentId: student2.id,
        programId: program.id,
        batchId: batch.id,
        certificateNumber: `CERT-NULL-PATH-${timestamp}`,
        issuedAt: new Date(),
        status: "ACTIVE",
        path: null,
      },
    });
    cleanup.certificates.push(nullPathCert.id);

    const nullDlRes = await api("GET", `/api/certificates/${nullPathCert.id}/download`, adminCookies);
    record("29. Download certificate with null path returns 400 cleanly",
      nullDlRes.status === 400 && nullDlRes.data?.error?.includes("Certificate file is not available"),
      JSON.stringify(nullDlRes.data));

  } finally {
    console.log("\n--- CLEANUP & BASELINE RESTORATION ---");
    // Clean up all created certificates
    if (cleanup.certificates.length > 0) {
      console.log(`Cleaning up ${cleanup.certificates.length} test certificates...`);
      await prisma.auditLog.deleteMany({
        where: {
          entity: "Certificate",
          entityId: { in: cleanup.certificates },
        },
      });
      await prisma.certificate.deleteMany({
        where: { id: { in: cleanup.certificates } },
      });
    }

    // Clean up created enrollments
    if (cleanup.enrollments.length > 0) {
      console.log(`Cleaning up ${cleanup.enrollments.length} test enrollments...`);
      await prisma.enrollment.deleteMany({
        where: { id: { in: cleanup.enrollments } },
      });
    }

    // Clean up created students
    if (cleanup.students.length > 0) {
      console.log(`Cleaning up ${cleanup.students.length} test students...`);
      await prisma.student.deleteMany({
        where: { id: { in: cleanup.students } },
      });
    }

    // Clean up created users
    if (cleanup.users.length > 0) {
      console.log(`Cleaning up ${cleanup.users.length} test users...`);
      await prisma.user.deleteMany({
        where: { id: { in: cleanup.users } },
      });
    }

    // Clean up storage test files
    if (cleanup.storageFiles.length > 0) {
      console.log(`Cleaning up ${cleanup.storageFiles.length} storage test files...`);
      const storage = getStorageProvider();
      for (const filePath of cleanup.storageFiles) {
        try {
          await storage.delete({ bucket: CERTIFICATES_BUCKET, path: filePath });
        } catch {
          // Ignore
        }
      }
    }

    // Verify final counts match baseline
    const finalCertCount = await prisma.certificate.count();
    const finalAuditCount = await prisma.auditLog.count();
    console.log(`Final DB Baseline -> Certificates: ${finalCertCount}, AuditLogs: ${finalAuditCount}`);

    record("30. Final Certificate count returned exactly to baseline (0)", finalCertCount === initialCertCount, `Expected ${initialCertCount}, got ${finalCertCount}`);
    record("31. Final AuditLog count preserved without artifact leakage", finalAuditCount === initialAuditCount, `Expected ${initialAuditCount}, got ${finalAuditCount}`);
  }

  console.log("\n========================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("========================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
