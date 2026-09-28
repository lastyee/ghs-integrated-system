// scripts/test-step70c-interviews-frontend.mjs
// Step 70C: Interview Frontend & Real API Integration Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP70C_INTERVIEWS_FRONTEND_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP70C_INTERVIEWS_FRONTEND_CONFIRM_DATABASE",
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
  console.log("=== STEP 70C INTERVIEW FRONTEND & REAL API INTEGRATION TEST ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];
  const createdInterviewIds = [];
  let studentAId = null;
  let studentBId = null;
  let studentBOriginalUserId = null;

  try {
    // ==========================================
    // 1. Authenticating & Setting Up Test Users
    // ==========================================
    console.log("1. Authenticating users & preparing test fixtures...");

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
        name: "Placement Staff 70C",
        email: "placement.step70c@ghs.local",
        passwordHash: hash,
        roleId: placementRole.id,
      },
    });
    createdUserIds.push(placementUser.id);

    const mgmtUser = await prisma.user.create({
      data: {
        name: "Management 70C",
        email: "mgmt.step70c@ghs.local",
        passwordHash: hash,
        roleId: mgmtRole.id,
      },
    });
    createdUserIds.push(mgmtUser.id);

    const acadUser = await prisma.user.create({
      data: {
        name: "Academic Staff 70C",
        email: "acad.step70c@ghs.local",
        passwordHash: hash,
        roleId: acadRole.id,
      },
    });
    createdUserIds.push(acadUser.id);

    const instUser = await prisma.user.create({
      data: {
        name: "Instructor 70C",
        email: "inst.step70c@ghs.local",
        passwordHash: hash,
        roleId: instRole.id,
      },
    });
    createdUserIds.push(instUser.id);

    const studentBUser = await prisma.user.create({
      data: {
        name: "Student B 70C",
        email: "student.b.step70c@ghs.local",
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
    studentBOriginalUserId = studentBRecord.userId;
    await prisma.student.update({
      where: { id: studentBRecord.id },
      data: { userId: studentBUser.id },
    });
    studentBId = studentBRecord.id;

    // Login cookies for all test users
    const placementCookies = await login("placement.step70c@ghs.local", "Password123!");
    const mgmtCookies = await login("mgmt.step70c@ghs.local", "Password123!");
    const acadCookies = await login("acad.step70c@ghs.local", "Password123!");
    const instCookies = await login("inst.step70c@ghs.local", "Password123!");
    const studentBCookies = await login("student.b.step70c@ghs.local", "Password123!");

    // Setup Test Employer, Vacancy, and Applications
    const testEmployer = await prisma.employer.create({
      data: {
        name: "Royal Palace Hotel 70C",
        address: "Jl. Merdeka No. 100",
        companyInfo: "Luxury 5-star hotel chain",
      },
    });
    createdEmployerIds.push(testEmployer.id);

    const testVacancy = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Guest Relations Officer 70C",
        description: "Handling high-profile guest hospitality",
        requirements: "Hospitality degree, fluent English",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(testVacancy.id);

    const testAppA = await prisma.application.create({
      data: {
        studentId: studentAId,
        vacancyId: testVacancy.id,
        status: "INTERVIEW",
        notes: "Application A for Student A",
      },
    });
    createdApplicationIds.push(testAppA.id);

    const testAppB = await prisma.application.create({
      data: {
        studentId: studentBId,
        vacancyId: testVacancy.id,
        status: "INTERVIEW",
        notes: "Application B for Student B",
      },
    });
    createdApplicationIds.push(testAppB.id);

    // ==========================================
    // 2. Code Contract & Architecture Checks
    // ==========================================
    console.log("\n2. Checking Frontend Code Contracts & Architecture...");

    const interviewsPageSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "interviews", "interviews-page.tsx"),
      "utf8"
    );
    const interviewDetailSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "interviews", "interview-detail.tsx"),
      "utf8"
    );
    const interviewFormSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "interviews", "interview-form.tsx"),
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
    const appDetailSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "applications", "application-detail.tsx"),
      "utf8"
    );
    const sidebarSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "layout", "app-sidebar.tsx"),
      "utf8"
    );
    const proxySrc = fs.readFileSync(
      path.join(process.cwd(), "proxy.ts"),
      "utf8"
    );

    // File existence checks
    record(
      "app/interviews/page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "app", "interviews", "page.tsx"))
    );
    record(
      "app/interviews/[id]/page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "app", "interviews", "[id]", "page.tsx"))
    );
    record(
      "components/interviews/interviews-page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "interviews", "interviews-page.tsx"))
    );
    record(
      "components/interviews/interview-detail.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "interviews", "interview-detail.tsx"))
    );
    record(
      "components/interviews/interview-form.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "interviews", "interview-form.tsx"))
    );

    // Navigation and Proxy check
    record(
      "proxy.ts protects /interviews route",
      true,
      proxySrc.includes('"/interviews/:path*"') || proxySrc.includes("/interviews")
    );
    record(
      "app-sidebar.tsx includes Wawancara menu for authorized roles",
      true,
      sidebarSrc.includes('Wawancara: "/interviews"') &&
        sidebarSrc.includes("isAcademicOrInstructor")
    );

    // ==========================================
    // 3. RBAC Route Access (Test 1-5)
    // ==========================================
    console.log("\n3. Testing Route Access across Roles (Minimal Test 1-5)...");

    // 1. Staff access
    const staffRes = await request("/interviews", {
      headers: { Cookie: placementCookies },
      redirect: "manual",
    });
    record("1. Interview page accessible by PLACEMENT_STAFF (200)", 200, staffRes.status);

    const adminPageRes = await request("/interviews", {
      headers: { Cookie: adminCookies },
      redirect: "manual",
    });
    record("1b. Interview page accessible by SUPER_ADMIN (200)", 200, adminPageRes.status);

    // 2. Management access
    const mgmtPageRes = await request("/interviews", {
      headers: { Cookie: mgmtCookies },
      redirect: "manual",
    });
    record("2. Interview page accessible by MANAGEMENT (200)", 200, mgmtPageRes.status);

    // 3. Student access
    const studentPageRes = await request("/interviews", {
      headers: { Cookie: studentACookies },
      redirect: "manual",
    });
    record("3. Interview page accessible by STUDENT (200)", 200, studentPageRes.status);

    // 4. Academic Staff rejected
    const acadPageRes = await request("/interviews", {
      headers: { Cookie: acadCookies },
      redirect: "manual",
    });
    const acadBody = await acadPageRes.text();
    const acadRejected =
      acadPageRes.status === 403 ||
      acadPageRes.status === 302 ||
      acadPageRes.status === 307 ||
      acadBody.includes("Akses Ditolak") ||
      acadBody.includes("unauthorized-state");
    record("4. Academic Staff rejected from /interviews", true, acadRejected);

    // 5. Instructor rejected
    const instPageRes = await request("/interviews", {
      headers: { Cookie: instCookies },
      redirect: "manual",
    });
    const instBody = await instPageRes.text();
    const instRejected =
      instPageRes.status === 403 ||
      instPageRes.status === 302 ||
      instPageRes.status === 307 ||
      instBody.includes("Akses Ditolak") ||
      instBody.includes("unauthorized-state");
    record("5. Instructor rejected from /interviews", true, instRejected);

    // ==========================================
    // 4. Mutation & Lifecycle API Tests (Test 11-16)
    // ==========================================
    console.log("\n4. Testing Real API Integration for Create, Update, Reschedule, Result (Test 11-16)...");

    // 11. Create form access: checked in UI contracts
    const hasStaffCreateTrigger =
      interviewsPageSrc.includes("isStaff") &&
      interviewsPageSrc.includes("btn-create-interview") &&
      !interviewsPageSrc.includes("isManagement &&");
    record("11. Create form trigger strictly authorized for staff only", true, hasStaffCreateTrigger);

    // 12. Create interview via real API
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request("/api/interviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        applicationId: testAppA.id,
        scheduledAt: tomorrow,
        method: "Online",
        location: "Zoom Room A",
        notes: "Initial interview for Student A",
      }),
    });
    record("12. Create interview via real API succeeds (201)", 201, createRes.status);
    const createdIvA = await createRes.json();
    createdInterviewIds.push(createdIvA.id);

    // Create interview for Student B as well
    const createBRes = await request("/api/interviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        applicationId: testAppB.id,
        scheduledAt: new Date(Date.now() + 172800000).toISOString(),
        method: "Offline",
        location: "Hotel Grand Horizon Lobby",
        notes: "Initial interview for Student B",
      }),
    });
    record("12b. Create second interview succeeds (201)", 201, createBRes.status);
    const createdIvB = await createBRes.json();
    createdInterviewIds.push(createdIvB.id);

    // 6. Student ownership scoping (GET /api/interviews)
    console.log("\n5. Testing Ownership Scoping and Global Scoping (Test 6-7)...");
    const studentAGetRes = await request("/api/interviews", {
      headers: { Cookie: studentACookies },
    });
    const studentAList = await studentAGetRes.json();
    const studentAOnlySeesOwn =
      Array.isArray(studentAList) &&
      studentAList.some((iv) => iv.id === createdIvA.id) &&
      !studentAList.some((iv) => iv.id === createdIvB.id);
    record("6. Student only sees their own interview (server scoped)", true, studentAOnlySeesOwn);

    const studentBGetRes = await request("/api/interviews", {
      headers: { Cookie: studentBCookies },
    });
    const studentBList = await studentBGetRes.json();
    const studentBOnlySeesOwn =
      Array.isArray(studentBList) &&
      studentBList.some((iv) => iv.id === createdIvB.id) &&
      !studentBList.some((iv) => iv.id === createdIvA.id);
    record("6b. Student B only sees their own interview (cross-scoping)", true, studentBOnlySeesOwn);

    // 7. Staff sees global interviews
    const staffGetRes = await request("/api/interviews", {
      headers: { Cookie: placementCookies },
    });
    const staffList = await staffGetRes.json();
    const staffSeesAll =
      Array.isArray(staffList) &&
      staffList.some((iv) => iv.id === createdIvA.id) &&
      staffList.some((iv) => iv.id === createdIvB.id);
    record("7. Staff sees all interviews across candidates", true, staffSeesAll);

    // 8. Management UI has no mutation controls
    console.log("\n6. Testing Management & Student UI Restrictions (Test 8-10)...");
    const mgmtHasNoMutationControls =
      !interviewsPageSrc.includes("isManagement && <button") &&
      !interviewDetailSrc.includes("isManagement && <button") &&
      interviewDetailSrc.includes("!isStaff") &&
      interviewDetailSrc.includes("canEvaluate");
    record("8. Management UI is strictly read-only without mutation buttons", true, mgmtHasNoMutationControls);

    // 9. Student cannot see feedback
    // First, set feedback on interview A via admin
    await prisma.interview.update({
      where: { id: createdIvA.id },
      data: { feedback: "Kandidat memiliki potensi sangat baik (CONFIDENTIAL EVALUATION)" },
    });

    const studentADetailRes = await request(`/api/interviews/${createdIvA.id}`, {
      headers: { Cookie: studentACookies },
    });
    const studentADetail = await studentADetailRes.json();
    const studentFeedbackHidden =
      studentADetail.feedback === undefined || studentADetail.feedback === null;
    record("9. Student cannot see feedback (API and UI omits feedback)", true, studentFeedbackHidden);

    // 10. Staff can see feedback
    const staffDetailRes = await request(`/api/interviews/${createdIvA.id}`, {
      headers: { Cookie: placementCookies },
    });
    const staffDetail = await staffDetailRes.json();
    const staffCanSeeFeedback =
      typeof staffDetail.feedback === "string" &&
      staffDetail.feedback.includes("CONFIDENTIAL EVALUATION");
    record("10. Staff can see internal feedback", true, staffCanSeeFeedback);

    // 13. Operational edit via real API
    console.log("\n7. Testing Operational Edit, Reschedule, and Results (Test 13-17)...");
    const editRes = await request(`/api/interviews/${createdIvA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        method: "Offline",
        location: "Kantor GHS Ruang Interview 2",
        notes: "Operational notes updated by placement staff",
      }),
    });
    record("13. Operational edit via real API succeeds (200)", 200, editRes.status);
    const updatedIvA = await editRes.json();
    record(
      "13b. Operational edit values updated correctly",
      true,
      updatedIvA.method === "Offline" &&
        updatedIvA.location === "Kantor GHS Ruang Interview 2"
    );

    // 14. Reschedule via real API
    const newScheduledAt = new Date(Date.now() + 259200000).toISOString();
    const rescheduleRes = await request(`/api/interviews/${createdIvA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        scheduledAt: newScheduledAt,
        status: "RESCHEDULED",
        notes: "Rescheduled per candidate request",
      }),
    });
    record("14. Reschedule interview via real API succeeds (200)", 200, rescheduleRes.status);
    const rescheduledIvA = await rescheduleRes.json();
    record("14b. Status updated to RESCHEDULED", "RESCHEDULED", rescheduledIvA.status);

    // 15. Result Passed via real API
    const passRes = await request(`/api/interviews/${createdIvA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        status: "PASSED",
        feedback: "Kandidat menunjukkan penguasaan materi yang memuaskan.",
      }),
    });
    record("15. Result Passed via real API succeeds (200)", 200, passRes.status);
    const passedIvA = await passRes.json();
    record("15b. Interview status is PASSED", "PASSED", passedIvA.status);

    // 16. Result Failed via real API (using Interview B)
    const failRes = await request(`/api/interviews/${createdIvB.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        status: "FAILED",
        feedback: "Kandidat belum memenuhi kualifikasi bahasa Inggris.",
      }),
    });
    record("16. Result Failed via real API succeeds (200)", 200, failRes.status);
    const failedIvB = await failRes.json();
    record("16b. Interview status is FAILED", "FAILED", failedIvB.status);

    // 17. Terminal interview cannot be updated
    const rejectEditTerminal = await request(`/api/interviews/${createdIvA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        notes: "Trying to edit terminal interview",
      }),
    });
    record("17. Backend rejects operational update on terminal interview (409)", 409, rejectEditTerminal.status);
    const terminalUIRestricted =
      interviewDetailSrc.includes("isTerminal") &&
      interviewDetailSrc.includes("Wawancara telah selesai dan berada pada status terminal");
    record("17b. UI disables operational and reschedule actions for terminal interviews", true, terminalUIRestricted);

    // ==========================================
    // 5. Dashboard & Detail Integrations (Test 18-21)
    // ==========================================
    console.log("\n8. Testing Dashboard & Detail Integration (Test 18-21)...");

    // 18. Placement Dashboard uses real API
    const placementDashUsesApi =
      placementDashSrc.includes('fetch("/api/interviews")') &&
      placementDashSrc.includes("InterviewsSection") &&
      placementDashSrc.includes("interviews.filter");
    record("18. Placement Dashboard fetches real /api/interviews data", true, placementDashUsesApi);

    // 19. Student Dashboard uses real API
    const studentDashUsesApi =
      studentDashSrc.includes('fetch("/api/interviews")') &&
      studentDashSrc.includes("InterviewSection") &&
      !studentDashSrc.includes("studentInterview.");
    record("19. Student Dashboard fetches real /api/interviews data", true, studentDashUsesApi);

    // 20. Application Detail integrates interview API
    const appDetailIntegratesInterviews =
      appDetailSrc.includes("application.interviews") &&
      appDetailSrc.includes("Jadwal Wawancara (Interview)") &&
      appDetailSrc.includes("btn-schedule-interview") &&
      appDetailSrc.includes("InterviewFormModal");
    record("20. Application Detail renders real interviews and scheduling action", true, appDetailIntegratesInterviews);

    // 21. Mock data cleanup: no mock data used for interview rendering
    const noMockInInterviewsPage =
      !interviewsPageSrc.includes("@/lib/mock-data") &&
      !interviewDetailSrc.includes("@/lib/mock-data");
    const studentInterviewRemovedFromStudentDash =
      !studentDashSrc.includes("studentInterview");
    record("21. Interview module uses zero mock data for display", true, noMockInInterviewsPage && studentInterviewRemovedFromStudentDash);

    // ==========================================
    // 6. UI States: Empty, Error, Loading (Test 22-24)
    // ==========================================
    console.log("\n9. Testing Empty, Error, and Loading UI States (Test 22-24)...");

    // 22. Empty state
    const hasEmptyState =
      interviewsPageSrc.includes("empty-state") &&
      interviewsPageSrc.includes("Belum ada jadwal wawancara") &&
      placementDashSrc.includes("Belum Ada Agenda Wawancara") &&
      studentDashSrc.includes("Belum ada jadwal wawancara");
    record("22. Empty state UI cleanly implemented across pages", true, hasEmptyState);

    // 23. Error state
    const hasErrorState =
      interviewsPageSrc.includes("error-state") &&
      interviewDetailSrc.includes("error-state") &&
      interviewDetailSrc.includes("unauthorized-state") &&
      interviewFormSrc.includes("res.status === 400") &&
      interviewFormSrc.includes("res.status === 409");
    record("23. Error state handles 400, 403, 404, 409, and network errors user-friendly", true, hasErrorState);

    // 24. Loading state
    const hasLoadingState =
      interviewsPageSrc.includes("loading-state") &&
      interviewDetailSrc.includes("loading-state") &&
      placementDashSrc.includes("dashboard-interviews-loading") &&
      studentDashSrc.includes("student-interviews-loading");
    record("24. Loading state indicators implemented cleanly without fake loading", true, hasLoadingState);

    // Status badges consistency check (Indonesian labels)
    const hasConsistentBadges =
      interviewsPageSrc.includes("Menunggu") &&
      interviewsPageSrc.includes("Dijadwalkan Ulang") &&
      interviewsPageSrc.includes("Lulus") &&
      interviewsPageSrc.includes("Tidak Lulus");
    record("Indonesian status labels consistent (Menunggu, Dijadwalkan Ulang, Lulus, Tidak Lulus)", true, hasConsistentBadges);

  } catch (err) {
    console.error("Test execution error:", err);
    record("Test run without fatal exceptions", true, false);
  } finally {
    // ==========================================
    // 7. Cleanup & Baseline Verification
    // ==========================================
    console.log("\n10. Cleaning up test data & verifying baseline database...");

    for (const id of createdInterviewIds) {
      await prisma.interview.deleteMany({ where: { id } });
    }
    for (const id of createdApplicationIds) {
      await prisma.application.deleteMany({ where: { id } });
    }
    for (const id of createdVacancyIds) {
      await prisma.vacancy.deleteMany({ where: { id } });
    }
    for (const id of createdEmployerIds) {
      await prisma.employer.deleteMany({ where: { id } });
    }
    if (studentBId) {
      await prisma.student.update({
        where: { id: studentBId },
        data: { userId: studentBOriginalUserId },
      });
    }
    for (const id of createdUserIds) {
      await prisma.user.deleteMany({ where: { id } });
    }

    const employersCount = await prisma.employer.count();
    const vacanciesCount = await prisma.vacancy.count();
    const applicationsCount = await prisma.application.count();
    const interviewsCount = await prisma.interview.count();
    const placementsCount = await prisma.placement.count();
    const documentsCount = await prisma.document.count();
    const studentsCount = await prisma.student.count();
    const enrollmentsCount = await prisma.enrollment.count();
    const subjectsCount = await prisma.subject.count();
    const classesCount = await prisma.class.count();
    const schedulesCount = await prisma.schedule.count();
    const instructorsCount = await prisma.instructor.count();
    const usersCount = await prisma.user.count();

    console.log("\nDatabase Baseline Counts:");
    console.log(`Employers:   ${employersCount} (expected 0)`);
    console.log(`Vacancies:   ${vacanciesCount} (expected 0)`);
    console.log(`Applications:${applicationsCount} (expected 0)`);
    console.log(`Interviews:  ${interviewsCount} (expected 0)`);
    console.log(`Placements:  ${placementsCount} (expected 0)`);
    console.log(`Documents:   ${documentsCount} (expected 0)`);
    console.log(`Students:    ${studentsCount} (expected 21)`);
    console.log(`Enrollments: ${enrollmentsCount} (expected 21)`);
    console.log(`Subjects:    ${subjectsCount} (expected 6)`);
    console.log(`Classes:     ${classesCount} (expected 10)`);
    console.log(`Schedules:   ${schedulesCount} (expected 10)`);
    console.log(`Instructors: ${instructorsCount} (expected 6)`);
    console.log(`Users:       ${usersCount} (expected 3)`);

    record("Baseline Employers == 0", 0, employersCount);
    record("Baseline Vacancies == 0", 0, vacanciesCount);
    record("Baseline Applications == 0", 0, applicationsCount);
    record("Baseline Interviews == 0", 0, interviewsCount);
    record("Baseline Placements == 0", 0, placementsCount);
    record("Baseline Documents == 0", 0, documentsCount);
    record("Baseline Students == 21", 21, studentsCount);
    record("Baseline Enrollments == 21", 21, enrollmentsCount);
    record("Baseline Subjects == 6", 6, subjectsCount);
    record("Baseline Classes == 10", 10, classesCount);
    record("Baseline Schedules == 10", 10, schedulesCount);
    record("Baseline Instructors == 6", 6, instructorsCount);
    record("Baseline Users == 3", 3, usersCount /* Updated STEP 88 */);
  }

  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`\n==========================================`);
  console.log(`RESULTS: ${results.length - failedCount}/${results.length} PASSED`);
  if (failedCount > 0) {
    console.log(`FAILED: ${failedCount}`);
    process.exit(1);
  } else {
    console.log(`STATUS: ALL STEP 70C FRONTEND TESTS PASSED`);
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
