// scripts/test-step69c-applications-frontend.mjs
// Step 69C: Application Frontend Integration & Hardening Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP69C_APPLICATIONS_FRONTEND_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP69C_APPLICATIONS_FRONTEND_CONFIRM_DATABASE",
});

const results = [];

function record(name, expected, actual) {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed });
  if (passed) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}`);
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
  const location = response.headers.get("location") || "";
  if (location.includes("error=")) {
    throw new Error(`Login failed for ${email}: ${location}`);
  }
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 69C APPLICATION FRONTEND INTEGRATION TEST ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];
  let studentAId = null;
  let studentBId = null;

  try {
    // ==========================================
    // 1. Authenticating & Setting Up Test Users
    // ==========================================
    console.log("1. Authenticating demo users & setting up test accounts...");

    const superAdminPassword =
      process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    const adminCookies = await login("admin.demo@ghs.local", superAdminPassword);
    const studentACookies = await login("student.demo@ghs.local", studentPassword);

    const studentAUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });

    let studentARecord = await prisma.student.findFirst({
      where: { userId: studentAUser.id },
    });
    if (!studentARecord) {
      studentARecord = await prisma.student.findFirst({
        where: { userId: null },
      });
      if (studentARecord) {
        studentARecord = await prisma.student.update({
          where: { id: studentARecord.id },
          data: { userId: studentAUser.id },
        });
      }
    }
    studentAId = studentARecord.id;

    // Create temporary test users for roles
    const hash = await bcrypt.hash("Password123!", 10);

    const placementRole = await prisma.role.findUnique({ where: { name: "PLACEMENT_STAFF" } });
    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    const acadRole = await prisma.role.findUnique({ where: { name: "ACADEMIC_STAFF" } });
    const instRole = await prisma.role.findUnique({ where: { name: "INSTRUCTOR" } });
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });

    const placementUser = await prisma.user.create({
      data: {
        name: "Placement Staff 69C",
        email: "placement.step69c@ghs.local",
        passwordHash: hash,
        roleId: placementRole.id,
      },
    });
    createdUserIds.push(placementUser.id);

    const mgmtUser = await prisma.user.create({
      data: {
        name: "Management 69C",
        email: "mgmt.step69c@ghs.local",
        passwordHash: hash,
        roleId: mgmtRole.id,
      },
    });
    createdUserIds.push(mgmtUser.id);

    const acadUser = await prisma.user.create({
      data: {
        name: "Academic Staff 69C",
        email: "acad.step69c@ghs.local",
        passwordHash: hash,
        roleId: acadRole.id,
      },
    });
    createdUserIds.push(acadUser.id);

    const instUser = await prisma.user.create({
      data: {
        name: "Instructor 69C",
        email: "inst.step69c@ghs.local",
        passwordHash: hash,
        roleId: instRole.id,
      },
    });
    createdUserIds.push(instUser.id);

    const studentBUser = await prisma.user.create({
      data: {
        name: "Student B 69C",
        email: "student.b.step69c@ghs.local",
        passwordHash: hash,
        roleId: studentRole.id,
      },
    });
    createdUserIds.push(studentBUser.id);

    // Link Student B
    let studentBRecord = await prisma.student.findFirst({
      where: { userId: null },
    });
    if (!studentBRecord) {
      studentBRecord = await prisma.student.findFirst({
        where: { id: { not: studentAId } },
      });
    }
    await prisma.student.update({
      where: { id: studentBRecord.id },
      data: { userId: studentBUser.id },
    });
    studentBId = studentBRecord.id;

    // Login cookies for all test users
    const placementCookies = await login("placement.step69c@ghs.local", "Password123!");
    const mgmtCookies = await login("mgmt.step69c@ghs.local", "Password123!");
    const acadCookies = await login("acad.step69c@ghs.local", "Password123!");
    const instCookies = await login("inst.step69c@ghs.local", "Password123!");
    const studentBCookies = await login("student.b.step69c@ghs.local", "Password123!");

    // Setup Test Employer and Vacancy
    const testEmployer = await prisma.employer.create({
      data: {
        name: "Grand Horizon Resort 69C",
        address: "Jl. Pantai Selatan No. 12",
        companyInfo: "Resort perhotelan bintang 5",
      },
    });
    createdEmployerIds.push(testEmployer.id);

    const testVacancy = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Front Desk Officer 69C",
        description: "Melayani tamu hotel bintang 5",
        requirements: "Bahasa Inggris aktif, ramah, berpenampilan rapi",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(testVacancy.id);

    // ==========================================
    // 2. Code Contract & Architecture Checks
    // ==========================================
    console.log("\n2. Checking Frontend Code Contracts & Architecture...");

    const appPageSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "applications", "applications-page.tsx"),
      "utf8"
    );
    const appDetailSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "applications", "application-detail.tsx"),
      "utf8"
    );
    const placementDashSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "dashboard", "placement-dashboard.tsx"),
      "utf8"
    );
    const studentDashSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "dashboard", "student-dashboard.tsx"),
      "utf8"
    );
    const proxySrc = fs.readFileSync(
      path.join(process.cwd(), "proxy.ts"),
      "utf8"
    );
    const sidebarSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "layout", "app-sidebar.tsx"),
      "utf8"
    );

    // AUTH & PROXY
    console.log("\n--- SECTION: AUTH & PROXY ROUTING ---");
    record("1.1 proxy.ts protects /applications/:path*", true, proxySrc.includes('"/applications/:path*"'));
    
    const unauthRes = await request("/applications", { redirect: "manual" });
    record("1.2 Unauthenticated GET /applications redirects to login", true, [302, 303, 307].includes(unauthRes.status));

    const studentPageRes = await request("/applications", { headers: { Cookie: studentACookies } });
    record("2.1 Authenticated Student GET /applications returns 200", 200, studentPageRes.status);

    const placementPageRes = await request("/applications", { headers: { Cookie: placementCookies } });
    record("3.1 Authenticated Placement Staff GET /applications returns 200", 200, placementPageRes.status);

    const mgmtPageRes = await request("/applications", { headers: { Cookie: mgmtCookies } });
    record("4.1 Authenticated Management GET /applications returns 200", 200, mgmtPageRes.status);

    const adminApiRes = await request("/api/applications", { headers: { Cookie: adminCookies } });
    record("4.2 Authenticated Admin GET /api/applications returns 200", 200, adminApiRes.status);

    const acadApiRes = await request("/api/applications", { headers: { Cookie: acadCookies } });
    record("4.3 Academic Staff GET /api/applications returns 403", 403, acadApiRes.status);

    const instApiRes = await request("/api/applications", { headers: { Cookie: instCookies } });
    record("4.4 Instructor GET /api/applications returns 403", 403, instApiRes.status);

    // Sidebar integration
    record("5.1 Sidebar contains Link to /applications", true, sidebarSrc.includes('Lamaran: "/applications"'));
    record("5.2 Sidebar hides Lamaran for Academic Staff / Instructor", true, sidebarSrc.includes("isAcademicOrInstructor") && sidebarSrc.includes('item.label === "Lamaran"'));

    // Component source code contracts
    console.log("\n--- SECTION: REAL API USAGE & CONTRACTS ---");
    record("6.1 applications-page.tsx fetches /api/applications", true, appPageSrc.includes('fetch(`/api/applications?${params.toString()}`)'));
    record("6.2 applications-page.tsx does not import mock applications", false, appPageSrc.includes("studentApplications") || appPageSrc.includes("placementPipeline"));
    record("6.3 application-detail.tsx fetches /api/applications/[id]", true, appDetailSrc.includes("fetch(`/api/applications/${applicationId}`)"));
    record("6.4 application-detail.tsx does not import mock applications", false, appDetailSrc.includes("studentApplications"));
    record("6.5 student-dashboard.tsx fetches /api/applications", true, studentDashSrc.includes('fetch("/api/applications")'));
    record("6.6 student-dashboard.tsx does not import studentApplications", false, studentDashSrc.includes("studentApplications"));
    record("6.7 placement-dashboard.tsx fetches /api/applications", true, placementDashSrc.includes('fetch("/api/applications")'));

    // Test-ids in components
    console.log("\n--- SECTION: REQUIRED TEST-IDS & UI STATES ---");
    record("7.1 applications-page.tsx has data-testid='loading-state'", true, appPageSrc.includes('data-testid="loading-state"'));
    record("7.2 applications-page.tsx has data-testid='empty-state'", true, appPageSrc.includes('data-testid="empty-state"'));
    record("7.3 applications-page.tsx has data-testid='unauthorized-state'", true, appPageSrc.includes('data-testid="unauthorized-state"'));
    record("7.4 applications-page.tsx has data-testid='error-state'", true, appPageSrc.includes('data-testid="error-state"'));
    record("7.5 applications-page.tsx has data-testid='withdraw-button'", true, appPageSrc.includes('data-testid="withdraw-button"'));
    record("7.6 applications-page.tsx has data-testid='btn-to-screening'", true, appPageSrc.includes('data-testid="btn-to-screening"'));
    record("7.7 applications-page.tsx has data-testid='btn-to-interview'", true, appPageSrc.includes('data-testid="btn-to-interview"'));
    record("7.8 applications-page.tsx has data-testid='btn-to-selected'", true, appPageSrc.includes('data-testid="btn-to-selected"'));
    record("7.9 applications-page.tsx has data-testid='btn-to-rejected'", true, appPageSrc.includes('data-testid="btn-to-rejected"'));

    record("8.1 application-detail.tsx has data-testid='loading-state'", true, appDetailSrc.includes('data-testid="loading-state"'));
    record("8.2 application-detail.tsx has data-testid='not-found-state'", true, appDetailSrc.includes('data-testid="not-found-state"'));
    record("8.3 application-detail.tsx has data-testid='unauthorized-state'", true, appDetailSrc.includes('data-testid="unauthorized-state"'));
    record("8.4 application-detail.tsx has data-testid='error-state'", true, appDetailSrc.includes('data-testid="error-state"'));
    record("8.5 application-detail.tsx has data-testid='withdraw-button'", true, appDetailSrc.includes('data-testid="withdraw-button"'));
    record("8.6 application-detail.tsx has data-testid='edit-notes-button'", true, appDetailSrc.includes('data-testid="edit-notes-button"'));
    record("8.7 application-detail.tsx includes StatusTimeline visual component", true, appDetailSrc.includes("function StatusTimeline"));

    // Empty state text verification
    record("9.1 Empty state student text contains 'Belum ada lamaran.'", true, appPageSrc.includes("Belum ada lamaran."));
    record("9.2 Empty state staff text contains 'Belum ada data lamaran.'", true, appPageSrc.includes("Belum ada data lamaran."));
    record("9.3 Unauthorized text contains 'Anda tidak memiliki akses ke modul Lamaran.'", true, appPageSrc.includes("Anda tidak memiliki akses ke modul Lamaran."));
    record("9.4 404 text contains 'Lamaran tidak ditemukan.'", true, appDetailSrc.includes("Lamaran tidak ditemukan."));

    // ==========================================
    // 3. Functional Student Application Flow
    // ==========================================
    console.log("\n--- SECTION: STUDENT APPLICATION FLOW ---");

    // Student A creates an application
    const createRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: testVacancy.id,
        notes: "Pengajuan oleh Student A via frontend",
      }),
    });
    record("10.1 Student A creates application -> 201 Created", 201, createRes.status);
    const appA = await createRes.json();
    createdApplicationIds.push(appA.id);
    record("10.2 Initial status is APPLIED", "APPLIED", appA.status);

    // Student A GET list
    const studentAListRes = await request("/api/applications", {
      headers: { Cookie: studentACookies },
    });
    record("11.1 Student A GET /api/applications returns 200", 200, studentAListRes.status);
    const studentAList = await studentAListRes.json();
    record("11.2 Student A sees own application in list", true, studentAList.some((a) => a.id === appA.id));

    // Student B GET list - must NOT see Student A's application
    const studentBListRes = await request("/api/applications", {
      headers: { Cookie: studentBCookies },
    });
    record("12.1 Student B GET /api/applications returns 200", 200, studentBListRes.status);
    const studentBList = await studentBListRes.json();
    record("12.2 Student B does NOT see Student A application", false, studentBList.some((a) => a.id === appA.id));

    // Student A GET detail -> 200
    const studentADetailRes = await request(`/api/applications/${appA.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("13.1 Student A GET detail own application -> 200", 200, studentADetailRes.status);
    const appADetail = await studentADetailRes.json();
    record("13.2 Detail includes vacancy and candidate info", true, appADetail.student.name && appADetail.vacancy.title);

    // Student B GET Student A detail -> 403 Forbidden
    const studentBDetailRes = await request(`/api/applications/${appA.id}`, {
      headers: { Cookie: studentBCookies },
    });
    record("14.1 Student B GET Student A application detail -> 403 Forbidden", 403, studentBDetailRes.status);

    // ==========================================
    // 4. Staff Transitions & Status Logic
    // ==========================================
    console.log("\n--- SECTION: STAFF TRANSITIONS & LIFECYCLE ---");

    // Staff sees global list
    const staffListRes = await request("/api/applications", {
      headers: { Cookie: placementCookies },
    });
    record("15.1 Placement Staff GET list returns 200", 200, staffListRes.status);
    const staffList = await staffListRes.json();
    record("15.2 Placement Staff sees Student A application in global list", true, staffList.some((a) => a.id === appA.id));

    // Staff advances APPLIED -> SCREENING
    const toScreeningRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SCREENING" }),
    });
    record("16.1 Staff transitions APPLIED -> SCREENING returns 200", 200, toScreeningRes.status);
    const appScreening = await toScreeningRes.json();
    record("16.2 Application status is now SCREENING", "SCREENING", appScreening.status);

    // Now in SCREENING: Student CANNOT withdraw
    const withdrawScreeningRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("17.1 Student attempting withdraw in SCREENING returns 409 Conflict", 409, withdrawScreeningRes.status);

    // Staff updates notes
    const updateNotesRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ notes: "Catatan internal wawancara awal: kandidat potensial." }),
    });
    record("18.1 Staff updates notes returns 200", 200, updateNotesRes.status);
    const appWithNotes = await updateNotesRes.json();
    record("18.2 Notes updated in database", "Catatan internal wawancara awal: kandidat potensial.", appWithNotes.notes);

    // Staff advances SCREENING -> INTERVIEW
    const toInterviewRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("19.1 Staff transitions SCREENING -> INTERVIEW returns 200", 200, toInterviewRes.status);
    const appInterview = await toInterviewRes.json();
    record("19.2 Status is now INTERVIEW", "INTERVIEW", appInterview.status);

    // Staff advances INTERVIEW -> SELECTED
    const toSelectedRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SELECTED" }),
    });
    record("20.1 Staff transitions INTERVIEW -> SELECTED returns 200", 200, toSelectedRes.status);
    const appSelected = await toSelectedRes.json();
    record("20.2 Status is now SELECTED", "SELECTED", appSelected.status);

    // Terminal status SELECTED cannot transition further
    const invalidFromSelectedRes = await request(`/api/applications/${appA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    record("21.1 Terminal status SELECTED cannot transition -> 409 Conflict", 409, invalidFromSelectedRes.status);

    // ==========================================
    // 5. Student Withdrawal on APPLIED
    // ==========================================
    console.log("\n--- SECTION: STUDENT WITHDRAW ON APPLIED ---");

    // Create a new vacancy & application for withdraw test
    const testVacancy2 = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Barista Trainee 69C",
        description: "Pelatihan barista cafe resort",
        requirements: "Minat tinggi di bidang kopi",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(testVacancy2.id);

    const createWithdrawAppRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: testVacancy2.id,
      }),
    });
    record("22.1 Student A creates second application -> 201 Created", 201, createWithdrawAppRes.status);
    const appWithdraw = await createWithdrawAppRes.json();
    createdApplicationIds.push(appWithdraw.id);

    // Student withdraws while status is APPLIED
    const studentWithdrawRes = await request(`/api/applications/${appWithdraw.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("23.1 Student withdraws APPLIED application -> 200 OK", 200, studentWithdrawRes.status);
    const appWithdrawn = await studentWithdrawRes.json();
    record("23.2 Application status is now WITHDRAWN", "WITHDRAWN", appWithdrawn.status);

    // ==========================================
    // 6. Management Role Read-Only
    // ==========================================
    console.log("\n--- SECTION: MANAGEMENT ROLE PERMISSIONS ---");
    const mgmtListRes = await request("/api/applications", {
      headers: { Cookie: mgmtCookies },
    });
    record("24.1 Management GET /api/applications returns 200", 200, mgmtListRes.status);

    const mgmtPostRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgmtCookies,
      },
      body: JSON.stringify({
        vacancyId: testVacancy2.id,
        studentId: studentBId,
      }),
    });
    record("24.2 Management POST /api/applications returns 403 Forbidden", 403, mgmtPostRes.status);

    const mgmtPatchRes = await request(`/api/applications/${appWithdraw.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgmtCookies,
      },
      body: JSON.stringify({ notes: "Management note attempt" }),
    });
    record("24.3 Management PATCH /api/applications/[id] returns 403 Forbidden", 403, mgmtPatchRes.status);

    // ==========================================
    // 7. Error Handling & 404
    // ==========================================
    console.log("\n--- SECTION: ERROR HANDLING & NOT FOUND ---");
    const notFoundRes = await request("/api/applications/nonexistent-uuid-12345", {
      headers: { Cookie: placementCookies },
    });
    record("25.1 GET /api/applications/nonexistent-id returns 404", 404, notFoundRes.status);

    const methodNotAllowedRes = await request("/api/applications", {
      method: "DELETE",
      headers: { Cookie: placementCookies },
    });
    record("25.2 DELETE /api/applications returns 405 Method Not Allowed", 405, methodNotAllowedRes.status);

  } catch (error) {
    console.error("Test execution failed with error:", error);
    record("Test run without unhandled error", true, false);
  } finally {
    // ==========================================
    // 8. TEARDOWN & DATABASE CLEANUP
    // ==========================================
    console.log("\n--- TEARDOWN & DATABASE CLEANUP ---");

    try {
      const validAppIds = createdApplicationIds.filter(Boolean);
      if (validAppIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entity: "Application",
            entityId: { in: validAppIds },
          },
        });
        await prisma.application.deleteMany({
          where: { id: { in: validAppIds } },
        });
      }

      const validVacIds = createdVacancyIds.filter(Boolean);
      if (validVacIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entity: "Vacancy",
            entityId: { in: validVacIds },
          },
        });
        await prisma.vacancy.deleteMany({
          where: { id: { in: validVacIds } },
        });
      }

      const validEmpIds = createdEmployerIds.filter(Boolean);
      if (validEmpIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entity: "Employer",
            entityId: { in: validEmpIds },
          },
        });
        await prisma.employer.deleteMany({
          where: { id: { in: validEmpIds } },
        });
      }

      // Reset linked student userId
      if (studentBId) {
        await prisma.student.update({
          where: { id: studentBId },
          data: { userId: null },
        });
      }

      // Cleanup test users
      const validUserIds = createdUserIds.filter(Boolean);
      if (validUserIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { userId: { in: validUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: validUserIds } },
        });
      }
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }

    // Master database counts
    console.log("\n--- VERIFYING MASTER DATABASE BASELINE ---");
    const countEmployers = await prisma.employer.count();
    const countVacancies = await prisma.vacancy.count();
    const countApplications = await prisma.application.count();
    const countPlacements = await prisma.placement.count();
    const countDocuments = await prisma.document.count();
    const countStudents = await prisma.student.count();
    const countEnrollments = await prisma.enrollment.count();
    const countSubjects = await prisma.subject.count();
    const countClasses = await prisma.class.count();
    const countSchedules = await prisma.schedule.count();
    const countInstructors = await prisma.instructor.count();
    const countUsers = await prisma.user.count();

    record("26.1 Employers = 0", 0, countEmployers);
    record("26.2 Vacancies = 0", 0, countVacancies);
    record("26.3 Applications = 0", 0, countApplications);
    record("26.4 Placements = 0", 0, countPlacements);
    record("26.5 Documents = 0", 0, countDocuments);
    record("26.6 Students = 21", 21, countStudents);
    record("26.7 Enrollments = 21", 21, countEnrollments);
    record("26.8 Subjects = 6", 6, countSubjects);
    record("26.9 Classes = 10", 10, countClasses);
    record("26.10 Schedules = 10", 10, countSchedules);
    record("26.11 Instructors = 6", 6, countInstructors);
    record("26.12 Users = 3", 3, countUsers /* Updated STEP 88 */);

    await prisma.$disconnect();

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log(`\n==========================================`);
    console.log(`TOTAL ASSERTIONS: ${total}`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);
    console.log(`OVERALL STATUS: ${failed === 0 ? "PASSED" : "FAILED"}`);
    console.log(`==========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  }
}

run();
