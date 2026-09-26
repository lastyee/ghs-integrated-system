// scripts/test-step74b-certificates-reports.mjs
// Step 74B: Backend Certificates & Reports Implementation Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function record(name, expected, actual, category = "GENERAL") {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed, category });
  if (passed) {
    console.log(`✓ [${category}] ${name}`);
  } else {
    console.error(`✗ [${category}] ${name}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
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
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
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
  console.log("=== STEP 74B CERTIFICATES & REPORTS BACKEND TEST SUITE ===\n");

  const createdUserIds = [];
  const createdCertIds = [];
  let studentBRecord = null;

  try {
    // ==========================================
    // 0. CAPTURE INITIAL DATABASE BASELINE
    // ==========================================
    console.log("Capturing database baseline across all 16 models...");
    const initialCounts = {
      users: await prisma.user.count(),
      instructors: await prisma.instructor.count(),
      programs: await prisma.program.count(),
      batches: await prisma.batch.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      certificates: await prisma.certificate.count(),
    };

    console.log("Initial baseline counts:", initialCounts);
    record("0. Initial certificates baseline is 0", 0, initialCounts.certificates, "BASELINE");

    // Fetch master data needed for test fixtures
    const baselineProgram = await prisma.program.findFirst({ orderBy: { id: "asc" } });
    const baselineBatch = await prisma.batch.findFirst({ orderBy: { id: "asc" } });

    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
      include: { student: true },
    });
    const studentA = demoStudentUser?.student;
    if (!studentA) throw new Error("Demo student record not linked in database!");

    // Find student B without linked userId
    studentBRecord = await prisma.student.findFirst({
      where: {
        id: { not: studentA.id },
        userId: null,
      },
    });
    if (!studentBRecord) throw new Error("Could not find unlinked student for Student B testing!");

    // Setup Roles map
    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    // Create temporary users for role matrix testing
    const adminUser = await prisma.user.create({
      data: {
        email: "test.admin.74b@ghs.local",
        name: "Test Admin 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ADMIN"),
      },
    });
    createdUserIds.push(adminUser.id);

    const managementUser = await prisma.user.create({
      data: {
        email: "test.mgmt.74b@ghs.local",
        name: "Test Management 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("MANAGEMENT"),
      },
    });
    createdUserIds.push(managementUser.id);

    const academicStaffUser = await prisma.user.create({
      data: {
        email: "test.academic.74b@ghs.local",
        name: "Test Academic Staff 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ACADEMIC_STAFF"),
      },
    });
    createdUserIds.push(academicStaffUser.id);

    const instructorUser = await prisma.user.create({
      data: {
        email: "test.instructor.74b@ghs.local",
        name: "Test Instructor 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("INSTRUCTOR"),
      },
    });
    createdUserIds.push(instructorUser.id);

    const placementStaffUser = await prisma.user.create({
      data: {
        email: "test.placement.74b@ghs.local",
        name: "Test Placement Staff 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("PLACEMENT_STAFF"),
      },
    });
    createdUserIds.push(placementStaffUser.id);

    const studentBUser = await prisma.user.create({
      data: {
        email: "test.studentB.74b@ghs.local",
        name: "Test Student B 74B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("STUDENT"),
      },
    });
    createdUserIds.push(studentBUser.id);

    // Link studentBRecord to studentBUser
    await prisma.student.update({
      where: { id: studentBRecord.id },
      data: { userId: studentBUser.id },
    });

    // Authenticate all test sessions
    console.log("Authenticating test sessions...");
    const superAdminCookies = await login("admin.demo@ghs.local", "superadmin123");
    const studentACookies = await login("student.demo@ghs.local", "murid123");
    const adminCookies = await login(adminUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const academicStaffCookies = await login(academicStaffUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);
    const placementStaffCookies = await login(placementStaffUser.email, tempPassword);
    const studentBCookies = await login(studentBUser.email, tempPassword);

    // ==========================================
    // 1. AUTHENTICATION (Unauthenticated requests -> 401)
    // ==========================================
    console.log("\n--- Section 1: Authentication ---");
    const unauthGetCerts = await api("GET", "/api/certificates");
    record("1. unauth GET /api/certificates -> 401", 401, unauthGetCerts.status, "AUTH");

    const unauthPostCerts = await api("POST", "/api/certificates", "", {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-UNAUTH-001",
      issuedAt: new Date().toISOString(),
    });
    record("2. unauth POST /api/certificates -> 401", 401, unauthPostCerts.status, "AUTH");

    const unauthGetCertDetail = await api("GET", "/api/certificates/cmunonexistentid");
    record("3. unauth GET /api/certificates/[id] -> 401", 401, unauthGetCertDetail.status, "AUTH");

    const unauthRevokeCert = await api("PATCH", "/api/certificates/cmunonexistentid/revoke", "", {
      reason: "Unauthorized attempt",
    });
    record("4. unauth PATCH /api/certificates/[id]/revoke -> 401", 401, unauthRevokeCert.status, "AUTH");

    const unauthDownloadCert = await api("GET", "/api/certificates/cmunonexistentid/download");
    record("5. unauth GET /api/certificates/[id]/download -> 401", 401, unauthDownloadCert.status, "AUTH");

    const unauthAcademicReport = await api("GET", "/api/reports/academic");
    record("6. unauth GET /api/reports/academic -> 401", 401, unauthAcademicReport.status, "AUTH");

    const unauthAttendanceReport = await api("GET", "/api/reports/attendance");
    record("7. unauth GET /api/reports/attendance -> 401", 401, unauthAttendanceReport.status, "AUTH");

    const unauthPlacementReport = await api("GET", "/api/reports/placement");
    record("8. unauth GET /api/reports/placement -> 401", 401, unauthPlacementReport.status, "AUTH");

    // ==========================================
    // 2. CERTIFICATE CREATION RBAC
    // ==========================================
    console.log("\n--- Section 2: Certificate Creation RBAC ---");

    // Super Admin create -> 201
    const certAData = {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-74B-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
      path: "certificates/2026/GHS-CERT-74B-001.pdf",
    };
    const saCreateRes = await api("POST", "/api/certificates", superAdminCookies, certAData);
    record("9. SUPER_ADMIN create certificate -> 201", 201, saCreateRes.status, "CERT_RBAC");
    const certA = saCreateRes.payload?.data;
    if (certA?.id) createdCertIds.push(certA.id);

    // Admin create -> 201
    const certBData = {
      studentId: studentBRecord.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-74B-002",
      issuedAt: "2026-09-21T10:00:00.000Z",
      path: "certificates/2026/GHS-CERT-74B-002.pdf",
    };
    const adminCreateRes = await api("POST", "/api/certificates", adminCookies, certBData);
    record("10. ADMIN create certificate -> 201", 201, adminCreateRes.status, "CERT_RBAC");
    const certB = adminCreateRes.payload?.data;
    if (certB?.id) createdCertIds.push(certB.id);

    // Certificate without path (path optional)
    const certCData = {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-74B-003",
      issuedAt: "2026-09-22T10:00:00.000Z",
    };
    const certCCreateRes = await api("POST", "/api/certificates", superAdminCookies, certCData);
    record("11. SUPER_ADMIN create certificate with null path -> 201", 201, certCCreateRes.status, "CERT_RBAC");
    const certC = certCCreateRes.payload?.data;
    if (certC?.id) createdCertIds.push(certC.id);

    // Management cannot create -> 403
    const mgmtCreateRes = await api("POST", "/api/certificates", managementCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-MGMT-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("12. MANAGEMENT create certificate -> 403", 403, mgmtCreateRes.status, "CERT_RBAC");

    // Student cannot create -> 403
    const studentCreateRes = await api("POST", "/api/certificates", studentACookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-STUD-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("13. STUDENT create certificate -> 403", 403, studentCreateRes.status, "CERT_RBAC");

    // Academic Staff cannot create -> 403
    const academicCreateRes = await api("POST", "/api/certificates", academicStaffCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-ACAD-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("14. ACADEMIC_STAFF create certificate -> 403", 403, academicCreateRes.status, "CERT_RBAC");

    // Instructor cannot create -> 403
    const instructorCreateRes = await api("POST", "/api/certificates", instructorCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-INST-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("15. INSTRUCTOR create certificate -> 403", 403, instructorCreateRes.status, "CERT_RBAC");

    // Placement Staff cannot create -> 403
    const placementCreateRes = await api("POST", "/api/certificates", placementStaffCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-PLAC-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("16. PLACEMENT_STAFF create certificate -> 403", 403, placementCreateRes.status, "CERT_RBAC");

    // ==========================================
    // 3. CERTIFICATE VALIDATION
    // ==========================================
    console.log("\n--- Section 3: Certificate Validation ---");

    // Non-existent student -> 404
    const nonExistentStudentRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: "cmuinvalidstudent0000000000",
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-INV-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("17. Non-existent studentId -> 404", 404, nonExistentStudentRes.status, "VALIDATION");

    // Non-existent program -> 404
    const nonExistentProgramRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: "cmuinvalidprog000000000000",
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-INV-002",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("18. Non-existent programId -> 404", 404, nonExistentProgramRes.status, "VALIDATION");

    // Non-existent batch -> 404
    const nonExistentBatchRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: "cmuinvalidbatch00000000000",
      certificateNumber: "GHS-CERT-INV-003",
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("19. Non-existent batchId -> 404", 404, nonExistentBatchRes.status, "VALIDATION");

    // Duplicate certificateNumber -> 409
    const duplicateCertRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-74B-001", // duplicate of certA
      issuedAt: "2026-09-20T10:00:00.000Z",
    });
    record("20. Duplicate certificateNumber -> 409", 409, duplicateCertRes.status, "VALIDATION");

    // Invalid schema payload (missing certificateNumber) -> 400
    const invalidPayloadRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      // missing certificateNumber and issuedAt
    });
    record("21. Missing required fields -> 400", 400, invalidPayloadRes.status, "VALIDATION");

    // Unknown fields in payload -> 400 (strict zod validation)
    const unknownFieldsRes = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-CERT-74B-STRICT",
      issuedAt: "2026-09-20T10:00:00.000Z",
      arbitraryField: "not_allowed",
    });
    record("22. Unknown fields rejected by strict schema -> 400", 400, unknownFieldsRes.status, "VALIDATION");

    // ==========================================
    // 4. CERTIFICATE READ & RBAC
    // ==========================================
    console.log("\n--- Section 4: Certificate Read & RBAC ---");

    // Super Admin global read -> 200
    const saReadRes = await api("GET", "/api/certificates", superAdminCookies);
    record("23. SUPER_ADMIN read certificates list -> 200", 200, saReadRes.status, "CERT_READ");
    record(
      "23b. SUPER_ADMIN sees all created certificates (>=3)",
      true,
      (saReadRes.payload?.data?.length ?? 0) >= 3,
      "CERT_READ"
    );

    // Admin global read -> 200
    const adminReadRes = await api("GET", "/api/certificates", adminCookies);
    record("24. ADMIN read certificates list -> 200", 200, adminReadRes.status, "CERT_RBAC");

    // Management global read -> 200
    const mgmtReadRes = await api("GET", "/api/certificates", managementCookies);
    record("25. MANAGEMENT read certificates list -> 200", 200, mgmtReadRes.status, "CERT_RBAC");

    // Academic Staff read certificates -> 403 (no certificate:read permission)
    const academicReadRes = await api("GET", "/api/certificates", academicStaffCookies);
    record("26. ACADEMIC_STAFF read certificates -> 403", 403, academicReadRes.status, "CERT_RBAC");

    // Instructor read certificates -> 403
    const instructorReadRes = await api("GET", "/api/certificates", instructorCookies);
    record("27. INSTRUCTOR read certificates -> 403", 403, instructorReadRes.status, "CERT_RBAC");

    // Placement Staff read certificates -> 403
    const placementReadRes = await api("GET", "/api/certificates", placementStaffCookies);
    record("28. PLACEMENT_STAFF read certificates -> 403", 403, placementReadRes.status, "CERT_RBAC");

    // Student A read own list -> 200
    const studentAReadRes = await api("GET", "/api/certificates", studentACookies);
    record("29. STUDENT read own certificates list -> 200", 200, studentAReadRes.status, "CERT_READ");
    const studentACerts = studentAReadRes.payload?.data || [];
    const allBelongToStudentA = studentACerts.every((c) => c.studentId === studentA.id);
    record("29b. STUDENT list only contains own certificates", true, allBelongToStudentA && studentACerts.length > 0, "CERT_READ");

    // Student A detail read own cert -> 200
    const studentAOwnDetail = await api("GET", `/api/certificates/${certA.id}`, studentACookies);
    record("30. STUDENT read own certificate detail -> 200", 200, studentAOwnDetail.status, "CERT_READ");
    record("30b. Detail includes student, program, batch objects", true, Boolean(studentAOwnDetail.payload?.data?.program && studentAOwnDetail.payload?.data?.batch && studentAOwnDetail.payload?.data?.student), "CERT_READ");

    // Sensitive field checks (no passwordHash)
    const certString = JSON.stringify(studentAOwnDetail.payload);
    record("31. Response contains no passwordHash", false, certString.includes("passwordHash"), "PRIVACY");

    // ==========================================
    // 5. IDOR SCOPING & ACCESS CONTROL
    // ==========================================
    console.log("\n--- Section 5: IDOR Protection ---");

    // Student A attempting to query with ?studentId=<studentB>
    const studentASnoopQuery = await api(
      "GET",
      `/api/certificates?studentId=${studentBRecord.id}`,
      studentACookies
    );
    record("32. STUDENT query with foreign studentId is scoped to self -> 200", 200, studentASnoopQuery.status, "IDOR");
    const snoopData = studentASnoopQuery.payload?.data || [];
    const leakedStudentBInQuery = snoopData.some((c) => c.studentId === studentBRecord.id);
    record("32b. No foreign student certificates returned in query spoof", false, leakedStudentBInQuery, "IDOR");

    // Student A accessing Student B cert detail -> 403
    const studentASnoopDetail = await api("GET", `/api/certificates/${certB.id}`, studentACookies);
    record("33. STUDENT accessing foreign certificate detail -> 403", 403, studentASnoopDetail.status, "IDOR");

    // Student B accessing Student A cert detail -> 403
    const studentBSnoopDetail = await api("GET", `/api/certificates/${certA.id}`, studentBCookies);
    record("34. STUDENT B accessing Student A certificate detail -> 403", 403, studentBSnoopDetail.status, "IDOR");

    // Student A downloading Student B cert -> 403
    const studentASnoopDownload = await api("GET", `/api/certificates/${certB.id}/download`, studentACookies);
    record("35. STUDENT downloading foreign certificate -> 403", 403, studentASnoopDownload.status, "IDOR");

    // ==========================================
    // 6. CERTIFICATE LIFECYCLE & REVOCATION
    // ==========================================
    console.log("\n--- Section 6: Certificate Lifecycle & Revocation ---");

    // Verify initial status is ACTIVE
    record("36. Newly created certificate status is ACTIVE", "ACTIVE", certA.status, "LIFECYCLE");

    // Student cannot revoke -> 403
    const studentRevokeRes = await api("PATCH", `/api/certificates/${certA.id}/revoke`, studentACookies, {
      reason: "Unauthorized attempt",
    });
    record("37. STUDENT revoke certificate -> 403", 403, studentRevokeRes.status, "CERT_RBAC");

    // Management cannot revoke -> 403
    const mgmtRevokeRes = await api("PATCH", `/api/certificates/${certA.id}/revoke`, managementCookies, {
      reason: "Unauthorized attempt",
    });
    record("38. MANAGEMENT revoke certificate -> 403", 403, mgmtRevokeRes.status, "CERT_RBAC");

    // Academic Staff cannot revoke -> 403
    const academicRevokeRes = await api("PATCH", `/api/certificates/${certA.id}/revoke`, academicStaffCookies, {
      reason: "Unauthorized attempt",
    });
    record("39. ACADEMIC_STAFF revoke certificate -> 403", 403, academicRevokeRes.status, "CERT_RBAC");

    // Admin revokes certB -> 200
    const adminRevokeRes = await api("PATCH", `/api/certificates/${certB.id}/revoke`, adminCookies, {
      reason: "Administrative revocation for verification",
    });
    record("40. ADMIN revoke certificate -> 200", 200, adminRevokeRes.status, "LIFECYCLE");
    record("40b. Revoked certificate status is REVOKED", "REVOKED", adminRevokeRes.payload?.data?.status, "LIFECYCLE");

    // Second revoke of already revoked certificate is safe and idempotent -> 200
    const secondRevokeRes = await api("PATCH", `/api/certificates/${certB.id}/revoke`, adminCookies, {
      reason: "Second revoke attempt",
    });
    record("41. Second revoke is safe & idempotent -> 200", 200, secondRevokeRes.status, "LIFECYCLE");
    record("41b. Status remains REVOKED", "REVOKED", secondRevokeRes.payload?.data?.status, "LIFECYCLE");

    // Non-existent certificate revoke -> 404
    const nonExistentRevokeRes = await api("PATCH", "/api/certificates/cmunonexistentid/revoke", superAdminCookies, {
      reason: "Not found test",
    });
    record("42. Non-existent certificate revoke -> 404", 404, nonExistentRevokeRes.status, "VALIDATION");

    // DELETE /api/certificates/[id] -> 405 Method Not Allowed
    const deleteCertRes = await api("DELETE", `/api/certificates/${certA.id}`, superAdminCookies);
    record("43. DELETE /api/certificates/[id] -> 405 Method Not Allowed", 405, deleteCertRes.status, "LIFECYCLE");

    // DELETE /api/certificates -> 405 Method Not Allowed
    const deleteCertRootRes = await api("DELETE", "/api/certificates", superAdminCookies);
    record("44. DELETE /api/certificates -> 405 Method Not Allowed", 405, deleteCertRootRes.status, "LIFECYCLE");

    // ==========================================
    // 7. CERTIFICATE DOWNLOAD & STORAGE
    // ==========================================
    console.log("\n--- Section 7: Certificate Download & Storage ---");

    // Student A downloading own valid certificate -> 200 with signedUrl
    const studentADownloadRes = await api("GET", `/api/certificates/${certA.id}/download`, studentACookies);
    record("45. STUDENT download own certificate -> 200", 200, studentADownloadRes.status, "STORAGE");
    const signedUrl = studentADownloadRes.payload?.data?.signedUrl;
    record("45b. Signed URL generated and contains private token", true, Boolean(signedUrl && signedUrl.includes("token=")), "STORAGE");

    // Super Admin download -> 200
    const saDownloadRes = await api("GET", `/api/certificates/${certA.id}/download`, superAdminCookies);
    record("46. SUPER_ADMIN download certificate -> 200", 200, saDownloadRes.status, "STORAGE");

    // Management download -> 200
    const mgmtDownloadRes = await api("GET", `/api/certificates/${certA.id}/download`, managementCookies);
    record("47. MANAGEMENT download certificate -> 200", 200, mgmtDownloadRes.status, "STORAGE");

    // Certificate with null/missing path -> 400
    const nullPathDownloadRes = await api("GET", `/api/certificates/${certC.id}/download`, superAdminCookies);
    record("48. Download certificate with null path -> 400", 400, nullPathDownloadRes.status, "STORAGE");

    // Download of REVOKED certificate does NOT change status to ACTIVE
    const revokedDownloadRes = await api("GET", `/api/certificates/${certB.id}/download`, superAdminCookies);
    record("49. Download revoked certificate returns 200", 200, revokedDownloadRes.status, "STORAGE");
    record("49b. Revoked certificate status remains REVOKED in download response", "REVOKED", revokedDownloadRes.payload?.data?.status, "STORAGE");

    const certBInDb = await prisma.certificate.findUnique({ where: { id: certB.id } });
    record("49c. Revoked certificate in DB remains REVOKED", "REVOKED", certBInDb?.status, "STORAGE");

    // ==========================================
    // 8. AUDIT LOGGING
    // ==========================================
    console.log("\n--- Section 8: Audit Logging ---");

    // Verify CREATE audit log exists for certA
    const createAuditLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Certificate",
        entityId: certA.id,
        action: "CREATE",
      },
    });
    record("50. CREATE audit log exists for certA", true, Boolean(createAuditLog), "AUDIT");

    // Verify REVOKE audit log exists for certB
    const revokeAuditLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Certificate",
        entityId: certB.id,
        action: "REVOKE",
      },
    });
    record("51. REVOKE audit log exists for certB", true, Boolean(revokeAuditLog), "AUDIT");

    // Verify audit log has no password or storage credentials
    const auditChangesStr = JSON.stringify(revokeAuditLog?.changes || {});
    record("52. Audit log changes contain no credentials", false, auditChangesStr.includes("password") || auditChangesStr.includes("serviceRoleKey"), "AUDIT");

    // Failed mutation does NOT create false success audit
    const falseAuditLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Certificate",
        entityId: "cmunonexistentid",
      },
    });
    record("53. Failed operation does not create audit log", null, falseAuditLog, "AUDIT");

    // ==========================================
    // 9. REPORTS LIVE AGGREGATES & RBAC
    // ==========================================
    console.log("\n--- Section 9: Reports Live Aggregates & RBAC ---");

    // --- Academic Report ---
    // RBAC: SUPER_ADMIN (200), ADMIN (200), MANAGEMENT (200), ACADEMIC_STAFF (200), PLACEMENT_STAFF (403), INSTRUCTOR (403), STUDENT (403)
    const saAcadReport = await api("GET", "/api/reports/academic", superAdminCookies);
    record("54. SUPER_ADMIN GET /api/reports/academic -> 200", 200, saAcadReport.status, "REPORTS");

    const adminAcadReport = await api("GET", "/api/reports/academic", adminCookies);
    record("55. ADMIN GET /api/reports/academic -> 200", 200, adminAcadReport.status, "REPORTS");

    const mgmtAcadReport = await api("GET", "/api/reports/academic", managementCookies);
    record("56. MANAGEMENT GET /api/reports/academic -> 200", 200, mgmtAcadReport.status, "REPORTS");

    const academicStaffAcadReport = await api("GET", "/api/reports/academic", academicStaffCookies);
    record("57. ACADEMIC_STAFF GET /api/reports/academic -> 200", 200, academicStaffAcadReport.status, "REPORTS");

    const placementStaffAcadReport = await api("GET", "/api/reports/academic", placementStaffCookies);
    record("58. PLACEMENT_STAFF GET /api/reports/academic -> 403", 403, placementStaffAcadReport.status, "REPORTS_RBAC");

    const instructorAcadReport = await api("GET", "/api/reports/academic", instructorCookies);
    record("59. INSTRUCTOR GET /api/reports/academic -> 403", 403, instructorAcadReport.status, "REPORTS_RBAC");

    const studentAcadReport = await api("GET", "/api/reports/academic", studentACookies);
    record("60. STUDENT GET /api/reports/academic -> 403", 403, studentAcadReport.status, "REPORTS_RBAC");

    // Academic report data structure and live values
    const acadData = saAcadReport.payload?.data;
    record("61. Academic report contains totalStudents", true, typeof acadData?.totalStudents === "number", "REPORTS");
    record("61b. totalStudents matches DB count (21)", initialCounts.students, acadData?.totalStudents, "REPORTS");
    record("62. Academic report contains totalBatches", initialCounts.batches, acadData?.totalBatches, "REPORTS");
    record("63. Academic report contains attendanceRate", true, typeof acadData?.attendanceRate === "number", "REPORTS");
    record("64. Academic report contains averageAssessmentScore", true, typeof acadData?.averageAssessmentScore === "number", "REPORTS");

    // --- Attendance Report ---
    // RBAC: SUPER_ADMIN (200), ADMIN (200), MANAGEMENT (200), ACADEMIC_STAFF (200), PLACEMENT_STAFF (403), INSTRUCTOR (403), STUDENT (403)
    const saAttReport = await api("GET", "/api/reports/attendance", superAdminCookies);
    record("65. SUPER_ADMIN GET /api/reports/attendance -> 200", 200, saAttReport.status, "REPORTS");

    const adminAttReport = await api("GET", "/api/reports/attendance", adminCookies);
    record("66. ADMIN GET /api/reports/attendance -> 200", 200, adminAttReport.status, "REPORTS");

    const mgmtAttReport = await api("GET", "/api/reports/attendance", managementCookies);
    record("67. MANAGEMENT GET /api/reports/attendance -> 200", 200, mgmtAttReport.status, "REPORTS");

    const academicStaffAttReport = await api("GET", "/api/reports/attendance", academicStaffCookies);
    record("68. ACADEMIC_STAFF GET /api/reports/attendance -> 200", 200, academicStaffAttReport.status, "REPORTS");

    const placementStaffAttReport = await api("GET", "/api/reports/attendance", placementStaffCookies);
    record("69. PLACEMENT_STAFF GET /api/reports/attendance -> 403", 403, placementStaffAttReport.status, "REPORTS_RBAC");

    const instructorAttReport = await api("GET", "/api/reports/attendance", instructorCookies);
    record("70. INSTRUCTOR GET /api/reports/attendance -> 403", 403, instructorAttReport.status, "REPORTS_RBAC");

    const studentAttReport = await api("GET", "/api/reports/attendance", studentACookies);
    record("71. STUDENT GET /api/reports/attendance -> 403", 403, studentAttReport.status, "REPORTS_RBAC");

    // Attendance report data structure
    const attData = saAttReport.payload?.data;
    record("72. Attendance report contains attendance breakdown", true, typeof attData?.presentCount === "number" && typeof attData?.lateCount === "number" && typeof attData?.absentCount === "number", "REPORTS");
    record("73. Attendance report contains absenceBreakdown (sick, permitted, unexcused)", true, typeof attData?.absenceBreakdown?.sick === "number" && typeof attData?.absenceBreakdown?.permitted === "number" && typeof attData?.absenceBreakdown?.unexcused === "number", "REPORTS");
    record("74. Attendance report contains batchRates list", true, Array.isArray(attData?.batchRates) && attData.batchRates.length === initialCounts.batches, "REPORTS");

    // --- Placement Report ---
    // RBAC: SUPER_ADMIN (200), ADMIN (200), MANAGEMENT (200), PLACEMENT_STAFF (200), ACADEMIC_STAFF (403), INSTRUCTOR (403), STUDENT (403)
    const saPlaceReport = await api("GET", "/api/reports/placement", superAdminCookies);
    record("75. SUPER_ADMIN GET /api/reports/placement -> 200", 200, saPlaceReport.status, "REPORTS");

    const adminPlaceReport = await api("GET", "/api/reports/placement", adminCookies);
    record("76. ADMIN GET /api/reports/placement -> 200", 200, adminPlaceReport.status, "REPORTS");

    const mgmtPlaceReport = await api("GET", "/api/reports/placement", managementCookies);
    record("77. MANAGEMENT GET /api/reports/placement -> 200", 200, mgmtPlaceReport.status, "REPORTS");

    const placementStaffPlaceReport = await api("GET", "/api/reports/placement", placementStaffCookies);
    record("78. PLACEMENT_STAFF GET /api/reports/placement -> 200", 200, placementStaffPlaceReport.status, "REPORTS");

    const academicStaffPlaceReport = await api("GET", "/api/reports/placement", academicStaffCookies);
    record("79. ACADEMIC_STAFF GET /api/reports/placement -> 403", 403, academicStaffPlaceReport.status, "REPORTS_RBAC");

    const instructorPlaceReport = await api("GET", "/api/reports/placement", instructorCookies);
    record("80. INSTRUCTOR GET /api/reports/placement -> 403", 403, instructorPlaceReport.status, "REPORTS_RBAC");

    const studentPlaceReport = await api("GET", "/api/reports/placement", studentACookies);
    record("81. STUDENT GET /api/reports/placement -> 403", 403, studentPlaceReport.status, "REPORTS_RBAC");

    // Placement report data structure
    const placeData = saPlaceReport.payload?.data;
    record("82. Placement report contains applicationFunnel", true, Boolean(placeData?.applicationFunnel && typeof placeData.applicationFunnel.APPLIED === "number"), "REPORTS");
    record("83. Placement report contains interviewStatusDistribution", true, Boolean(placeData?.interviewStatusDistribution && typeof placeData.interviewStatusDistribution.PENDING === "number"), "REPORTS");
    record("84. Placement report contains placementStatusDistribution", true, Boolean(placeData?.placementStatusDistribution && typeof placeData.placementStatusDistribution.PREPARATION === "number"), "REPORTS");

    // Reports Privacy check
    const allReportsString = JSON.stringify({ acadData, attData, placeData });
    record("85. Reports do not expose NIK", false, allReportsString.includes("nik") && allReportsString.includes("320"), "PRIVACY");
    record("86. Reports do not expose passwords or tokens", false, allReportsString.includes("password") || allReportsString.includes("token"), "PRIVACY");

  } finally {
    // ==========================================
    // 10. CLEANUP & BASELINE RESTORATION
    // ==========================================
    console.log("\n--- Section 10: Cleanup & Baseline Restoration ---");

    // Delete created certificates and audit logs
    if (createdCertIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entity: "Certificate",
          entityId: { in: createdCertIds },
        },
      }).catch((e) => console.error("Error deleting audit logs:", e));

      await prisma.certificate.deleteMany({
        where: { id: { in: createdCertIds } },
      }).catch((e) => console.error("Error deleting certificates:", e));
    }

    // Unlink studentBRecord
    if (studentBRecord) {
      await prisma.student.update({
        where: { id: studentBRecord.id },
        data: { userId: null },
      }).catch((e) => console.error("Error unlinking student B:", e));
    }

    // Delete temporary users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch((e) => console.error("Error deleting temp users:", e));
    }

    // Verify baseline counts across all 16 models
    const finalCounts = {
      users: await prisma.user.count(),
      instructors: await prisma.instructor.count(),
      programs: await prisma.program.count(),
      batches: await prisma.batch.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      certificates: await prisma.certificate.count(),
    };

    console.log("Final baseline counts:", finalCounts);

    record("87. Certificates baseline restored to 0", 0, finalCounts.certificates, "BASELINE");
    record("88. Users baseline restored to 2", 2, finalCounts.users, "BASELINE");
    record("89. Instructors baseline restored to 6", 6, finalCounts.instructors, "BASELINE");
    record("90. Programs baseline restored to 1", 1, finalCounts.programs, "BASELINE");
    record("91. Batches baseline restored to 2", 2, finalCounts.batches, "BASELINE");
    record("92. Students baseline restored to 21", 21, finalCounts.students, "BASELINE");
    record("93. Enrollments baseline restored to 21", 21, finalCounts.enrollments, "BASELINE");
    record("94. Subjects baseline restored to 6", 6, finalCounts.subjects, "BASELINE");
    record("95. Classes baseline restored to 10", 10, finalCounts.classes, "BASELINE");
    record("96. Schedules baseline restored to 10", 10, finalCounts.schedules, "BASELINE");
    record("97. Employers baseline restored to 0", 0, finalCounts.employers, "BASELINE");
    record("98. Vacancies baseline restored to 0", 0, finalCounts.vacancies, "BASELINE");
    record("99. Applications baseline restored to 0", 0, finalCounts.applications, "BASELINE");
    record("100. Interviews baseline restored to 0", 0, finalCounts.interviews, "BASELINE");
    record("101. Placements baseline restored to 0", 0, finalCounts.placements, "BASELINE");
    record("102. Documents baseline restored to 0", 0, finalCounts.documents, "BASELINE");
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED, TOTAL: ${results.length}`);
  console.log("==========================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
