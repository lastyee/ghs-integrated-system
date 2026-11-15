// scripts/test-certificate-relationship-validation.mjs
// Tahap 5E.1: Certificate Relationship Validation Test Suite

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
  console.log("=== TAHAP 5E.1 CERTIFICATE RELATIONSHIP VALIDATION TEST SUITE ===\n");

  const cleanupCertificateIds = [];
  const cleanupAuditLogIds = [];
  const cleanupStudentIds = [];
  const cleanupEnrollmentIds = [];
  const cleanupBatchIds = [];
  const cleanupProgramIds = [];

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

    // 3. UNPERMITTED & UNAUTHENTICATED REQUESTS
    console.log("\n--- Section 2: Otorisasi & Akses ---");
    const unauthRes = await api("POST", "/api/certificates", "", {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: "GHS-TEST-UNAUTH-01",
      issuedAt: new Date().toISOString(),
    });
    record("2.1 Unauthenticated POST /api/certificates returns 401", unauthRes.status === 401, `received ${unauthRes.status}`);

    const instructorRes = await api("POST", "/api/certificates", instructorCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: "GHS-TEST-INST-01",
      issuedAt: new Date().toISOString(),
    });
    record("2.2 INSTRUCTOR role (no certificate:create) returns 403", instructorRes.status === 403, `received ${instructorRes.status}`);

    const studentRes = await api("POST", "/api/certificates", studentCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: "GHS-TEST-STUD-01",
      issuedAt: new Date().toISOString(),
    });
    record("2.3 STUDENT role (no certificate:create) returns 403", studentRes.status === 403, `received ${studentRes.status}`);

    // 4. NON-EXISTENT ID VALIDATION
    console.log("\n--- Section 3: Non-existent ID Validation ---");
    const nonStudentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmunonexistentstudent0000",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: "GHS-TEST-INV-01",
      issuedAt: new Date().toISOString(),
    });
    record("3.1 Non-existent studentId returns 404 Student not found", nonStudentRes.status === 404 && nonStudentRes.payload?.error === "Student not found", `status: ${nonStudentRes.status}, error: ${nonStudentRes.payload?.error}`);

    const nonProgramRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmunonexistentprogram0000",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: "GHS-TEST-INV-02",
      issuedAt: new Date().toISOString(),
    });
    record("3.2 Non-existent programId returns 404 Program not found", nonProgramRes.status === 404 && nonProgramRes.payload?.error === "Program not found", `status: ${nonProgramRes.status}, error: ${nonProgramRes.payload?.error}`);

    const nonBatchRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmunonexistentbatch00000",
      certificateNumber: "GHS-TEST-INV-03",
      issuedAt: new Date().toISOString(),
    });
    record("3.3 Non-existent batchId returns 404 Batch not found", nonBatchRes.status === 404 && nonBatchRes.payload?.error === "Batch not found", `status: ${nonBatchRes.status}, error: ${nonBatchRes.payload?.error}`);

    // 5. SOFT-DELETED ENTITIES VALIDATION
    console.log("\n--- Section 4: Soft-Deleted Entities Validation ---");
    // 4.1 Soft-deleted student
    const softDeletedStudent = await prisma.student.create({
      data: {
        nim: `TEST-DEL-STU-${Date.now()}`,
        name: "Temporary Deleted Student",
        deletedAt: new Date(),
      },
    });
    cleanupStudentIds.push(softDeletedStudent.id);

    const softStudentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: softDeletedStudent.id,
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: `GHS-TEST-SOFT-STU-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("4.1 Soft-deleted student rejected with 404 Student not found", softStudentRes.status === 404 && softStudentRes.payload?.error === "Student not found", `status: ${softStudentRes.status}, error: ${softStudentRes.payload?.error}`);

    // 4.2 Soft-deleted program
    const softDeletedProgram = await prisma.program.create({
      data: {
        code: `PRG-DEL-${Date.now().toString().slice(-6)}`,
        name: "Temporary Deleted Program",
        deletedAt: new Date(),
      },
    });
    cleanupProgramIds.push(softDeletedProgram.id);

    const softProgramRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: softDeletedProgram.id,
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: `GHS-TEST-SOFT-PRG-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("4.2 Soft-deleted program rejected with 404 Program not found", softProgramRes.status === 404 && softProgramRes.payload?.error === "Program not found", `status: ${softProgramRes.status}, error: ${softProgramRes.payload?.error}`);

    // 4.3 Soft-deleted batch
    const softDeletedBatch = await prisma.batch.create({
      data: {
        name: `Temporary Deleted Batch ${Date.now()}`,
        programId: "cmumfqfym002163qgem8odku5",
        startDate: new Date("2026-01-01"),
        deletedAt: new Date(),
      },
    });
    cleanupBatchIds.push(softDeletedBatch.id);

    const softBatchRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: softDeletedBatch.id,
      certificateNumber: `GHS-TEST-SOFT-BAT-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("4.3 Soft-deleted batch rejected with 404 Batch not found", softBatchRes.status === 404 && softBatchRes.payload?.error === "Batch not found", `status: ${softBatchRes.status}, error: ${softBatchRes.payload?.error}`);

    // 6. RELATIONSHIP MISMATCH VALIDATION
    console.log("\n--- Section 5: Relationship Mismatch Validation ---");
    // 5.1 Batch does not belong to specified Program
    // Find an active program that batchA does NOT belong to
    const otherActiveProgram = await prisma.program.findFirst({
      where: {
        id: { not: "cmumfqfym002163qgem8odku5" },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!otherActiveProgram) {
      throw new Error("Could not find another active program for mismatch test");
    }

    const mismatchedProgramRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: otherActiveProgram.id, // MISMATCHED ACTIVE PROGRAM
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: `GHS-TEST-MIS-PRG-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record(
      "5.1 Batch not belonging to program rejected with 400",
      mismatchedProgramRes.status === 400 &&
        mismatchedProgramRes.payload?.error === "Batch does not belong to the selected program",
      `status: ${mismatchedProgramRes.status}, error: ${mismatchedProgramRes.payload?.error}`
    );

    // 5.2 Student is not enrolled in the specified batch
    // student "cmumfqg11004f63qgtdxd8esw" (DIMAS) is enrolled in GHI-08, NOT GHI-07 ("cmumfqfyu002363qgbjccnvyr")
    const notEnrolledStudentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqg11004f63qgtdxd8esw",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr", // NOT ENROLLED IN THIS BATCH
      certificateNumber: `GHS-TEST-NOT-ENR-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record(
      "5.2 Student not enrolled in batch rejected with 400",
      notEnrolledStudentRes.status === 400 &&
        notEnrolledStudentRes.payload?.error === "Student is not enrolled in the specified batch",
      `status: ${notEnrolledStudentRes.status}, error: ${notEnrolledStudentRes.payload?.error}`
    );

    // 5.3 Soft-deleted enrollment is rejected
    const tempStudentForSoftEnrollment = await prisma.student.create({
      data: {
        nim: `TEMP-ENR-STU-${Date.now()}`,
        name: "Temporary Student Soft Enrollment",
      },
    });
    cleanupStudentIds.push(tempStudentForSoftEnrollment.id);

    const tempSoftEnrollment = await prisma.enrollment.create({
      data: {
        studentId: tempStudentForSoftEnrollment.id,
        batchId: "cmumfqfyu002363qgbjccnvyr",
        deletedAt: new Date(), // SOFT DELETED
      },
    });
    cleanupEnrollmentIds.push(tempSoftEnrollment.id);

    const softEnrollmentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: tempStudentForSoftEnrollment.id,
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: `GHS-TEST-SOFT-ENR-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record(
      "5.3 Soft-deleted enrollment rejected with 400",
      softEnrollmentRes.status === 400 &&
        softEnrollmentRes.payload?.error === "Student is not enrolled in the specified batch",
      `status: ${softEnrollmentRes.status}, error: ${softEnrollmentRes.payload?.error}`
    );

    // 7. VALID RELATIONSHIP TEST (ACCEPTED)
    console.log("\n--- Section 6: Valid Relationship Acceptance ---");
    // student "cmumfqfze002f63qgg411lmli" (student.demo) is actively enrolled in batch "cmumfqfyu002363qgbjccnvyr"
    // batch "cmumfqfyu002363qgbjccnvyr" belongs to program "cmumfqfym002163qgem8odku5"
    const validCertNumber = `GHS-VAL-CERT-${Date.now()}`;
    const validCreateRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: "cmumfqfze002f63qgg411lmli",
      programId: "cmumfqfym002163qgem8odku5",
      batchId: "cmumfqfyu002363qgbjccnvyr",
      certificateNumber: validCertNumber,
      issuedAt: "2026-10-28T10:00:00.000Z",
      path: "certificates/2026/GHS-VAL-001.pdf",
    });
    record(
      "6.1 Valid student + program + batch + enrollment accepted with 201 Created",
      validCreateRes.status === 201 && validCreateRes.payload?.data?.id,
      `status: ${validCreateRes.status}, body: ${JSON.stringify(validCreateRes.payload)}`
    );

    const createdCert = validCreateRes.payload?.data;
    if (createdCert?.id) {
      cleanupCertificateIds.push(createdCert.id);

      // Verify certificate attributes
      record("6.2 Created certificate has ACTIVE status", createdCert.status === "ACTIVE");
      record("6.3 Created certificate has matching certificateNumber", createdCert.certificateNumber === validCertNumber);
      record("6.4 Created certificate includes student, program, batch relations", Boolean(
        createdCert.student?.nim && createdCert.program?.code && createdCert.batch?.name
      ));

      // Verify AuditLog was created for this certificate
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          entity: "Certificate",
          entityId: createdCert.id,
          action: "CREATE",
        },
      });
      record("6.5 AuditLog entry created for certificate creation", Boolean(auditEntry));
      if (auditEntry?.id) cleanupAuditLogIds.push(auditEntry.id);
    }

    // 8. READ & PRIVACY INTEGRITY
    console.log("\n--- Section 7: Read & PII Leakage Audit ---");
    const getListRes = await api("GET", "/api/certificates", adminCookies);
    record("7.1 Admin can read certificates list -> 200", getListRes.status === 200);

    const getDetailRes = createdCert?.id
      ? await api("GET", `/api/certificates/${createdCert.id}`, adminCookies)
      : { status: 404, payload: null };
    record("7.2 Admin can read created certificate detail -> 200", getDetailRes.status === 200);

    // PII Leakage Check across all error responses
    const allErrorsString = JSON.stringify([
      nonStudentRes.payload,
      nonProgramRes.payload,
      nonBatchRes.payload,
      softStudentRes.payload,
      softProgramRes.payload,
      softBatchRes.payload,
      mismatchedProgramRes.payload,
      notEnrolledStudentRes.payload,
      softEnrollmentRes.payload,
    ]);
    const leaksPII =
      allErrorsString.includes("RAFLI") ||
      allErrorsString.includes("DIMAS") ||
      allErrorsString.includes("260405") ||
      allErrorsString.includes("320") || // NIK prefix
      allErrorsString.includes("081"); // phone prefix
    record("7.3 Error responses contain NO student PII (names, NIM, NIK, phone)", !leaksPII, `leaked content in: ${allErrorsString}`);

  } finally {
    // 9. CLEANUP & RESTORATION
    console.log("\n--- Section 8: Teardown & Baseline Restoration ---");
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
    if (cleanupEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: cleanupEnrollmentIds } },
      }).catch((e) => console.error("Error deleting temp enrollments:", e));
    }
    if (cleanupStudentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: cleanupStudentIds } },
      }).catch((e) => console.error("Error deleting temp students:", e));
    }
    if (cleanupBatchIds.length > 0) {
      await prisma.batch.deleteMany({
        where: { id: { in: cleanupBatchIds } },
      }).catch((e) => console.error("Error deleting temp batches:", e));
    }
    if (cleanupProgramIds.length > 0) {
      await prisma.program.deleteMany({
        where: { id: { in: cleanupProgramIds } },
      }).catch((e) => console.error("Error deleting temp programs:", e));
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

    record("8.1 Certificates count perfectly restored to baseline (0)", finalCounts.certificates === initialCounts.certificates, `initial: ${initialCounts.certificates}, final: ${finalCounts.certificates}`);
    record("8.2 AuditLog count perfectly restored to baseline (148)", finalCounts.auditLogs === initialCounts.auditLogs, `initial: ${initialCounts.auditLogs}, final: ${finalCounts.auditLogs}`);
    record("8.3 Students count perfectly restored", finalCounts.students === initialCounts.students);
    record("8.4 Enrollments count perfectly restored", finalCounts.enrollments === initialCounts.enrollments);
    record("8.5 Batches count perfectly restored", finalCounts.batches === initialCounts.batches);
    record("8.6 Programs count perfectly restored", finalCounts.programs === initialCounts.programs);

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
