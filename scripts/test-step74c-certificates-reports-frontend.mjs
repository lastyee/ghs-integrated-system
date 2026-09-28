// scripts/test-step74c-certificates-reports-frontend.mjs
// Step 74C: Certificates & Reports Frontend Integration Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP74C_CERTIFICATES_REPORTS_FRONTEND_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP74C_CERTIFICATES_REPORTS_FRONTEND_CONFIRM_DATABASE",
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
  const response = await request(apiPath, {
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
  console.log("=== STEP 74C CERTIFICATES & REPORTS FRONTEND INTEGRATION TEST ===\n");

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

    // Fetch master records
    const baselineProgram = await prisma.program.findFirst({ orderBy: { id: "asc" } });
    const baselineBatch = await prisma.batch.findFirst({ orderBy: { id: "asc" } });

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

    // Setup temporary users for role matrix testing
    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const adminUser = await prisma.user.create({
      data: {
        email: "test.admin.74c@ghs.local",
        name: "Test Admin 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ADMIN"),
      },
    });
    createdUserIds.push(adminUser.id);

    const managementUser = await prisma.user.create({
      data: {
        email: "test.mgmt.74c@ghs.local",
        name: "Test Management 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("MANAGEMENT"),
      },
    });
    createdUserIds.push(managementUser.id);

    const academicStaffUser = await prisma.user.create({
      data: {
        email: "test.academic.74c@ghs.local",
        name: "Test Academic Staff 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ACADEMIC_STAFF"),
      },
    });
    createdUserIds.push(academicStaffUser.id);

    const instructorUser = await prisma.user.create({
      data: {
        email: "test.instructor.74c@ghs.local",
        name: "Test Instructor 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("INSTRUCTOR"),
      },
    });
    createdUserIds.push(instructorUser.id);

    const placementStaffUser = await prisma.user.create({
      data: {
        email: "test.placement.74c@ghs.local",
        name: "Test Placement Staff 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("PLACEMENT_STAFF"),
      },
    });
    createdUserIds.push(placementStaffUser.id);

    const studentBUser = await prisma.user.create({
      data: {
        email: "test.studentB.74c@ghs.local",
        name: "Test Student B 74C",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("STUDENT"),
      },
    });
    createdUserIds.push(studentBUser.id);

    // Link studentB
    await prisma.student.update({
      where: { id: studentBRecord.id },
      data: { userId: studentBUser.id },
    });

    // Authenticate sessions
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
    // 1. ROUTE PROTECTION & PROXY
    // ==========================================
    console.log("\n--- Section 1: Route Protection & Proxy ---");

    // Unauthenticated GET /certificates -> redirect to /login
    const unauthCertsRes = await request("/certificates", { redirect: "manual" });
    record("1. unauthenticated /certificates redirects to login", true, unauthCertsRes.status === 307 || unauthCertsRes.status === 302, "ROUTING");
    record("1b. redirect includes callbackUrl", true, unauthCertsRes.headers.get("location")?.includes("/login"), "ROUTING");

    // Unauthenticated GET /certificates/[id] -> redirect to /login
    const unauthCertDetailRes = await request("/certificates/test-id", { redirect: "manual" });
    record("2. unauthenticated /certificates/[id] redirects to login", true, unauthCertDetailRes.status === 307 || unauthCertDetailRes.status === 302, "ROUTING");

    // Unauthenticated GET /reports -> redirect to /login
    const unauthReportsRes = await request("/reports", { redirect: "manual" });
    record("3. unauthenticated /reports redirects to login", true, unauthReportsRes.status === 307 || unauthReportsRes.status === 302, "ROUTING");

    // Authenticated access to routes returns 200
    const saCertsPage = await request("/certificates", { headers: { Cookie: superAdminCookies } });
    record("4. SUPER_ADMIN /certificates returns 200", 200, saCertsPage.status, "ROUTING");

    const studentCertsPage = await request("/certificates", { headers: { Cookie: studentACookies } });
    record("5. STUDENT /certificates returns 200", 200, studentCertsPage.status, "ROUTING");

    const saReportsPage = await request("/reports", { headers: { Cookie: superAdminCookies } });
    record("6. SUPER_ADMIN /reports returns 200", 200, saReportsPage.status, "ROUTING");

    const mgmtReportsPage = await request("/reports", { headers: { Cookie: managementCookies } });
    record("7. MANAGEMENT /reports returns 200", 200, mgmtReportsPage.status, "ROUTING");

    const acadReportsPage = await request("/reports", { headers: { Cookie: academicStaffCookies } });
    record("8. ACADEMIC_STAFF /reports returns 200", 200, acadReportsPage.status, "ROUTING");

    const placReportsPage = await request("/reports", { headers: { Cookie: placementStaffCookies } });
    record("9. PLACEMENT_STAFF /reports returns 200", 200, placReportsPage.status, "ROUTING");

    // ==========================================
    // 2. STATIC ARCHITECTURE & CODE CONTRACTS
    // ==========================================
    console.log("\n--- Section 2: Static Architecture & Code Contracts ---");

    const sidebarPath = path.join(process.cwd(), "components/layout/app-sidebar.tsx");
    const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");

    record("10. app-sidebar maps /certificates", true, sidebarContent.includes('Sertifikat: "/certificates"'), "SIDEBAR");
    record("11. app-sidebar maps /reports", true, sidebarContent.includes('Laporan: "/reports"'), "SIDEBAR");
    record("12. app-sidebar hides Sertifikat for instructor", true, sidebarContent.includes('"Sertifikat"') && sidebarContent.includes("instructorHidden"), "SIDEBAR");
    record("13. app-sidebar hides Sertifikat for academic", true, sidebarContent.includes('"Sertifikat"') && sidebarContent.includes("academicHidden"), "SIDEBAR");
    record("14. app-sidebar hides Sertifikat for placement", true, sidebarContent.includes('"Sertifikat"') && sidebarContent.includes("placementHidden"), "SIDEBAR");
    record("15. app-sidebar hides Laporan for instructor", true, sidebarContent.includes('"Laporan"') && sidebarContent.includes("instructorHidden"), "SIDEBAR");
    record("16. app-sidebar hides Laporan for student", true, sidebarContent.includes("isStudent && item.label === \"Laporan\""), "SIDEBAR");

    const certPagePath = path.join(process.cwd(), "components/certificates/certificates-page.tsx");
    const certPageContent = fs.readFileSync(certPagePath, "utf-8");
    record("17. certificates-page has loading-state testid", true, certPageContent.includes('data-testid="loading-state"'), "UI_CONTRACT");
    record("18. certificates-page has empty-state testid", true, certPageContent.includes('data-testid="empty-state"'), "UI_CONTRACT");
    record("19. certificates-page has error-state testid", true, certPageContent.includes('data-testid="error-state"'), "UI_CONTRACT");
    record("20. certificates-page has unauthorized-state testid", true, certPageContent.includes('data-testid="unauthorized-state"'), "UI_CONTRACT");
    record("21. certificates-page has create-certificate-button testid", true, certPageContent.includes('data-testid="create-certificate-button"'), "UI_CONTRACT");
    record("22. certificates-page has ZERO delete buttons", false, certPageContent.includes("Hapus") || certPageContent.includes("DELETE") || certPageContent.includes("trash"), "NO_DELETE");

    const certDetailPath = path.join(process.cwd(), "components/certificates/certificate-detail.tsx");
    const certDetailContent = fs.readFileSync(certDetailPath, "utf-8");
    record("23. certificate-detail has loading-state testid", true, certDetailContent.includes('data-testid="loading-state"'), "UI_CONTRACT");
    record("24. certificate-detail has not-found-state testid", true, certDetailContent.includes('data-testid="not-found-state"'), "UI_CONTRACT");
    record("25. certificate-detail has unauthorized-state testid", true, certDetailContent.includes('data-testid="unauthorized-state"'), "UI_CONTRACT");
    record("26. certificate-detail has error-state testid", true, certDetailContent.includes('data-testid="error-state"'), "UI_CONTRACT");
    record("27. certificate-detail has download-certificate-button testid", true, certDetailContent.includes('data-testid="download-certificate-button"'), "UI_CONTRACT");
    record("28. certificate-detail has revoke-button testid", true, certDetailContent.includes('data-testid="revoke-button"'), "UI_CONTRACT");
    record("29. certificate-detail has confirm-revoke-button testid", true, certDetailContent.includes('data-testid="confirm-revoke-button"'), "UI_CONTRACT");
    record("30. certificate-detail has ZERO delete buttons", false, certDetailContent.includes("Hapus") || certDetailContent.includes("delete-button") || certDetailContent.includes("trash"), "NO_DELETE");

    const reportsPagePath = path.join(process.cwd(), "components/reports/reports-page.tsx");
    const reportsPageContent = fs.readFileSync(reportsPagePath, "utf-8");
    record("31. reports-page has tab-academic testid", true, reportsPageContent.includes('data-testid="tab-academic"'), "UI_CONTRACT");
    record("32. reports-page has tab-attendance testid", true, reportsPageContent.includes('data-testid="tab-attendance"'), "UI_CONTRACT");
    record("33. reports-page has tab-placement testid", true, reportsPageContent.includes('data-testid="tab-placement"'), "UI_CONTRACT");
    record("34. reports-page has academic-report-section testid", true, reportsPageContent.includes('data-testid="academic-report-section"'), "UI_CONTRACT");
    record("35. reports-page has attendance-report-section testid", true, reportsPageContent.includes('data-testid="attendance-report-section"'), "UI_CONTRACT");
    record("36. reports-page has placement-report-section testid", true, reportsPageContent.includes('data-testid="placement-report-section"'), "UI_CONTRACT");
    record("37. reports-page has unauthorized-state testid", true, reportsPageContent.includes('data-testid="unauthorized-state"'), "UI_CONTRACT");

    // ==========================================
    // 3. MOCK DATA AUDIT
    // ==========================================
    console.log("\n--- Section 3: Mock Data Audit ---");
    record("38. certificates-page does NOT import mock-data", false, certPageContent.includes('from "@/lib/mock-data"'), "MOCK_AUDIT");
    record("39. certificate-detail does NOT import mock-data", false, certDetailContent.includes('from "@/lib/mock-data"'), "MOCK_AUDIT");
    record("40. reports-page does NOT import mock-data", false, reportsPageContent.includes('from "@/lib/mock-data"'), "MOCK_AUDIT");

    const studentDashPath = path.join(process.cwd(), "components/dashboard/student-dashboard.tsx");
    const studentDashContent = fs.readFileSync(studentDashPath, "utf-8");
    record("41. student-dashboard CertificateSection uses real /api/certificates", true, studentDashContent.includes('fetch("/api/certificates")'), "MOCK_AUDIT");
    record("42. student-dashboard has NO static 'Training Certificate - Belum tersedia'", false, studentDashContent.includes("Training Certificate") && studentDashContent.includes("Belum tersedia"), "MOCK_AUDIT");
    record("43. student-dashboard has student-certificates-loading testid", true, studentDashContent.includes('data-testid="student-certificates-loading"'), "MOCK_AUDIT");
    record("44. student-dashboard has student-certificates-empty testid", true, studentDashContent.includes('data-testid="student-certificates-empty"'), "MOCK_AUDIT");

    // ==========================================
    // 4. LIVE CERTIFICATE INTEGRATION & RBAC
    // ==========================================
    console.log("\n--- Section 4: Live Certificate Integration & RBAC ---");

    // Create Certificate 1 (for student A)
    const cert1Res = await api("POST", "/api/certificates", superAdminCookies, {
      studentId: studentA.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-FRONT-001",
      issuedAt: "2026-09-20T10:00:00.000Z",
      path: "certificates/2026/GHS-FRONT-001.pdf",
    });
    record("45. POST certificate 1 for Student A succeeds (201)", 201, cert1Res.status, "CERT_API");
    const cert1 = cert1Res.payload?.data;
    if (cert1?.id) createdCertIds.push(cert1.id);

    // Create Certificate 2 (for student B)
    const cert2Res = await api("POST", "/api/certificates", adminCookies, {
      studentId: studentBRecord.id,
      programId: baselineProgram.id,
      batchId: baselineBatch.id,
      certificateNumber: "GHS-FRONT-002",
      issuedAt: "2026-09-21T10:00:00.000Z",
      path: "certificates/2026/GHS-FRONT-002.pdf",
    });
    record("46. POST certificate 2 for Student B succeeds (201)", 201, cert2Res.status, "CERT_API");
    const cert2 = cert2Res.payload?.data;
    if (cert2?.id) createdCertIds.push(cert2.id);

    // Super Admin list sees both
    const saListRes = await api("GET", "/api/certificates", superAdminCookies);
    record("47. SUPER_ADMIN gets certificates list (200)", 200, saListRes.status, "CERT_API");
    const saCerts = saListRes.payload?.data || [];
    record("48. SUPER_ADMIN list has at least 2 certificates", true, saCerts.length >= 2, "CERT_API");

    // Management list sees both
    const mgmtListRes = await api("GET", "/api/certificates", managementCookies);
    record("49. MANAGEMENT gets certificates list (200)", 200, mgmtListRes.status, "CERT_API");

    // Student A list sees ONLY certificate 1
    const studentAListRes = await api("GET", "/api/certificates", studentACookies);
    record("50. STUDENT A gets certificates list (200)", 200, studentAListRes.status, "CERT_API");
    const studentACerts = studentAListRes.payload?.data || [];
    const allCert1 = studentACerts.every((c) => c.studentId === studentA.id);
    record("51. STUDENT A list contains only own certificate", true, allCert1 && studentACerts.some((c) => c.id === cert1.id), "IDOR");

    // Student B list sees ONLY certificate 2
    const studentBListRes = await api("GET", "/api/certificates", studentBCookies);
    const studentBCerts = studentBListRes.payload?.data || [];
    const allCert2 = studentBCerts.every((c) => c.studentId === studentBRecord.id);
    record("52. STUDENT B list contains only own certificate", true, allCert2 && studentBCerts.some((c) => c.id === cert2.id), "IDOR");

    // Detail Route: GET /certificates/[cert1.id]
    const cert1DetailRes = await api("GET", `/api/certificates/${cert1.id}`, superAdminCookies);
    record("53. GET certificate detail succeeds (200)", 200, cert1DetailRes.status, "CERT_API");
    record("54. Detail contains student, program, batch objects", true, Boolean(cert1DetailRes.payload?.data?.student && cert1DetailRes.payload?.data?.program && cert1DetailRes.payload?.data?.batch), "CERT_API");

    // Student A can access own detail
    const studentAOwnDetail = await api("GET", `/api/certificates/${cert1.id}`, studentACookies);
    record("55. STUDENT A accesses own certificate detail (200)", 200, studentAOwnDetail.status, "IDOR");

    // Student A cannot access Student B certificate detail
    const studentAForeignDetail = await api("GET", `/api/certificates/${cert2.id}`, studentACookies);
    record("56. STUDENT A rejected from Student B certificate detail (403)", 403, studentAForeignDetail.status, "IDOR");

    // Download action
    const downloadRes = await api("GET", `/api/certificates/${cert1.id}/download`, studentACookies);
    record("57. Download own certificate succeeds (200)", 200, downloadRes.status, "STORAGE");
    record("58. Download returns signedUrl with token", true, Boolean(downloadRes.payload?.data?.signedUrl?.includes("token=")), "STORAGE");

    // Student A cannot download Student B certificate
    const foreignDownloadRes = await api("GET", `/api/certificates/${cert2.id}/download`, studentACookies);
    record("59. Student A cannot download Student B certificate (403)", 403, foreignDownloadRes.status, "IDOR");

    // Revoke Certificate 2 by Admin
    const revokeRes = await api("PATCH", `/api/certificates/${cert2.id}/revoke`, adminCookies, {
      reason: "Frontend revocation test",
    });
    record("60. ADMIN revokes certificate 2 (200)", 200, revokeRes.status, "LIFECYCLE");
    record("61. Revoked certificate status is REVOKED", "REVOKED", revokeRes.payload?.data?.status, "LIFECYCLE");

    // Download revoked certificate returns 200 with status REVOKED preserved
    const revokedDownloadRes = await api("GET", `/api/certificates/${cert2.id}/download`, superAdminCookies);
    record("62. Download revoked certificate preserves REVOKED status", "REVOKED", revokedDownloadRes.payload?.data?.status, "STORAGE");

    // Academic Staff rejected from /api/certificates
    const acadCertRes = await api("GET", "/api/certificates", academicStaffCookies);
    record("63. ACADEMIC_STAFF forbidden from /api/certificates (403)", 403, acadCertRes.status, "RBAC");

    // Instructor rejected from /api/certificates
    const instCertRes = await api("GET", "/api/certificates", instructorCookies);
    record("64. INSTRUCTOR forbidden from /api/certificates (403)", 403, instCertRes.status, "RBAC");

    // Placement Staff rejected from /api/certificates
    const placCertRes = await api("GET", "/api/certificates", placementStaffCookies);
    record("65. PLACEMENT_STAFF forbidden from /api/certificates (403)", 403, placCertRes.status, "RBAC");

    // ==========================================
    // 5. LIVE REPORTS INTEGRATION & ROLE ACCESS
    // ==========================================
    console.log("\n--- Section 5: Live Reports Integration & Role Access ---");

    // Academic Report (live data)
    const acadReportRes = await api("GET", "/api/reports/academic", superAdminCookies);
    record("66. SUPER_ADMIN GET /api/reports/academic -> 200", 200, acadReportRes.status, "REPORTS");
    const acadData = acadReportRes.payload?.data;
    record("67. Academic report contains totalStudents == 21", initialCounts.students, acadData?.totalStudents, "REPORTS");
    record("68. Academic report contains totalBatches == 2", initialCounts.batches, acadData?.totalBatches, "REPORTS");
    record("69. Academic report contains attendanceRate", true, typeof acadData?.attendanceRate === "number", "REPORTS");
    record("70. Academic report contains averageAssessmentScore", true, typeof acadData?.averageAssessmentScore === "number", "REPORTS");

    // Attendance Report (live data)
    const attReportRes = await api("GET", "/api/reports/attendance", academicStaffCookies);
    record("71. ACADEMIC_STAFF GET /api/reports/attendance -> 200", 200, attReportRes.status, "REPORTS");
    const attData = attReportRes.payload?.data;
    record("72. Attendance report contains absence breakdown", true, typeof attData?.absenceBreakdown?.sick === "number", "REPORTS");
    record("73. Attendance report contains batchRates list", true, Array.isArray(attData?.batchRates), "REPORTS");

    // Placement Report (live data)
    const placeReportRes = await api("GET", "/api/reports/placement", placementStaffCookies);
    record("74. PLACEMENT_STAFF GET /api/reports/placement -> 200", 200, placeReportRes.status, "REPORTS");
    const placeData = placeReportRes.payload?.data;
    record("75. Placement report contains applicationFunnel", true, Boolean(placeData?.applicationFunnel), "REPORTS");
    record("76. Placement report contains interviewStatusDistribution", true, Boolean(placeData?.interviewStatusDistribution), "REPORTS");
    record("77. Placement report contains placementStatusDistribution", true, Boolean(placeData?.placementStatusDistribution), "REPORTS");

    // Cross-role report boundaries
    const acadToPlacementRes = await api("GET", "/api/reports/placement", academicStaffCookies);
    record("78. ACADEMIC_STAFF forbidden from /api/reports/placement (403)", 403, acadToPlacementRes.status, "REPORTS_RBAC");

    const placToAcadRes = await api("GET", "/api/reports/academic", placementStaffCookies);
    record("79. PLACEMENT_STAFF forbidden from /api/reports/academic (403)", 403, placToAcadRes.status, "REPORTS_RBAC");

    const instToAcadRes = await api("GET", "/api/reports/academic", instructorCookies);
    record("80. INSTRUCTOR forbidden from /api/reports/academic (403)", 403, instToAcadRes.status, "REPORTS_RBAC");

    const studToAcadRes = await api("GET", "/api/reports/academic", studentACookies);
    record("81. STUDENT forbidden from /api/reports/academic (403)", 403, studToAcadRes.status, "REPORTS_RBAC");

    // Report Privacy verification
    const reportsPayloadDump = JSON.stringify({ acadData, attData, placeData });
    record("82. Reports do not leak NIK or student PII", false, reportsPayloadDump.includes("320") && reportsPayloadDump.includes("nik"), "PRIVACY");
    record("83. Reports do not leak passwordHash or tokens", false, reportsPayloadDump.includes("passwordHash") || reportsPayloadDump.includes("token="), "PRIVACY");

  } finally {
    // ==========================================
    // 6. TEARDOWN & BASELINE RESTORATION
    // ==========================================
    console.log("\n--- Section 6: Teardown & Baseline Restoration ---");

    if (createdCertIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entity: "Certificate",
          entityId: { in: createdCertIds },
        },
      }).catch((e) => console.error("Error cleaning audit logs:", e));

      await prisma.certificate.deleteMany({
        where: { id: { in: createdCertIds } },
      }).catch((e) => console.error("Error cleaning certificates:", e));
    }

    if (studentBRecord) {
      await prisma.student.update({
        where: { id: studentBRecord.id },
        data: { userId: null },
      }).catch((e) => console.error("Error unlinking student B:", e));
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch((e) => console.error("Error deleting temp users:", e));
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

    record("84. Baseline Certificates restored to 0", 0, finalCounts.certificates, "BASELINE");
    record("85. Baseline Users restored to 3", 3, finalCounts.users, "BASELINE" /* Updated STEP 88 */);
    record("86. Baseline Instructors restored to 6", 6, finalCounts.instructors, "BASELINE");
    record("87. Baseline Programs restored to 1", 1, finalCounts.programs, "BASELINE");
    record("88. Baseline Batches restored to 2", 2, finalCounts.batches, "BASELINE");
    record("89. Baseline Students restored to 21", 21, finalCounts.students, "BASELINE");
    record("90. Baseline Enrollments restored to 21", 21, finalCounts.enrollments, "BASELINE");
    record("91. Baseline Subjects restored to 6", 6, finalCounts.subjects, "BASELINE");
    record("92. Baseline Classes restored to 10", 10, finalCounts.classes, "BASELINE");
    record("93. Baseline Schedules restored to 10", 10, finalCounts.schedules, "BASELINE");
    record("94. Baseline Employers restored to 0", 0, finalCounts.employers, "BASELINE");
    record("95. Baseline Vacancies restored to 0", 0, finalCounts.vacancies, "BASELINE");
    record("96. Baseline Applications restored to 0", 0, finalCounts.applications, "BASELINE");
    record("97. Baseline Interviews restored to 0", 0, finalCounts.interviews, "BASELINE");
    record("98. Baseline Placements restored to 0", 0, finalCounts.placements, "BASELINE");
    record("99. Baseline Documents restored to 0", 0, finalCounts.documents, "BASELINE");
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
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
