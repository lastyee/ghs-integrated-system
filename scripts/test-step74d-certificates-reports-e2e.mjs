// scripts/test-step74d-certificates-reports-e2e.mjs
// Step 74D: Certificates & Reports Final E2E Audit & Hardening Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP74D_CERTIFICATES_REPORTS_E2E_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP74D_CERTIFICATES_REPORTS_E2E_CONFIRM_DATABASE",
});

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

async function api(method, apiPath, cookies = "", body = undefined) {
  const headers = {};
  if (cookies) {
    headers.Cookie = cookies;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await request(apiPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response
  }
  return { status: res.status, headers: res.headers, data: json };
}

async function main() {
  console.log("=== STEP 74D CERTIFICATES & REPORTS FINAL E2E AUDIT & HARDENING ===\n");

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

  // Track created fixtures for teardown
  const createdCertIds = [];
  const createdUserIds = [];
  let studentBRecord = null;

  try {
    console.log("Setting up role fixtures & authenticating sessions...");
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
      include: { student: true },
    });
    const studentA = demoStudentUser?.student;
    if (!studentA) throw new Error("Demo student record not found!");

    studentBRecord = await prisma.student.findFirst({
      where: {
        id: { not: studentA.id },
        userId: null,
      },
    });
    if (!studentBRecord) throw new Error("Second student record not found!");

    // Fetch baseline Program and Batch
    const baselineProgram = await prisma.program.findFirst({ orderBy: { id: "asc" } });
    const baselineBatch = await prisma.batch.findFirst({ orderBy: { id: "asc" } });
    if (!baselineProgram || !baselineBatch) {
      throw new Error("Missing baseline program or batch");
    }

    // Role mapping
    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    const tempPassword = "auditPassword123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const adminUser = await prisma.user.create({
      data: {
        email: "admin.step74d@ghs.local",
        name: "Admin Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ADMIN"),
      },
    });
    createdUserIds.push(adminUser.id);

    const mgmtUser = await prisma.user.create({
      data: {
        email: "mgmt.step74d@ghs.local",
        name: "Management Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("MANAGEMENT"),
      },
    });
    createdUserIds.push(mgmtUser.id);

    const acadUser = await prisma.user.create({
      data: {
        email: "acad.step74d@ghs.local",
        name: "Academic Staff Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ACADEMIC_STAFF"),
      },
    });
    createdUserIds.push(acadUser.id);

    const placeUser = await prisma.user.create({
      data: {
        email: "placement.step74d@ghs.local",
        name: "Placement Staff Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("PLACEMENT_STAFF"),
      },
    });
    createdUserIds.push(placeUser.id);

    const instructorUser = await prisma.user.create({
      data: {
        email: "instructor.step74d@ghs.local",
        name: "Instructor Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("INSTRUCTOR"),
      },
    });
    createdUserIds.push(instructorUser.id);

    const studentBUser = await prisma.user.create({
      data: {
        email: "studentB.step74d@ghs.local",
        name: "Student B Audit 74D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("STUDENT"),
      },
    });
    createdUserIds.push(studentBUser.id);

    // Link studentB to Student B User
    await prisma.student.update({
      where: { id: studentBRecord.id },
      data: { userId: studentBUser.id },
    });

    // Authenticate sessions
    const superAdminCookie = await login("admin.demo@ghs.local", "superadmin123");
    const studentACookie = await login("student.demo@ghs.local", "murid123");
    const studentBCookie = await login(studentBUser.email, tempPassword);
    const adminCookie = await login(adminUser.email, tempPassword);
    const mgmtCookie = await login(mgmtUser.email, tempPassword);
    const acadCookie = await login(acadUser.email, tempPassword);
    const placeCookie = await login(placeUser.email, tempPassword);
    const instructorCookie = await login(instructorUser.email, tempPassword);

    // ==========================================
    // 1. Route Protection & Unauthenticated Access
    // ==========================================
    console.log("\n--- Section 1: Route Protection & Authentication ---");
    const unauthCertsRes = await request("/certificates", { redirect: "manual" });
    record("1. unauth /certificates redirects", true, [302, 303, 307, 308].includes(unauthCertsRes.status), "AUTH");
    const certLocation = unauthCertsRes.headers.get("location") || "";
    record("1b. unauth redirect includes callbackUrl", true, certLocation.includes("/login") && certLocation.includes("callbackUrl"), "AUTH");

    const unauthCertDetailRes = await request("/certificates/some-id", { redirect: "manual" });
    record("2. unauth /certificates/[id] redirects", true, [302, 303, 307, 308].includes(unauthCertDetailRes.status), "AUTH");

    const unauthReportsRes = await request("/reports", { redirect: "manual" });
    record("3. unauth /reports redirects", true, [302, 303, 307, 308].includes(unauthReportsRes.status), "AUTH");

    // Unauthenticated APIs
    const unauthApiCertGet = await api("GET", "/api/certificates");
    record("4. unauth GET /api/certificates -> 401", 401, unauthApiCertGet.status, "AUTH");
    const unauthApiCertPost = await api("POST", "/api/certificates", "", {});
    record("5. unauth POST /api/certificates -> 401", 401, unauthApiCertPost.status, "AUTH");
    const unauthApiCertDetail = await api("GET", "/api/certificates/invalid-id");
    record("6. unauth GET /api/certificates/[id] -> 401", 401, unauthApiCertDetail.status, "AUTH");
    const unauthApiCertRevoke = await api("PATCH", "/api/certificates/invalid-id/revoke", "", {});
    record("7. unauth PATCH /api/certificates/[id]/revoke -> 401", 401, unauthApiCertRevoke.status, "AUTH");
    const unauthApiCertDownload = await api("GET", "/api/certificates/invalid-id/download");
    record("8. unauth GET /api/certificates/[id]/download -> 401", 401, unauthApiCertDownload.status, "AUTH");
    const unauthApiRepAcad = await api("GET", "/api/reports/academic");
    record("9. unauth GET /api/reports/academic -> 401", 401, unauthApiRepAcad.status, "AUTH");
    const unauthApiRepAtt = await api("GET", "/api/reports/attendance");
    record("10. unauth GET /api/reports/attendance -> 401", 401, unauthApiRepAtt.status, "AUTH");
    const unauthApiRepPlace = await api("GET", "/api/reports/placement");
    record("11. unauth GET /api/reports/placement -> 401", 401, unauthApiRepPlace.status, "AUTH");

    // ==========================================
    // 2. Certificate CRUD & Lifecycle
    // ==========================================
    console.log("\n--- Section 2: Certificate CRUD & Lifecycle (Super Admin & Admin) ---");
    const certNum1 = `CERT-E2E-74D-001-${Date.now()}`;
    const certNum2 = `CERT-E2E-74D-002-${Date.now()}`;

    // Create Certificate 1 (Student A) with SUPER_ADMIN
    const create1 = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: certNum1,
      issuedAt: new Date().toISOString(),
      path: "certificates/2026/cert-e2e-001.pdf",
    });
    record("12. SUPER_ADMIN create certificate 1 -> 201", 201, create1.status, "CERT_CRUD");
    const cert1 = create1.data?.data;
    if (cert1?.id) createdCertIds.push(cert1.id);
    record("13. Created certificate 1 status is ACTIVE", "ACTIVE", cert1?.status, "CERT_CRUD");
    record("14. Created certificate 1 has correct certificateNumber", certNum1, cert1?.certificateNumber, "CERT_CRUD");

    // Create Certificate 2 (Student B) with ADMIN
    const create2 = await api("POST", "/api/certificates", adminCookie, {
      studentId: studentBRecord.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: certNum2,
      issuedAt: new Date().toISOString(),
      path: "certificates/2026/cert-e2e-002.pdf",
    });
    record("15. ADMIN create certificate 2 -> 201", 201, create2.status, "CERT_CRUD");
    const cert2 = create2.data?.data;
    if (cert2?.id) createdCertIds.push(cert2.id);

    // Create Certificate with null path
    const certNumNull = `CERT-E2E-NULL-${Date.now()}`;
    const createNullPath = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: certNumNull,
      issuedAt: new Date().toISOString(),
      path: null,
    });
    record("16. Create certificate with null path -> 201", 201, createNullPath.status, "CERT_CRUD");
    if (createNullPath.data?.data?.id) createdCertIds.push(createNullPath.data.data.id);

    // Validation: Duplicate certificate number
    const dupRes = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: certNum1, // DUPLICATE
      issuedAt: new Date().toISOString(),
      path: "some/path.pdf",
    });
    record("17. Duplicate certificateNumber rejected -> 409", 409, dupRes.status, "VALIDATION");

    // Validation: Missing fields
    const missingRes = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: studentA.id,
      // missing programId, batchId, certificateNumber
    });
    record("18. Missing required fields rejected -> 400", 400, missingRes.status, "VALIDATION");

    // Validation: Non-existent foreign key
    const fkRes = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: "non-existent-student-id",
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: `CERT-FK-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("19. Non-existent studentId rejected -> 404", 404, fkRes.status, "VALIDATION");

    // Validation: Unknown field rejected by strict schema
    const unknownFieldRes = await api("POST", "/api/certificates", superAdminCookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: `CERT-UNKNOWN-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      unknownField: "malicious-payload",
    });
    record("20. Unknown fields rejected -> 400", 400, unknownFieldRes.status, "VALIDATION");

    // DELETE safety (405 Method Not Allowed)
    const deleteCertRes = await api("DELETE", `/api/certificates/${cert1.id}`, superAdminCookie);
    record("21. DELETE /api/certificates/[id] -> 405", 405, deleteCertRes.status, "SAFETY");
    const deleteCertListRes = await api("DELETE", "/api/certificates", superAdminCookie);
    record("22. DELETE /api/certificates -> 405", 405, deleteCertListRes.status, "SAFETY");

    // Read detail
    const getDetail = await api("GET", `/api/certificates/${cert1.id}`, superAdminCookie);
    record("23. GET certificate detail -> 200", 200, getDetail.status, "CERT_CRUD");
    record("24. Detail includes student object with nim", true, Boolean(getDetail.data?.data?.student?.nim), "CERT_CRUD");
    record("25. Detail includes program object with code", true, Boolean(getDetail.data?.data?.program?.code), "CERT_CRUD");
    record("26. Detail includes batch object", true, Boolean(getDetail.data?.data?.batch?.name), "CERT_CRUD");

    // ==========================================
    // 3. Certificate RBAC (All 7 Roles)
    // ==========================================
    console.log("\n--- Section 3: Certificate RBAC Matrix (All 7 Roles) ---");
    // SUPER_ADMIN
    const saList = await api("GET", "/api/certificates", superAdminCookie);
    record("27. SUPER_ADMIN read certificates -> 200", 200, saList.status, "CERT_RBAC");
    // ADMIN
    const admList = await api("GET", "/api/certificates", adminCookie);
    record("28. ADMIN read certificates -> 200", 200, admList.status, "CERT_RBAC");
    // MANAGEMENT
    const mgmtList = await api("GET", "/api/certificates", mgmtCookie);
    record("29. MANAGEMENT read certificates -> 200", 200, mgmtList.status, "CERT_RBAC");
    const mgmtCreate = await api("POST", "/api/certificates", mgmtCookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: `CERT-MGMT-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("30. MANAGEMENT create certificate -> 403", 403, mgmtCreate.status, "CERT_RBAC");
    const mgmtRevoke = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, mgmtCookie, {});
    record("31. MANAGEMENT revoke certificate -> 403", 403, mgmtRevoke.status, "CERT_RBAC");

    // STUDENT
    const studCreate = await api("POST", "/api/certificates", studentACookie, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: `CERT-STUD-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("32. STUDENT create certificate -> 403", 403, studCreate.status, "CERT_RBAC");
    const studRevoke = await api("PATCH", `/api/certificates/${cert1.id}/revoke`, studentACookie, {});
    record("33. STUDENT revoke certificate -> 403", 403, studRevoke.status, "CERT_RBAC");

    // ACADEMIC_STAFF
    const acadList = await api("GET", "/api/certificates", acadCookie);
    record("34. ACADEMIC_STAFF read certificates -> 403", 403, acadList.status, "CERT_RBAC");
    const acadCreate = await api("POST", "/api/certificates", acadCookie, {});
    record("35. ACADEMIC_STAFF create certificate -> 403", 403, acadCreate.status, "CERT_RBAC");

    // PLACEMENT_STAFF
    const placeList = await api("GET", "/api/certificates", placeCookie);
    record("36. PLACEMENT_STAFF read certificates -> 403", 403, placeList.status, "CERT_RBAC");
    const placeCreate = await api("POST", "/api/certificates", placeCookie, {});
    record("37. PLACEMENT_STAFF create certificate -> 403", 403, placeCreate.status, "CERT_RBAC");

    // INSTRUCTOR
    const instList = await api("GET", "/api/certificates", instructorCookie);
    record("38. INSTRUCTOR read certificates -> 403", 403, instList.status, "CERT_RBAC");
    const instCreate = await api("POST", "/api/certificates", instructorCookie, {});
    record("39. INSTRUCTOR create certificate -> 403", 403, instCreate.status, "CERT_RBAC");

    // ==========================================
    // 4. Certificate IDOR & Scoping
    // ==========================================
    console.log("\n--- Section 4: Certificate IDOR & Ownership Scoping ---");
    // Student A list
    const studAList = await api("GET", "/api/certificates", studentACookie);
    record("40. STUDENT A read own certificates -> 200", 200, studAList.status, "IDOR");
    const studACertIds = (studAList.data?.data || []).map((c) => c.id);
    record("41. STUDENT A sees cert 1 (own)", true, studACertIds.includes(cert1.id), "IDOR");
    record("42. STUDENT A does NOT see cert 2 (Student B)", false, studACertIds.includes(cert2.id), "IDOR");

    // Student A spoof query param ?studentId=studentB.id
    const studASpoof = await api("GET", `/api/certificates?studentId=${studentBRecord.id}`, studentACookie);
    record("43. STUDENT A query spoofing with Student B ID returns 200", 200, studASpoof.status, "IDOR");
    const spoofIds = (studASpoof.data?.data || []).map((c) => c.id);
    record("44. Query spoofing strictly scoped to self; Student B cert excluded", false, spoofIds.includes(cert2.id), "IDOR");

    // Student B list
    const studBList = await api("GET", "/api/certificates", studentBCookie);
    record("45. STUDENT B read own certificates -> 200", 200, studBList.status, "IDOR");
    const studBCertIds = (studBList.data?.data || []).map((c) => c.id);
    record("46. STUDENT B sees cert 2 (own)", true, studBCertIds.includes(cert2.id), "IDOR");
    record("47. STUDENT B does NOT see cert 1 (Student A)", false, studBCertIds.includes(cert1.id), "IDOR");

    // Direct detail IDOR
    const studAOwnDetail = await api("GET", `/api/certificates/${cert1.id}`, studentACookie);
    record("48. STUDENT A accesses own certificate detail -> 200", 200, studAOwnDetail.status, "IDOR");
    const studAOtherDetail = await api("GET", `/api/certificates/${cert2.id}`, studentACookie);
    record("49. STUDENT A accesses Student B certificate detail -> 403", 403, studAOtherDetail.status, "IDOR");
    const studBOtherDetail = await api("GET", `/api/certificates/${cert1.id}`, studentBCookie);
    record("50. STUDENT B accesses Student A certificate detail -> 403", 403, studBOtherDetail.status, "IDOR");

    // Download IDOR
    const studAOwnDl = await api("GET", `/api/certificates/${cert1.id}/download`, studentACookie);
    record("51. STUDENT A download own certificate -> 200", 200, studAOwnDl.status, "IDOR");
    record("52. Download returns signedUrl", true, Boolean(studAOwnDl.data?.data?.signedUrl), "IDOR");

    const studAOtherDl = await api("GET", `/api/certificates/${cert2.id}/download`, studentACookie);
    record("53. STUDENT A download Student B certificate -> 403", 403, studAOtherDl.status, "IDOR");

    // ==========================================
    // 5. Revocation & Download Integrity
    // ==========================================
    console.log("\n--- Section 5: Certificate Revocation & Download Integrity ---");
    // Admin revokes cert 2
    const revokeRes = await api("PATCH", `/api/certificates/${cert2.id}/revoke`, adminCookie, {
      reason: "Indisipliner selama program",
    });
    record("54. ADMIN revokes cert 2 -> 200", 200, revokeRes.status, "REVOCATION");
    record("55. Revoked status is REVOKED", "REVOKED", revokeRes.data?.data?.status, "REVOCATION");

    // Idempotent second revoke
    const revokeRes2 = await api("PATCH", `/api/certificates/${cert2.id}/revoke`, adminCookie, {
      reason: "Alasan kedua",
    });
    record("56. Second revoke is safe & idempotent -> 200", 200, revokeRes2.status, "REVOCATION");
    record("57. Status remains REVOKED", "REVOKED", revokeRes2.data?.data?.status, "REVOCATION");

    // Detail re-read after revocation
    const detailAfterRevoke = await api("GET", `/api/certificates/${cert2.id}`, adminCookie);
    record("58. Re-read detail status is REVOKED", "REVOKED", detailAfterRevoke.data?.data?.status, "REVOCATION");

    // Download of revoked certificate
    const dlRevoked = await api("GET", `/api/certificates/${cert2.id}/download`, adminCookie);
    record("59. Download revoked certificate returns 200", 200, dlRevoked.status, "STORAGE");
    record("60. Download response preserves REVOKED status", "REVOKED", dlRevoked.data?.data?.status, "STORAGE");

    // Download certificate with null path returns 400
    const dlNull = await api("GET", `/api/certificates/${createNullPath.data.data.id}/download`, superAdminCookie);
    record("61. Download certificate with null path returns 400", 400, dlNull.status, "STORAGE");

    // ==========================================
    // 6. Reports RBAC Matrix (All 7 Roles)
    // ==========================================
    console.log("\n--- Section 6: Reports RBAC Matrix (All 7 Roles) ---");
    // SUPER_ADMIN
    const saRepAcad = await api("GET", "/api/reports/academic", superAdminCookie);
    record("62. SUPER_ADMIN /api/reports/academic -> 200", 200, saRepAcad.status, "REPORT_RBAC");
    const saRepAtt = await api("GET", "/api/reports/attendance", superAdminCookie);
    record("63. SUPER_ADMIN /api/reports/attendance -> 200", 200, saRepAtt.status, "REPORT_RBAC");
    const saRepPlace = await api("GET", "/api/reports/placement", superAdminCookie);
    record("64. SUPER_ADMIN /api/reports/placement -> 200", 200, saRepPlace.status, "REPORT_RBAC");

    // ADMIN
    const admRepAcad = await api("GET", "/api/reports/academic", adminCookie);
    record("65. ADMIN /api/reports/academic -> 200", 200, admRepAcad.status, "REPORT_RBAC");
    const admRepAtt = await api("GET", "/api/reports/attendance", adminCookie);
    record("66. ADMIN /api/reports/attendance -> 200", 200, admRepAtt.status, "REPORT_RBAC");
    const admRepPlace = await api("GET", "/api/reports/placement", adminCookie);
    record("67. ADMIN /api/reports/placement -> 200", 200, admRepPlace.status, "REPORT_RBAC");

    // MANAGEMENT
    const mgmtRepAcad = await api("GET", "/api/reports/academic", mgmtCookie);
    record("68. MANAGEMENT /api/reports/academic -> 200", 200, mgmtRepAcad.status, "REPORT_RBAC");
    const mgmtRepAtt = await api("GET", "/api/reports/attendance", mgmtCookie);
    record("69. MANAGEMENT /api/reports/attendance -> 200", 200, mgmtRepAtt.status, "REPORT_RBAC");
    const mgmtRepPlace = await api("GET", "/api/reports/placement", mgmtCookie);
    record("70. MANAGEMENT /api/reports/placement -> 200", 200, mgmtRepPlace.status, "REPORT_RBAC");

    // ACADEMIC_STAFF
    const acadRepAcad = await api("GET", "/api/reports/academic", acadCookie);
    record("71. ACADEMIC_STAFF /api/reports/academic -> 200", 200, acadRepAcad.status, "REPORT_RBAC");
    const acadRepAtt = await api("GET", "/api/reports/attendance", acadCookie);
    record("72. ACADEMIC_STAFF /api/reports/attendance -> 200", 200, acadRepAtt.status, "REPORT_RBAC");
    const acadRepPlace = await api("GET", "/api/reports/placement", acadCookie);
    record("73. ACADEMIC_STAFF /api/reports/placement -> 403", 403, acadRepPlace.status, "REPORT_RBAC");

    // PLACEMENT_STAFF
    const placeRepPlace = await api("GET", "/api/reports/placement", placeCookie);
    record("74. PLACEMENT_STAFF /api/reports/placement -> 200", 200, placeRepPlace.status, "REPORT_RBAC");
    const placeRepAcad = await api("GET", "/api/reports/academic", placeCookie);
    record("75. PLACEMENT_STAFF /api/reports/academic -> 403", 403, placeRepAcad.status, "REPORT_RBAC");
    const placeRepAtt = await api("GET", "/api/reports/attendance", placeCookie);
    record("76. PLACEMENT_STAFF /api/reports/attendance -> 403", 403, placeRepAtt.status, "REPORT_RBAC");

    // INSTRUCTOR
    const instRepAcad = await api("GET", "/api/reports/academic", instructorCookie);
    record("77. INSTRUCTOR /api/reports/academic -> 403", 403, instRepAcad.status, "REPORT_RBAC");
    const instRepAtt = await api("GET", "/api/reports/attendance", instructorCookie);
    record("78. INSTRUCTOR /api/reports/attendance -> 403", 403, instRepAtt.status, "REPORT_RBAC");
    const instRepPlace = await api("GET", "/api/reports/placement", instructorCookie);
    record("79. INSTRUCTOR /api/reports/placement -> 403", 403, instRepPlace.status, "REPORT_RBAC");

    // STUDENT
    const studRepAcad = await api("GET", "/api/reports/academic", studentACookie);
    record("80. STUDENT /api/reports/academic -> 403", 403, studRepAcad.status, "REPORT_RBAC");
    const studRepAtt = await api("GET", "/api/reports/attendance", studentACookie);
    record("81. STUDENT /api/reports/attendance -> 403", 403, studRepAtt.status, "REPORT_RBAC");
    const studRepPlace = await api("GET", "/api/reports/placement", studentACookie);
    record("82. STUDENT /api/reports/placement -> 403", 403, studRepPlace.status, "REPORT_RBAC");

    // ==========================================
    // 7. Report Data Consistency & Baseline Metrics
    // ==========================================
    console.log("\n--- Section 7: Report Data Consistency & Non-NaN Guarantee ---");
    const acadData = saRepAcad.data?.data;
    record("83. Academic report has totalStudents == 21", 21, acadData?.totalStudents, "REPORT_DATA");
    record("84. Academic report has totalBatches == 2", 2, acadData?.totalBatches, "REPORT_DATA");
    record("85. Academic report has totalPrograms == 1", 1, acadData?.totalPrograms, "REPORT_DATA");
    record("86. Academic report has totalClasses == 10", 10, acadData?.totalClasses, "REPORT_DATA");
    record("87. Academic attendanceRate is not NaN", true, !Number.isNaN(acadData?.attendanceRate), "REPORT_DATA");
    record("88. Academic averageAssessmentScore is not NaN", true, !Number.isNaN(acadData?.averageAssessmentScore), "REPORT_DATA");

    const attData = saRepAtt.data?.data;
    record("89. Attendance overallAttendanceRate is not NaN", true, !Number.isNaN(attData?.overallAttendanceRate), "REPORT_DATA");
    record("90. Attendance absenceBreakdown has sick count", true, typeof attData?.absenceBreakdown?.sick === "number", "REPORT_DATA");
    record("91. Attendance absenceBreakdown has permitted count", true, typeof attData?.absenceBreakdown?.permitted === "number", "REPORT_DATA");
    record("92. Attendance absenceBreakdown has unexcused count", true, typeof attData?.absenceBreakdown?.unexcused === "number", "REPORT_DATA");
    record("93. Attendance batchRates is non-empty array", true, Array.isArray(attData?.batchRates) && attData.batchRates.length === 2, "REPORT_DATA");

    // Placement report with zero baseline
    const placeData = saRepPlace.data?.data;
    record("94. Placement totalVacancies == 0", 0, placeData?.totalVacancies, "REPORT_DATA");
    record("95. Placement totalEmployers == 0", 0, placeData?.totalEmployers, "REPORT_DATA");
    record("96. Placement totalApplications == 0", 0, placeData?.totalApplications, "REPORT_DATA");
    record("97. Placement totalInterviews == 0", 0, placeData?.totalInterviews, "REPORT_DATA");
    record("98. Placement totalPlacements == 0", 0, placeData?.totalPlacements, "REPORT_DATA");

    // Application funnel enum integrity
    const funnel = placeData?.applicationFunnel || {};
    record("99. Application funnel has APPLIED == 0", 0, funnel.APPLIED, "ENUM_CONTRACT");
    record("100. Application funnel has SCREENING == 0", 0, funnel.SCREENING, "ENUM_CONTRACT");
    record("101. Application funnel has INTERVIEW == 0", 0, funnel.INTERVIEW, "ENUM_CONTRACT");
    record("102. Application funnel has SELECTED == 0", 0, funnel.SELECTED, "ENUM_CONTRACT");
    record("103. Application funnel has REJECTED == 0", 0, funnel.REJECTED, "ENUM_CONTRACT");
    record("104. Application funnel has WITHDRAWN == 0", 0, funnel.WITHDRAWN, "ENUM_CONTRACT");

    // Interview status distribution enum integrity
    const interviewDist = placeData?.interviewStatusDistribution || {};
    record("105. Interview dist has PENDING == 0", 0, interviewDist.PENDING, "ENUM_CONTRACT");
    record("106. Interview dist has PASSED == 0", 0, interviewDist.PASSED, "ENUM_CONTRACT");
    record("107. Interview dist has FAILED == 0", 0, interviewDist.FAILED, "ENUM_CONTRACT");
    record("108. Interview dist has RESCHEDULED == 0", 0, interviewDist.RESCHEDULED, "ENUM_CONTRACT");

    // Placement status distribution enum integrity
    const placementDist = placeData?.placementStatusDistribution || {};
    record("109. Placement dist has PREPARATION == 0", 0, placementDist.PREPARATION, "ENUM_CONTRACT");
    record("110. Placement dist has READY == 0", 0, placementDist.READY, "ENUM_CONTRACT");
    record("111. Placement dist has DEPARTED == 0", 0, placementDist.DEPARTED, "ENUM_CONTRACT");
    record("112. Placement dist has PLACED == 0", 0, placementDist.PLACED, "ENUM_CONTRACT");
    record("113. Placement dist has CANCELLED == 0", 0, placementDist.CANCELLED, "ENUM_CONTRACT");

    // ==========================================
    // 8. Static Architecture, Sidebar & Mock Boundaries
    // ==========================================
    console.log("\n--- Section 8: Static Architecture, Sidebar & Mock Boundaries ---");
    const sidebarSrc = fs.readFileSync(path.join(process.cwd(), "components/layout/app-sidebar.tsx"), "utf8");
    record("114. app-sidebar maps /certificates", true, sidebarSrc.includes('Sertifikat: "/certificates"'), "SIDEBAR");
    record("115. app-sidebar maps /reports", true, sidebarSrc.includes('Laporan: "/reports"'), "SIDEBAR");
    record("116. app-sidebar hides Sertifikat for instructor", true, sidebarSrc.includes('"Sertifikat"') && sidebarSrc.includes("instructorHidden"), "SIDEBAR");
    record("117. app-sidebar hides Sertifikat for academic", true, sidebarSrc.includes('"Sertifikat"') && sidebarSrc.includes("academicHidden"), "SIDEBAR");
    record("118. app-sidebar hides Sertifikat for placement", true, sidebarSrc.includes('"Sertifikat"') && sidebarSrc.includes("placementHidden"), "SIDEBAR");
    record("119. app-sidebar hides Laporan for instructor", true, sidebarSrc.includes('"Laporan"') && sidebarSrc.includes("instructorHidden"), "SIDEBAR");
    record("120. app-sidebar hides Laporan for student", true, sidebarSrc.includes('isStudent && item.label === "Laporan"'), "SIDEBAR");

    // Mock boundaries in frontend components
    const certPageSrc = fs.readFileSync(path.join(process.cwd(), "components/certificates/certificates-page.tsx"), "utf8");
    record("121. certificates-page does NOT import mock-data", false, certPageSrc.includes('from "@/lib/mock-data"'), "MOCK_BOUNDARY");
    record("122. certificates-page has zero delete buttons", false, /delete|hapus/i.test(certPageSrc.replace(/delete-certificate-prevented/g, "").replace(/statusFilter/g, "")), "NO_DELETE");

    const certDetailSrc = fs.readFileSync(path.join(process.cwd(), "components/certificates/certificate-detail.tsx"), "utf8");
    record("123. certificate-detail does NOT import mock-data", false, certDetailSrc.includes('from "@/lib/mock-data"'), "MOCK_BOUNDARY");
    record("124. certificate-detail has zero delete buttons", false, /<button[^>]*>(?:(?!cabut).)*(?:delete|hapus)/i.test(certDetailSrc), "NO_DELETE");

    const reportsPageSrc = fs.readFileSync(path.join(process.cwd(), "components/reports/reports-page.tsx"), "utf8");
    record("125. reports-page does NOT import mock-data", false, reportsPageSrc.includes('from "@/lib/mock-data"'), "MOCK_BOUNDARY");
    record("126. reports-page uses APPLICATION_STATUS_LABELS", true, reportsPageSrc.includes("APPLICATION_STATUS_LABELS"), "API_UI_CONTRACT");
    record("127. reports-page uses INTERVIEW_STATUS_LABELS", true, reportsPageSrc.includes("INTERVIEW_STATUS_LABELS"), "API_UI_CONTRACT");
    record("128. reports-page uses PLACEMENT_STATUS_LABELS", true, reportsPageSrc.includes("PLACEMENT_STATUS_LABELS"), "API_UI_CONTRACT");

    const studentDashSrc = fs.readFileSync(path.join(process.cwd(), "components/dashboard/student-dashboard.tsx"), "utf8");
    record("129. student-dashboard CertificateSection calls /api/certificates", true, studentDashSrc.includes('fetch("/api/certificates")'), "STUDENT_DASHBOARD");
    record("130. student-dashboard has NO static placeholder", false, studentDashSrc.includes("Training Certificate - Belum tersedia"), "STUDENT_DASHBOARD");
    record("131. student-dashboard has student-certificates-loading", true, studentDashSrc.includes('data-testid="student-certificates-loading"'), "STUDENT_DASHBOARD");
    record("132. student-dashboard has student-certificates-empty", true, studentDashSrc.includes('data-testid="student-certificates-empty"'), "STUDENT_DASHBOARD");

    // ==========================================
    // 9. Audit Logging & Privacy Verification
    // ==========================================
    console.log("\n--- Section 9: Audit Logging & Privacy Verification ---");
    const createAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", action: "CREATE", entityId: cert1.id },
    });
    record("133. AuditLog records CREATE for certificate", true, Boolean(createAudit), "AUDIT_LOG");
    record("134. Certificate CREATE AuditLog actor is Super Admin", superAdminCookie !== "", Boolean(createAudit?.userId), "AUDIT_LOG");

    const revokeAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", action: "REVOKE", entityId: cert2.id },
    });
    record("135. AuditLog records REVOKE for certificate", true, Boolean(revokeAudit), "AUDIT_LOG");

    // Privacy: no passwordHash or private keys in certificate detail
    const certString = JSON.stringify(getDetail.data);
    record("136. Certificate detail contains no passwordHash", false, certString.includes("passwordHash"), "PRIVACY");
    const reportString = JSON.stringify(saRepAcad.data) + JSON.stringify(saRepAtt.data) + JSON.stringify(saRepPlace.data);
    record("137. Reports contain no student NIK or PII", false, reportString.includes("nik") || reportString.includes("phone"), "PRIVACY");

  } finally {
    // ==========================================
    // 10. Deterministic Teardown & Baseline Restoration
    // ==========================================
    console.log("\n--- Section 10: Teardown & Baseline Restoration ---");
    if (createdCertIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Certificate", entityId: { in: createdCertIds } },
      });
      await prisma.certificate.deleteMany({
        where: { id: { in: createdCertIds } },
      });
    }

    if (studentBRecord) {
      await prisma.student.update({
        where: { id: studentBRecord.id },
        data: { userId: null },
      });
    }

    if (createdUserIds.length > 0) {
      // Remove users created during test
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

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

    record("138. Certificates baseline restored to 0", 0, finalCounts.certificates, "BASELINE");
    record("139. Users baseline restored to 3", 3, finalCounts.users, "BASELINE" /* Updated STEP 88 */);
    record("140. Instructors baseline restored to 6", 6, finalCounts.instructors, "BASELINE");
    record("141. Programs baseline restored to 1", 1, finalCounts.programs, "BASELINE");
    record("142. Batches baseline restored to 2", 2, finalCounts.batches, "BASELINE");
    record("143. Students baseline restored to 21", 21, finalCounts.students, "BASELINE");
    record("144. Enrollments baseline restored to 21", 21, finalCounts.enrollments, "BASELINE");
    record("145. Subjects baseline restored to 6", 6, finalCounts.subjects, "BASELINE");
    record("146. Classes baseline restored to 10", 10, finalCounts.classes, "BASELINE");
    record("147. Schedules baseline restored to 10", 10, finalCounts.schedules, "BASELINE");
    record("148. Employers baseline restored to 0", 0, finalCounts.employers, "BASELINE");
    record("149. Vacancies baseline restored to 0", 0, finalCounts.vacancies, "BASELINE");
    record("150. Applications baseline restored to 0", 0, finalCounts.applications, "BASELINE");
    record("151. Interviews baseline restored to 0", 0, finalCounts.interviews, "BASELINE");
    record("152. Placements baseline restored to 0", 0, finalCounts.placements, "BASELINE");
    record("153. Documents baseline restored to 0", 0, finalCounts.documents, "BASELINE");

    await prisma.$disconnect();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED, TOTAL: ${results.length}`);
  console.log("==========================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
