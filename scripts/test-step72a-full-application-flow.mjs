// scripts/test-step72a-full-application-flow.mjs
// Step 72A & 72B: Full Application Flow & Navigation Hardening Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

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
  return { status: response.status, location, cookies };
}

async function run() {
  console.log("=== STEP 72 FULL APPLICATION FLOW HARDENING TEST ===\n");

  try {
    // ==========================================
    // 1. Database Baseline Pre-Check
    // ==========================================
    console.log("1. Checking Database Baseline...");
    const preCounts = {
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      instructors: await prisma.instructor.count(),
      users: await prisma.user.count(),
    };

    record("Baseline: Employers is 0", 0, preCounts.employers);
    record("Baseline: Vacancies is 0", 0, preCounts.vacancies);
    record("Baseline: Applications is 0", 0, preCounts.applications);
    record("Baseline: Interviews is 0", 0, preCounts.interviews);
    record("Baseline: Placements is 0", 0, preCounts.placements);
    record("Baseline: Documents is 0", 0, preCounts.documents);
    record("Baseline: Students is 21", 21, preCounts.students);
    record("Baseline: Enrollments is 21", 21, preCounts.enrollments);
    record("Baseline: Subjects is 6", 6, preCounts.subjects);
    record("Baseline: Classes is 10", 10, preCounts.classes);
    record("Baseline: Schedules is 10", 10, preCounts.schedules);
    record("Baseline: Instructors is 6", 6, preCounts.instructors);
    record("Baseline: Users is 2", 2, preCounts.users);

    // ==========================================
    // 2. Authentication Flow Audit
    // ==========================================
    console.log("\n2. Auditing Authentication Flow...");
    const loginPageRes = await request("/login");
    const loginHtml = await loginPageRes.text();

    record("Auth: /login returns HTTP 200", 200, loginPageRes.status);
    record("Auth: /login has email input", true, loginHtml.includes('name="email"'));
    record("Auth: /login has password input", true, loginHtml.includes('name="password"'));
    record("Auth: /login has submit button", true, loginHtml.includes('type="submit"'));
    record("Auth: /login has Super Admin demo button", true, loginHtml.includes("admin.demo@ghs.local"));
    record("Auth: /login has Student demo button", true, loginHtml.includes("student.demo@ghs.local"));

    // Invalid credentials attempt
    const invalidLogin = await login("admin.demo@ghs.local", "wrongpassword");
    record("Auth: Invalid credential returns redirect with error", true, invalidLogin.location.includes("error=CredentialsSignin"));

    // Valid Super Admin login
    const superAdminLogin = await login("admin.demo@ghs.local", "superadmin123");
    record("Auth: Valid Super Admin login returns 302/303 redirect", true, superAdminLogin.status === 302 || superAdminLogin.status === 303);
    record("Auth: Super Admin session cookie issued", true, superAdminLogin.cookies.includes("authjs.session-token") || superAdminLogin.cookies.includes("__Secure-authjs.session-token"));

    // Valid Student login
    const studentLogin = await login("student.demo@ghs.local", "murid123");
    record("Auth: Valid Student login returns 302/303 redirect", true, studentLogin.status === 302 || studentLogin.status === 303);
    record("Auth: Student session cookie issued", true, studentLogin.cookies.includes("authjs.session-token") || studentLogin.cookies.includes("__Secure-authjs.session-token"));

    // Unauthenticated access to protected routes
    const unauthRoot = await request("/", { redirect: "manual" });
    record("Auth: Unauthenticated / redirects to /login", true, unauthRoot.status === 307 || unauthRoot.status === 302);
    const unauthLoc = unauthRoot.headers.get("location") || "";
    record("Auth: Unauthenticated redirect includes callbackUrl", true, unauthLoc.includes("/login?callbackUrl="));

    const unauthApi = await request("/api/placements");
    record("Auth: Unauthenticated API request returns 401", 401, unauthApi.status);

    // ==========================================
    // 3. Role Redirect & Dashboard Route Audit (Bug 1 & Bug 2 Fixes)
    // ==========================================
    console.log("\n3. Auditing Role Flow & Dashboards...");

    // Redirection location from credentials login
    record("Role Flow: Super Admin login redirects to / (Home)", true, superAdminLogin.location.endsWith("/"));
    record("Role Flow: Student login callback succeeds with redirect", true, studentLogin.location.endsWith("/"));

    // Server-side role redirect when requesting /
    const studentRootRes = await request("/", {
      headers: { Cookie: studentLogin.cookies },
      redirect: "manual",
    });
    record("Role Flow: Student requesting / redirects to /dashboard/student (Bug 2)", true, (studentRootRes.status === 307 || studentRootRes.status === 302) && (studentRootRes.headers.get("location") || "").includes("/dashboard/student"));

    const superAdminRootRes = await request("/", {
      headers: { Cookie: superAdminLogin.cookies },
      redirect: "manual",
    });
    record("Role Flow: Super Admin requesting / stays on / (status 200)", 200, superAdminRootRes.status);

    // Check /dashboard route (Bug 1 Fix: Implemented, role-aware, not 404)
    const saDashboardRes = await request("/dashboard", {
      headers: { Cookie: superAdminLogin.cookies },
      redirect: "manual",
    });
    record("Dashboard Bug 1: /dashboard route does not return 404", false, saDashboardRes.status === 404);
    record("Dashboard Bug 1: Super Admin /dashboard redirects to /", true, (saDashboardRes.status === 307 || saDashboardRes.status === 302) && (saDashboardRes.headers.get("location") || "") === "/");

    const stuDashboardRes = await request("/dashboard", {
      headers: { Cookie: studentLogin.cookies },
      redirect: "manual",
    });
    record("Dashboard Bug 1: Student /dashboard redirects to /dashboard/student", true, (stuDashboardRes.status === 307 || stuDashboardRes.status === 302) && (stuDashboardRes.headers.get("location") || "").includes("/dashboard/student"));

    const unauthDashboardRes = await request("/dashboard", {
      redirect: "manual",
    });
    record("Dashboard Bug 1: Unauthenticated /dashboard redirects to /login?callbackUrl=/dashboard", true, (unauthDashboardRes.status === 307 || unauthDashboardRes.status === 302) && (unauthDashboardRes.headers.get("location") || "").includes("/login?callbackUrl="));

    // Check all role dashboard routes
    const academicRes = await request("/dashboard/academic", { headers: { Cookie: superAdminLogin.cookies } });
    record("Dashboard: /dashboard/academic returns HTTP 200", 200, academicRes.status);

    const instructorRes = await request("/dashboard/instructor", { headers: { Cookie: superAdminLogin.cookies } });
    record("Dashboard: /dashboard/instructor returns HTTP 200", 200, instructorRes.status);

    const managementRes = await request("/dashboard/management", { headers: { Cookie: superAdminLogin.cookies } });
    record("Dashboard: /dashboard/management returns HTTP 200", 200, managementRes.status);

    const placementRes = await request("/dashboard/placement", { headers: { Cookie: superAdminLogin.cookies } });
    record("Dashboard: /dashboard/placement returns HTTP 200", 200, placementRes.status);

    const studentDashRes = await request("/dashboard/student", { headers: { Cookie: studentLogin.cookies } });
    record("Dashboard: /dashboard/student returns HTTP 200", 200, studentDashRes.status);

    // ==========================================
    // 4. Sidebar Mapped Routes Audit
    // ==========================================
    console.log("\n4. Auditing Sidebar Routes...");
    const sidebarRoutes = [
      { name: "Peserta", path: "/students" },
      { name: "Program", path: "/programs" },
      { name: "Mata Pelajaran", path: "/subjects" },
      { name: "Batch", path: "/batches" },
      { name: "Enrollment", path: "/enrollments" },
      { name: "Kelas", path: "/classes" },
      { name: "Jadwal", path: "/schedules" },
      { name: "Kehadiran", path: "/attendance" },
      { name: "Penilaian", path: "/assessments" },
      { name: "Dokumen", path: "/documents" },
      { name: "Perusahaan", path: "/employers" },
      { name: "Lowongan", path: "/vacancies" },
      { name: "Lamaran", path: "/applications" },
      { name: "Wawancara", path: "/interviews" },
      { name: "Penempatan", path: "/placements" },
    ];

    for (const route of sidebarRoutes) {
      const res = await request(route.path, { headers: { Cookie: superAdminLogin.cookies } });
      record(`Sidebar Route: ${route.name} (${route.path}) returns HTTP 200`, 200, res.status);
    }

    // ==========================================
    // 5. Sidebar Dead Routes / Missing itemRoutes Audit (Bug 4 Fix)
    // ==========================================
    console.log("\n5. Auditing Sidebar Dead Action Buttons...");
    const sidebarSrc = fs.readFileSync(
      path.join(process.cwd(), "components/layout/app-sidebar.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const mockDataSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/mock-data.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");

    record("Dead Sidebar Bug 4: 'Verifikasi' removed from mock-data", false, mockDataSrc.includes('"Verifikasi"'));
    record("Dead Sidebar Bug 4: 'Laporan' group removed from mock-data", false, mockDataSrc.includes('"Laporan"'));
    record("Dead Sidebar Bug 4: 'Pengguna' removed from mock-data", false, mockDataSrc.includes('"Pengguna"'));
    record("Dead Sidebar Bug 4: 'Role & Permission' removed from mock-data", false, mockDataSrc.includes('"Role & Permission"'));
    record("Dead Sidebar Bug 4: 'Audit Log' removed from mock-data", false, mockDataSrc.includes('"Audit Log"'));
    const studentNavBlock = (mockDataSrc.match(/export const studentNavigationGroups[\s\S]*?\];/) || [""])[0];
    record("Dead Sidebar Bug 4: 'Progress Training' removed from student navigation", false, studentNavBlock.includes('"Progress Training"'));
    record("Dead Sidebar Bug 4: 'Sertifikat' removed from student navigation", false, studentNavBlock.includes('"Sertifikat"'));
    record("Dead Sidebar Bug 4: Sidebar does not render dead button fallback for unmapped items", false, /if\s*\(!href\)\s*\{\s*return\s*\(?\s*<button/.test(sidebarSrc));

    // ==========================================
    // 6. Module Detail Routes & Back Navigation Audit
    // ==========================================
    console.log("\n6. Auditing Detail Routes & Back Navigation...");
    const detailPages = [
      { name: "Vacancies Detail", file: "components/vacancies/vacancy-detail.tsx", expectedBack: 'href="/vacancies"' },
      { name: "Subjects Detail", file: "components/subjects/subject-detail.tsx", expectedBack: 'href="/subjects"' },
      { name: "Students Detail", file: "components/students/student-detail.tsx", expectedBack: 'href="/students"' },
      { name: "Schedules Detail", file: "components/schedules/schedule-detail.tsx", expectedBack: 'href="/schedules"' },
      { name: "Programs Detail", file: "components/programs/program-detail.tsx", expectedBack: 'href="/programs"' },
      { name: "Placements Detail", file: "components/placements/placement-detail.tsx", expectedBack: 'href="/placements"' },
      { name: "Interviews Detail", file: "components/interviews/interview-detail.tsx", expectedBack: 'href="/interviews"' },
      { name: "Enrollments Detail", file: "components/enrollments/enrollment-detail.tsx", expectedBack: 'href="/enrollments"' },
      { name: "Employers Detail", file: "components/employers/employer-detail.tsx", expectedBack: 'href="/employers"' },
      { name: "Documents Detail", file: "components/documents/document-detail.tsx", expectedBack: 'href="/documents"' },
      { name: "Classes Detail", file: "components/classes/class-detail.tsx", expectedBack: 'href="/classes"' },
      { name: "Batches Detail", file: "components/batches/batch-detail.tsx", expectedBack: 'href="/batches"' },
      { name: "Attendance Session Detail", file: "components/attendance/attendance-session-detail.tsx", expectedBack: 'href="/attendance"' },
      { name: "Assessments Detail", file: "components/assessments/assessment-detail.tsx", expectedBack: 'href="/assessments"' },
      { name: "Applications Detail", file: "components/applications/application-detail.tsx", expectedBack: 'href="/applications"' },
    ];

    for (const detail of detailPages) {
      const src = fs.readFileSync(path.join(process.cwd(), detail.file), "utf8");
      record(`Back Nav: ${detail.name} points to parent route`, true, src.includes(detail.expectedBack));
    }

    // ==========================================
    // 7. Interactive Elements & Dead Action Audit (Bug 5 Fix)
    // ==========================================
    console.log("\n7. Auditing Interactive Elements & Dead Actions...");
    const headerSrc = fs.readFileSync(
      path.join(process.cwd(), "components/layout/app-header.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const instructorDashSrc = fs.readFileSync(
      path.join(process.cwd(), "components/dashboard/instructor-dashboard.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const studentDashSrc = fs.readFileSync(
      path.join(process.cwd(), "components/dashboard/student-dashboard.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const recentActivitySrc = fs.readFileSync(
      path.join(process.cwd(), "components/dashboard/recent-activity.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");

    record("Bug 5 Fix: Header Notification Bell dead button removed", false, headerSrc.includes('aria-label="Lihat notifikasi"'));
    record("Bug 5 Fix: Header Profile Chevron fake dropdown removed", false, headerSrc.includes('ChevronDown'));
    record("Bug 5 Fix: Instructor Dashboard 'Isi Kehadiran' is active Link to /attendance", true, instructorDashSrc.includes('href="/attendance"') && instructorDashSrc.includes("Isi Kehadiran"));
    record("Bug 5 Fix: Instructor Dashboard 'Lihat Penilaian' is active Link to /assessments", true, instructorDashSrc.includes('href="/assessments"') && instructorDashSrc.includes("Lihat Penilaian"));
    record("Bug 5 Fix: Student Dashboard 'Lihat Kehadiran' is active Link to /attendance", true, studentDashSrc.includes('href="/attendance"') && studentDashSrc.includes("Lihat Kehadiran"));
    record("Bug 5 Fix: Student Dashboard 'Lihat Semua Dokumen' is active Link to /documents", true, studentDashSrc.includes('href="/documents"') && studentDashSrc.includes("Lihat Semua Dokumen"));
    record("Bug 5 Fix: Recent Activity 'Lihat semua' dead button removed", false, recentActivitySrc.includes("Lihat semua"));

    // ==========================================
    // 8. Mock Mode UI Audit
    // ==========================================
    console.log("\n8. Auditing Mock Mode in Frontend Modules...");
    const studentPageSrc = fs.readFileSync(path.join(process.cwd(), "components/students/students-page.tsx"), "utf8");
    const programPageSrc = fs.readFileSync(path.join(process.cwd(), "components/programs/programs-page.tsx"), "utf8");
    const subjectPageSrc = fs.readFileSync(path.join(process.cwd(), "components/subjects/subjects-page.tsx"), "utf8");
    const batchPageSrc = fs.readFileSync(path.join(process.cwd(), "components/batches/batches-page.tsx"), "utf8");
    const classPageSrc = fs.readFileSync(path.join(process.cwd(), "components/classes/classes-page.tsx"), "utf8");
    const enrollmentPageSrc = fs.readFileSync(path.join(process.cwd(), "components/enrollments/enrollments-page.tsx"), "utf8");

    const isStudentValid = studentPageSrc.includes("/api/students") || studentPageSrc.includes("Mock mode");
    const isProgramValid = programPageSrc.includes("/api/programs") || programPageSrc.includes("Mock mode");
    const isSubjectValid = subjectPageSrc.includes("/api/subjects") || subjectPageSrc.includes("Mock mode");
    const isBatchValid = batchPageSrc.includes("/api/batches") || batchPageSrc.includes("Mock mode");
    const isClassValid = classPageSrc.includes("/api/classes") || classPageSrc.includes("Mock mode");
    const isEnrollmentValid = enrollmentPageSrc.includes("/api/enrollments") || enrollmentPageSrc.includes("Mock mode");

    record("Data Source: Students module verified (live or mock)", true, isStudentValid);
    record("Data Source: Programs module verified (live or mock)", true, isProgramValid);
    record("Data Source: Subjects module verified (live or mock)", true, isSubjectValid);
    record("Data Source: Batches module verified (live or mock)", true, isBatchValid);
    record("Data Source: Classes module verified (live or mock)", true, isClassValid);
    record("Data Source: Enrollments module verified (live or mock)", true, isEnrollmentValid);

    // Live modules confirmation
    const schedulePageSrc = fs.readFileSync(path.join(process.cwd(), "components/schedules/schedules-page.tsx"), "utf8");
    const placementPageSrc = fs.readFileSync(path.join(process.cwd(), "components/placements/placements-page.tsx"), "utf8");
    const interviewPageSrc = fs.readFileSync(path.join(process.cwd(), "components/interviews/interviews-page.tsx"), "utf8");
    const applicationPageSrc = fs.readFileSync(path.join(process.cwd(), "components/applications/applications-page.tsx"), "utf8");

    record("Live Data: Schedules uses live /api/schedules", true, schedulePageSrc.includes("/api/schedules"));
    record("Live Data: Placements uses live /api/placements", true, placementPageSrc.includes("/api/placements"));
    record("Live Data: Interviews uses live /api/interviews", true, interviewPageSrc.includes("/api/interviews"));
    record("Live Data: Applications uses live /api/applications", true, applicationPageSrc.includes("/api/applications"));

    // ==========================================
    // 9. RBAC & Permission Consistency (Bug 3 Fix)
    // ==========================================
    console.log("\n9. Auditing RBAC & Permission Consistency...");
    // Super Admin API access
    const saVacRes = await request("/api/vacancies", { headers: { Cookie: superAdminLogin.cookies } });
    record("RBAC: Super Admin can read /api/vacancies", 200, saVacRes.status);

    const saEmpRes = await request("/api/employers", { headers: { Cookie: superAdminLogin.cookies } });
    record("RBAC: Super Admin can read /api/employers", 200, saEmpRes.status);

    const saAppRes = await request("/api/applications", { headers: { Cookie: superAdminLogin.cookies } });
    record("RBAC: Super Admin can read /api/applications", 200, saAppRes.status);

    // Student API access
    const stuAppRes = await request("/api/applications", { headers: { Cookie: studentLogin.cookies } });
    record("RBAC: Student can read own /api/applications", 200, stuAppRes.status);

    const stuEmpRes = await request("/api/employers", { headers: { Cookie: studentLogin.cookies } });
    record("RBAC: Student cannot read /api/employers (403)", 403, stuEmpRes.status);

    // Bug 3 Resolution: Backend RBAC preserved (403), while Student sidebar no longer has "Lowongan"
    const stuVacRes = await request("/api/vacancies", { headers: { Cookie: studentLogin.cookies } });
    record("Bug 3 RBAC: Student cannot read /api/vacancies (403 preserved)", 403, stuVacRes.status);
    record("Bug 3 Sidebar: Student sidebar does not contain 'Lowongan' (no 403 mismatch)", false, mockDataSrc.includes('"Lowongan"') && /studentNavigationGroups[\s\S]*?"Lowongan"/.test(mockDataSrc));

    // ==========================================
    // 10. User Identity Dynamism (Bug 6 Fix)
    // ==========================================
    console.log("\n10. Auditing User Identity Dynamism...");
    const studentDashFile = fs.readFileSync(path.join(process.cwd(), "app/dashboard/student/page.tsx"), "utf8");
    const instructorDashFile = fs.readFileSync(path.join(process.cwd(), "app/dashboard/instructor/page.tsx"), "utf8");
    const managementDashFile = fs.readFileSync(path.join(process.cwd(), "app/dashboard/management/page.tsx"), "utf8");
    const appShellFile = fs.readFileSync(path.join(process.cwd(), "components/layout/app-shell.tsx"), "utf8");

    record("Bug 6 Identity: Student dashboard has no hardcoded 'Andi Pratama'", false, studentDashSrc.includes("Andi Pratama") || studentDashFile.includes("Andi Pratama"));
    record("Bug 6 Identity: Student dashboard has no hardcoded 'AP'", false, studentDashSrc.includes('"AP"') || studentDashFile.includes('"AP"'));
    record("Bug 6 Identity: Instructor page has no hardcoded 'Budi Santoso'", false, instructorDashFile.includes("Budi Santoso"));
    record("Bug 6 Identity: Instructor page has no hardcoded 'BS'", false, instructorDashFile.includes('"BS"'));
    record("Bug 6 Identity: Management page has no hardcoded 'Siti Rahma'", false, managementDashFile.includes("Siti Rahma"));
    record("Bug 6 Identity: Management page has no hardcoded 'SR'", false, managementDashFile.includes('"SR"'));
    record("Bug 6 Identity: AppShell uses requireAuthenticatedUser()", true, appShellFile.includes("requireAuthenticatedUser()"));
    record("Bug 6 Identity: AppShell dynamically computes initials with email fallback", true, appShellFile.includes("getInitials(user.name, user.email)"));

    // ==========================================
    // 11. Logout & Session Invalidation
    // ==========================================
    console.log("\n11. Auditing Logout & Invalidation...");
    const logoutRes = await request("/api/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: studentLogin.cookies,
      },
      body: new URLSearchParams({
        csrfToken: (await (await request("/api/auth/csrf")).json()).csrfToken,
        json: "true",
      }),
      redirect: "manual",
    });
    record("Logout: Signout returns 200/302", true, logoutRes.status === 200 || logoutRes.status === 302 || logoutRes.status === 303);

    // ==========================================
    // 12. Final Database Baseline Verification
    // ==========================================
    console.log("\n12. Final Database Baseline Check...");
    const postCounts = {
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      instructors: await prisma.instructor.count(),
      users: await prisma.user.count(),
    };

    record("Post-Test Baseline: Employers is 0", 0, postCounts.employers);
    record("Post-Test Baseline: Vacancies is 0", 0, postCounts.vacancies);
    record("Post-Test Baseline: Applications is 0", 0, postCounts.applications);
    record("Post-Test Baseline: Interviews is 0", 0, postCounts.interviews);
    record("Post-Test Baseline: Placements is 0", 0, postCounts.placements);
    record("Post-Test Baseline: Documents is 0", 0, postCounts.documents);
    record("Post-Test Baseline: Students is 21", 21, postCounts.students);
    record("Post-Test Baseline: Enrollments is 21", 21, postCounts.enrollments);
    record("Post-Test Baseline: Subjects is 6", 6, postCounts.subjects);
    record("Post-Test Baseline: Classes is 10", 10, postCounts.classes);
    record("Post-Test Baseline: Schedules is 10", 10, postCounts.schedules);
    record("Post-Test Baseline: Instructors is 6", 6, postCounts.instructors);
    record("Post-Test Baseline: Users is 2", 2, postCounts.users);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n==========================================");
  console.log(`TOTAL AUDIT ASSERTIONS: ${results.length}`);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log("==========================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

run();
