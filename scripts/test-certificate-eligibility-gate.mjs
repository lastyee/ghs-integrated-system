// scripts/test-certificate-eligibility-gate.mjs
// Tahap 5E.3: Certificate Eligibility Gate Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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
  console.log("=== TAHAP 5E.3: CERTIFICATE ELIGIBILITY GATE TEST SUITE ===");

  const cleanup = {
    certificates: [],
    enrollments: [],
    students: [],
    users: [],
    auditLogs: [],
  };

  const initialCertCount = await prisma.certificate.count();
  const initialAuditCount = await prisma.auditLog.count();
  console.log(`Initial DB Baseline -> Certificates: ${initialCertCount}, AuditLogs: ${initialAuditCount}`);
  record("0. Initial DB baseline clean (Certificates == 0)", initialCertCount === 0, `Expected 0, got ${initialCertCount}`);
  record("0b. Initial DB baseline recorded (AuditLogs >= 0)", initialAuditCount >= 0, `Got ${initialAuditCount}`);

  try {
    const timestamp = Date.now();

    // 1. Authenticate sessions
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || "muhamadrivqi83@gmail.com";
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "rivqi240205";
    const adminCookies = await login(superAdminEmail, superAdminPassword);
    record("1. Authenticate Super Admin session", !!adminCookies, "Failed to login as Super Admin");

    // Provision temporary STUDENT user for real RBAC testing
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });
    if (!studentRole) throw new Error("Role STUDENT not found in database");
    const tempPasswordHash = await bcrypt.hash("Password@123", 10);
    const tempStudentEmail = `test.student.5e3.${timestamp}@ghs.test`;
    const tempStudentUser = await prisma.user.create({
      data: {
        email: tempStudentEmail,
        name: `Test Student 5E3 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: studentRole.id,
      },
    });
    cleanup.users.push(tempStudentUser.id);

    const studentCookies = await login(tempStudentEmail, "Password@123");
    record("2. Authenticate real Student session", !!studentCookies, "Failed to login as Student");

    // Provision temporary MANAGEMENT user for real RBAC testing
    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    if (!mgmtRole) throw new Error("Role MANAGEMENT not found in database");
    const tempMgmtEmail = `test.mgmt.5e3.${timestamp}@ghs.test`;
    const tempMgmtUser = await prisma.user.create({
      data: {
        email: tempMgmtEmail,
        name: `Test Management 5E3 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: mgmtRole.id,
      },
    });
    cleanup.users.push(tempMgmtUser.id);

    const mgmtCookies = await login(tempMgmtEmail, "Password@123");
    record("3. Authenticate real Management session", !!mgmtCookies, "Failed to login as Management");

    // 2. Fetch active Program and Batch fixtures
    const programA = await prisma.program.findFirst({
      where: { deletedAt: null, batches: { some: { deletedAt: null } } },
      include: { batches: { where: { deletedAt: null } } },
    });
    if (!programA || !programA.batches[0]) {
      throw new Error("No active Program with active Batch found in database");
    }
    const batchA = programA.batches[0];

    const programB = await prisma.program.findFirst({
      where: { id: { not: programA.id }, deletedAt: null, batches: { some: { deletedAt: null } } },
      include: { batches: { where: { deletedAt: null } } },
    });
    if (!programB || !programB.batches[0]) {
      throw new Error("No secondary active Program found in database");
    }
    const batchB = programB.batches[0];

    // Create test students & enrollments

    // Student 1: Active student, Active enrollment in Batch A (Eligible)
    const student1 = await prisma.student.create({
      data: {
        name: `Test Eligible Student 1 ${timestamp}`,
        nim: `TEST-ELIG-1-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student1.id);

    const enrollment1 = await prisma.enrollment.create({
      data: {
        studentId: student1.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment1.id);

    // Student 2: Active student, Completed enrollment in Batch A (Eligible)
    const student2 = await prisma.student.create({
      data: {
        name: `Test Eligible Student 2 ${timestamp}`,
        nim: `TEST-ELIG-2-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student2.id);

    const enrollment2 = await prisma.enrollment.create({
      data: {
        studentId: student2.id,
        batchId: batchA.id,
        status: "COMPLETED",
      },
    });
    cleanup.enrollments.push(enrollment2.id);

    // Student 3: Active student, Dropped enrollment in Batch A (Ineligible)
    const student3 = await prisma.student.create({
      data: {
        name: `Test Dropped Enrollment Student ${timestamp}`,
        nim: `TEST-DROP-ENR-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student3.id);

    const enrollment3 = await prisma.enrollment.create({
      data: {
        studentId: student3.id,
        batchId: batchA.id,
        status: "DROPPED",
      },
    });
    cleanup.enrollments.push(enrollment3.id);

    // Student 4: Active student, Transferred enrollment in Batch A (Ineligible)
    const student4 = await prisma.student.create({
      data: {
        name: `Test Transferred Enrollment Student ${timestamp}`,
        nim: `TEST-TRANS-ENR-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student4.id);

    const enrollment4 = await prisma.enrollment.create({
      data: {
        studentId: student4.id,
        batchId: batchA.id,
        status: "TRANSFERRED",
      },
    });
    cleanup.enrollments.push(enrollment4.id);

    // Student 5: Dropped student status, Active enrollment in Batch A (Ineligible)
    const student5 = await prisma.student.create({
      data: {
        name: `Test Dropped Student Status ${timestamp}`,
        nim: `TEST-DROP-STD-${timestamp}`,
        status: "DROPPED",
      },
    });
    cleanup.students.push(student5.id);

    const enrollment5 = await prisma.enrollment.create({
      data: {
        studentId: student5.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment5.id);

    // Student 6: Active student, Soft-deleted enrollment in Batch A (Ineligible)
    const student6 = await prisma.student.create({
      data: {
        name: `Test Soft-deleted Enrollment Student ${timestamp}`,
        nim: `TEST-DEL-ENR-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student6.id);

    const enrollment6 = await prisma.enrollment.create({
      data: {
        studentId: student6.id,
        batchId: batchA.id,
        status: "ACTIVE",
        deletedAt: new Date(),
      },
    });
    cleanup.enrollments.push(enrollment6.id);

    // Student 7: Soft-deleted student (Ineligible / 404)
    const student7 = await prisma.student.create({
      data: {
        name: `Test Soft-deleted Student ${timestamp}`,
        nim: `TEST-DEL-STD-${timestamp}`,
        status: "ACTIVE",
        deletedAt: new Date(),
      },
    });
    cleanup.students.push(student7.id);

    const enrollment7 = await prisma.enrollment.create({
      data: {
        studentId: student7.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment7.id);

    // Student 8: Active student for concurrency test
    const student8 = await prisma.student.create({
      data: {
        name: `Test Concurrent Student ${timestamp}`,
        nim: `TEST-CONC-${timestamp}`,
        status: "ACTIVE",
      },
    });
    cleanup.students.push(student8.id);

    const enrollment8 = await prisma.enrollment.create({
      data: {
        studentId: student8.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment8.id);

    console.log("\n--- PART 1: RBAC & DIRECT API INVOCATION SECURITY ---");
    // 3. Unauthenticated request -> 401
    const unauthRes = await api("POST", "/api/certificates", "", {
      studentId: student1.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-UNAUTH-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("4. Anonymous POST /api/certificates returns 401 Unauthorized", unauthRes.status === 401, `Status: ${unauthRes.status}`);

    // 4. Student session -> 403 Forbidden
    const studentRes = await api("POST", "/api/certificates", studentCookies, {
      studentId: student1.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-STUDENT-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("5. Student role POST /api/certificates returns 403 Forbidden", studentRes.status === 403, `Status: ${studentRes.status}`);

    // 5. Management session -> 403 Forbidden
    const mgmtRes = await api("POST", "/api/certificates", mgmtCookies, {
      studentId: student1.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-MGMT-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("6. Management role POST /api/certificates returns 403 Forbidden", mgmtRes.status === 403, `Status: ${mgmtRes.status}`);

    // Direct invocation bypass attempt without session
    const rawBypassRes = await fetch(`${baseUrl}/api/certificates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: student1.id,
        programId: programA.id,
        batchId: batchA.id,
        certificateNumber: `TEST-BYPASS-${timestamp}`,
        issuedAt: new Date().toISOString(),
      }),
    });
    record("7. Direct API invocation without cookies blocked (401)", rawBypassRes.status === 401, `Status: ${rawBypassRes.status}`);

    console.log("\n--- PART 2: RELATIONSHIP INTEGRITY (TAHAP 5E.1 PRESERVED) ---");
    // 6. Mismatched Batch and Program -> 400
    const mismatchRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: programB.id, // Mismatch with batchA
      batchId: batchA.id,
      certificateNumber: `TEST-MISMATCH-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("8. Mismatched Batch and Program returns 400 Bad Request", mismatchRes.status === 400, `Status: ${mismatchRes.status}`);
    record("8b. Mismatched message clarifies batch does not belong to program",
      mismatchRes.data?.error?.includes("Batch does not belong to the selected program"),
      JSON.stringify(mismatchRes.data));

    // 7. Student not enrolled in batch -> 400
    const notEnrolledRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: programB.id,
      batchId: batchB.id, // Student 1 is not enrolled in Batch B
      certificateNumber: `TEST-NOTENR-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("9. Student not enrolled in batch returns 400 Bad Request", notEnrolledRes.status === 400, `Status: ${notEnrolledRes.status}`);
    record("9b. Not enrolled message is informative",
      notEnrolledRes.data?.error?.includes("Student is not enrolled in the specified batch"),
      JSON.stringify(notEnrolledRes.data));

    console.log("\n--- PART 3: CERTIFICATE ELIGIBILITY GATE (TAHAP 5E.3) ---");
    // 8. Ineligible: Student status DROPPED -> 400
    const droppedStudentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student5.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-DROP-STD-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("10. Dropped student status returns 400 Bad Request", droppedStudentRes.status === 400, `Status: ${droppedStudentRes.status}`);
    record("10b. Dropped student error message is informative and safe",
      droppedStudentRes.data?.error?.toLowerCase().includes("dropped"),
      JSON.stringify(droppedStudentRes.data));

    // 9. Ineligible: Enrollment status DROPPED -> 400
    const droppedEnrollmentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student3.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-DROP-ENR-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("11. Dropped enrollment status returns 400 Bad Request", droppedEnrollmentRes.status === 400, `Status: ${droppedEnrollmentRes.status}`);
    record("11b. Dropped enrollment error message informs dropped status",
      droppedEnrollmentRes.data?.error?.toLowerCase().includes("dropped"),
      JSON.stringify(droppedEnrollmentRes.data));

    // 10. Ineligible: Enrollment status TRANSFERRED -> 400
    const transEnrollmentRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student4.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-TRANS-ENR-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("12. Transferred enrollment status returns 400 Bad Request", transEnrollmentRes.status === 400, `Status: ${transEnrollmentRes.status}`);
    record("12b. Transferred enrollment error message informs transferred status",
      transEnrollmentRes.data?.error?.toLowerCase().includes("transferred"),
      JSON.stringify(transEnrollmentRes.data));

    // 11. Ineligible: Soft-deleted enrollment -> 400 (Not enrolled in batch)
    const softDelEnrRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student6.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-DEL-ENR-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("13. Soft-deleted enrollment returns 400 Bad Request (Not enrolled)", softDelEnrRes.status === 400, `Status: ${softDelEnrRes.status}`);

    // 12. Ineligible: Soft-deleted student -> 404 Not Found
    const softDelStdRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student7.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `TEST-DEL-STD-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("14. Soft-deleted student returns 404 Not Found", softDelStdRes.status === 404, `Status: ${softDelStdRes.status}`);

    // 13. Eligible: ACTIVE enrollment + ACTIVE student -> 201 Created
    const certNum1 = `CERT-ELIG-ACT-${timestamp}`;
    const eligibleActRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: certNum1,
      issuedAt: new Date().toISOString(),
    });
    record("15. Eligible student with ACTIVE enrollment returns 201 Created", eligibleActRes.status === 201, `Status: ${eligibleActRes.status}`);
    const cert1 = eligibleActRes.data?.data;
    if (cert1?.id) cleanup.certificates.push(cert1.id);
    record("15b. Certificate created with status ACTIVE", cert1?.status === "ACTIVE", `Status: ${cert1?.status}`);

    // 14. Eligible: COMPLETED enrollment + ACTIVE student -> 201 Created
    const certNum2 = `CERT-ELIG-COMP-${timestamp}`;
    const eligibleCompRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student2.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: certNum2,
      issuedAt: new Date().toISOString(),
    });
    record("16. Eligible student with COMPLETED enrollment returns 201 Created", eligibleCompRes.status === 201, `Status: ${eligibleCompRes.status}`);
    const cert2 = eligibleCompRes.data?.data;
    if (cert2?.id) cleanup.certificates.push(cert2.id);
    record("16b. Certificate created with status ACTIVE", cert2?.status === "ACTIVE", `Status: ${cert2?.status}`);

    console.log("\n--- PART 4: DUPLICATE PREVENTION PRESERVED (TAHAP 5E.2) ---");
    // 15. Duplicate active certificate for same student, program, batch -> 409 Conflict
    const dupActiveRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: `CERT-DUP-ATTEMPT-${timestamp}`,
      issuedAt: new Date().toISOString(),
    });
    record("17. Duplicate active certificate for student in batch returns 409 Conflict", dupActiveRes.status === 409, `Status: ${dupActiveRes.status}`);
    record("17b. Duplicate message explains active certificate already exists",
      dupActiveRes.data?.error?.includes("An active certificate already exists"),
      JSON.stringify(dupActiveRes.data));

    // 16. Duplicate certificateNumber -> 409 Conflict
    const dupNumberRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student2.id, // Different student
      programId: programA.id,
      batchId: batchA.id,
      certificateNumber: certNum1, // Reusing certNum1 from student 1
      issuedAt: new Date().toISOString(),
    });
    record("18. Duplicate certificateNumber returns 409 Conflict", dupNumberRes.status === 409, `Status: ${dupNumberRes.status}`);

    // 17. Revoke and replacement issuance
    if (cert1?.id) {
      const revokeRes = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, adminCookies, {
        reason: "Test revocation for replacement eligibility",
      });
      record("19. Revoke active certificate returns 200 OK", revokeRes.status === 200, `Status: ${revokeRes.status}`);

      // Now Student 1 has REVOKED certificate, should be eligible for replacement
      const replacementCertNum = `CERT-REPLACE-${timestamp}`;
      const replaceRes = await api("POST", "/api/certificates", adminCookies, {
        studentId: student1.id,
        programId: programA.id,
        batchId: batchA.id,
        certificateNumber: replacementCertNum,
        issuedAt: new Date().toISOString(),
      });
      record("20. Replacement issuance after revocation returns 201 Created", replaceRes.status === 201, `Status: ${replaceRes.status}`);
      const replaceCert = replaceRes.data?.data;
      if (replaceCert?.id) cleanup.certificates.push(replaceCert.id);
    }

    // 18. Race condition / Concurrency test on Student 8
    console.log("\n--- PART 5: CONCURRENT ISSUANCE RACE CONDITION TEST ---");
    const [raceRes1, raceRes2] = await Promise.all([
      api("POST", "/api/certificates", adminCookies, {
        studentId: student8.id,
        programId: programA.id,
        batchId: batchA.id,
        certificateNumber: `CERT-RACE-1-${timestamp}`,
        issuedAt: new Date().toISOString(),
      }),
      api("POST", "/api/certificates", adminCookies, {
        studentId: student8.id,
        programId: programA.id,
        batchId: batchA.id,
        certificateNumber: `CERT-RACE-2-${timestamp}`,
        issuedAt: new Date().toISOString(),
      }),
    ]);
    const statuses = [raceRes1.status, raceRes2.status].sort();
    record("21. Concurrent requests result in exactly one 201 and one 409",
      statuses[0] === 201 && statuses[1] === 409,
      `Got statuses: ${raceRes1.status}, ${raceRes2.status}`);

    const raceCreatedId = raceRes1.data?.data?.id || raceRes2.data?.data?.id;
    if (raceCreatedId) cleanup.certificates.push(raceCreatedId);

    console.log("\n--- PART 6: AUDIT LOG VERIFICATION ---");
    // Verify AuditLog was created for certificate operations
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: {
        entity: "Certificate",
        action: { in: ["CREATE", "UPDATE", "REVOKE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    record("22. AuditLog created for certificate creation",
      recentAuditLogs.some((l) => l.action === "CREATE"),
      "No CREATE action found in recent audit logs");

  } finally {
    console.log("\n--- CLEANUP & BASELINE RESTORATION ---");
    // Clean up all created certificates
    if (cleanup.certificates.length > 0) {
      console.log(`Cleaning up ${cleanup.certificates.length} test certificates...`);
      // Also cleanup associated audit logs
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

    // Verify final counts match baseline
    const finalCertCount = await prisma.certificate.count();
    const finalAuditCount = await prisma.auditLog.count();
    console.log(`Final DB Baseline -> Certificates: ${finalCertCount}, AuditLogs: ${finalAuditCount}`);

    record("23. Final Certificate count returned exactly to baseline (0)", finalCertCount === initialCertCount, `Expected ${initialCertCount}, got ${finalCertCount}`);
    record("24. Final AuditLog count preserved without artifact leakage", finalAuditCount === initialAuditCount, `Expected ${initialAuditCount}, got ${finalAuditCount}`);
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
