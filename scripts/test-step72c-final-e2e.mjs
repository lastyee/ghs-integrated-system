// scripts/test-step72c-final-e2e.mjs
// Step 72C: Final End-to-End Application Verification Suite
// Tests actual HTTP/session/route behavior across all application flows.

import { PrismaClient } from "@prisma/client";

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
  const location = response.headers.get("location") || "";
  return { status: response.status, location, cookies };
}

async function run() {
  console.log("=== STEP 72C FINAL END-TO-END VERIFICATION TEST SUITE ===\n");

  try {
    // ========================================================
    // 0. Database Baseline Initial Capture
    // ========================================================
    console.log("0. Capturing Database Baseline...");
    const initialCounts = {
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

    record("Initial Baseline: Employers is 0", 0, initialCounts.employers, "BASELINE");
    record("Initial Baseline: Vacancies is 0", 0, initialCounts.vacancies, "BASELINE");
    record("Initial Baseline: Applications is 0", 0, initialCounts.applications, "BASELINE");
    record("Initial Baseline: Interviews is 0", 0, initialCounts.interviews, "BASELINE");
    record("Initial Baseline: Placements is 0", 0, initialCounts.placements, "BASELINE");
    record("Initial Baseline: Documents is 0", 0, initialCounts.documents, "BASELINE");
    record("Initial Baseline: Students is 21", 21, initialCounts.students, "BASELINE");
    record("Initial Baseline: Enrollments is 21", 21, initialCounts.enrollments, "BASELINE");
    record("Initial Baseline: Subjects is 6", 6, initialCounts.subjects, "BASELINE");
    record("Initial Baseline: Classes is 10", 10, initialCounts.classes, "BASELINE");
    record("Initial Baseline: Schedules is 10", 10, initialCounts.schedules, "BASELINE");
    record("Initial Baseline: Instructors is 6", 6, initialCounts.instructors, "BASELINE");
    record("Initial Baseline: Users is 2", 2, initialCounts.users, "BASELINE");

    // ========================================================
    // 1. Unauthenticated Security Flow E2E
    // ========================================================
    console.log("\n1. Testing Unauthenticated Security Flow...");
    const unauthChecks = [
      { path: "/", expectedCallback: "/" },
      { path: "/dashboard", expectedCallback: "/dashboard" },
      { path: "/students", expectedCallback: "/students" },
      { path: "/applications", expectedCallback: "/applications" },
      { path: "/placements", expectedCallback: "/placements" },
      { path: "/interviews", expectedCallback: "/interviews" },
      { path: "/attendance", expectedCallback: "/attendance" },
      { path: "/assessments", expectedCallback: "/assessments" },
      { path: "/documents", expectedCallback: "/documents" },
    ];

    for (const item of unauthChecks) {
      const res = await request(item.path, { redirect: "manual" });
      const loc = res.headers.get("location") || "";
      const isRedirect = res.status === 307 || res.status === 302;
      record(
        `Unauth: ${item.path} redirects to /login with callbackUrl`,
        true,
        isRedirect && loc.includes("/login?callbackUrl="),
        "UNAUTH"
      );
    }

    const unauthApis = [
      "/api/placements",
      "/api/applications",
      "/api/interviews",
      "/api/documents",
      "/api/vacancies",
      "/api/employers",
    ];
    for (const apiPath of unauthApis) {
      const apiRes = await request(apiPath);
      record(`Unauth API: ${apiPath} returns 401 Unauthorized`, 401, apiRes.status, "UNAUTH");
    }

    // ========================================================
    // 2. Student Authentication & Dashboard E2E
    // ========================================================
    console.log("\n2. Testing Student Login & Flow E2E...");
    const studentLogin = await login("student.demo@ghs.local", "murid123");
    record("Student Login: Credentials callback returns 302/303 redirect", true, studentLogin.status === 302 || studentLogin.status === 303, "AUTH_STUDENT");
    record("Student Login: Session cookie issued", true, studentLogin.cookies.includes("authjs.session-token") || studentLogin.cookies.includes("__Secure-authjs.session-token"), "AUTH_STUDENT");

    // Student requesting / gets role-redirected to /dashboard/student
    const stuRoot = await request("/", {
      headers: { Cookie: studentLogin.cookies },
      redirect: "manual",
    });
    record("Student Flow: Requesting / redirects to /dashboard/student (307)", true, (stuRoot.status === 307 || stuRoot.status === 302) && (stuRoot.headers.get("location") || "").includes("/dashboard/student"), "ROLE_REDIRECT");

    // Student requesting /dashboard gets role-redirected to /dashboard/student
    const stuDash = await request("/dashboard", {
      headers: { Cookie: studentLogin.cookies },
      redirect: "manual",
    });
    record("Student Flow: Requesting /dashboard redirects to /dashboard/student (307)", true, (stuDash.status === 307 || stuDash.status === 302) && (stuDash.headers.get("location") || "").includes("/dashboard/student"), "ROLE_REDIRECT");

    // Student actual dashboard render
    const stuDashPage = await request("/dashboard/student", {
      headers: { Cookie: studentLogin.cookies },
    });
    const stuDashHtml = await stuDashPage.text();
    record("Student Dashboard: /dashboard/student returns HTTP 200", 200, stuDashPage.status, "STUDENT_DASH");
    record("Student Dashboard: Renders dynamic user name (Demo Student from DB)", true, stuDashHtml.includes("Demo Student"), "STUDENT_DASH");
    record("Student Dashboard: Contains active link to attendance", true, stuDashHtml.includes('href="/attendance"'), "STUDENT_DASH");
    record("Student Dashboard: Contains active link to documents", true, stuDashHtml.includes('href="/documents"'), "STUDENT_DASH");
    record("Student Dashboard: Sidebar does not display staff-only modules", true, !stuDashHtml.includes('href="/programs"') && !stuDashHtml.includes('href="/batches"'), "STUDENT_DASH");
    record("Student Dashboard: Sidebar does not display Lowongan", false, stuDashHtml.includes('href="/vacancies"'), "STUDENT_DASH");

    // ========================================================
    // 3. Super Admin Authentication & Dashboard E2E
    // ========================================================
    console.log("\n3. Testing Super Admin Login & Flow E2E...");
    const adminLogin = await login("admin.demo@ghs.local", "superadmin123");
    record("Admin Login: Credentials callback returns 302/303 redirect", true, adminLogin.status === 302 || adminLogin.status === 303, "AUTH_ADMIN");
    record("Admin Login: Session cookie issued", true, adminLogin.cookies.includes("authjs.session-token") || adminLogin.cookies.includes("__Secure-authjs.session-token"), "AUTH_ADMIN");

    // Super Admin requesting / stays on / (status 200)
    const adminRoot = await request("/", {
      headers: { Cookie: adminLogin.cookies },
      redirect: "manual",
    });
    record("Admin Flow: Requesting / renders Overview (HTTP 200)", 200, adminRoot.status, "ADMIN_DASH");
    const adminRootHtml = await adminRoot.text();
    record("Admin Flow: Root contains Super Admin title/overview", true, adminRootHtml.includes("Ringkasan Operasional") || adminRootHtml.includes("Dashboard") || adminRootHtml.includes("GHS"), "ADMIN_DASH");

    // Super Admin requesting /dashboard redirects to / (307)
    const adminDashHub = await request("/dashboard", {
      headers: { Cookie: adminLogin.cookies },
      redirect: "manual",
    });
    record("Admin Flow: Requesting /dashboard redirects to / (307)", true, (adminDashHub.status === 307 || adminDashHub.status === 302) && (adminDashHub.headers.get("location") || "") === "/", "ROLE_REDIRECT");

    // ========================================================
    // 4. Role Dashboards Renderability
    // ========================================================
    console.log("\n4. Verifying Role Dashboard Renderability...");
    const roleDashboards = [
      { name: "Academic", path: "/dashboard/academic" },
      { name: "Instructor", path: "/dashboard/instructor" },
      { name: "Placement", path: "/dashboard/placement" },
      { name: "Management", path: "/dashboard/management" },
      { name: "Student", path: "/dashboard/student" },
    ];

    for (const dash of roleDashboards) {
      const res = await request(dash.path, { headers: { Cookie: adminLogin.cookies } });
      record(`Role Dashboard: ${dash.name} (${dash.path}) returns HTTP 200`, 200, res.status, "ROLE_DASH");
      const html = await res.text();
      record(`Role Dashboard: ${dash.name} renders non-blank body`, true, html.length > 500 && html.includes("<!DOCTYPE html>"), "ROLE_DASH");
    }

    // ========================================================
    // 5. Sidebar Navigation Consistency (Live & Accessible Routes)
    // ========================================================
    console.log("\n5. Verifying Sidebar Navigation Routes...");
    const adminRoutes = [
      "/students",
      "/programs",
      "/subjects",
      "/batches",
      "/enrollments",
      "/classes",
      "/schedules",
      "/attendance",
      "/assessments",
      "/documents",
      "/employers",
      "/vacancies",
      "/applications",
      "/interviews",
      "/placements",
    ];

    for (const r of adminRoutes) {
      const res = await request(r, { headers: { Cookie: adminLogin.cookies } });
      record(`Admin Route: ${r} returns HTTP 200`, 200, res.status, "SIDEBAR_E2E");
    }

    const studentAllowedRoutes = [
      { name: "Jadwal", path: "/schedules" },
      { name: "Kehadiran", path: "/attendance" },
      { name: "Penilaian", path: "/assessments" },
      { name: "Dokumen", path: "/documents" },
      { name: "Lamaran", path: "/applications" },
      { name: "Wawancara", path: "/interviews" },
      { name: "Penempatan", path: "/placements" },
    ];

    for (const sRoute of studentAllowedRoutes) {
      const res = await request(sRoute.path, { headers: { Cookie: studentLogin.cookies } });
      record(`Student Route: ${sRoute.name} (${sRoute.path}) returns HTTP 200`, 200, res.status, "STUDENT_ROUTES");
    }

    // ========================================================
    // 6. RBAC & Ownership Security Verification
    // ========================================================
    console.log("\n6. Verifying RBAC and Ownership Enforcement...");
    // Student blocked from staff modules
    const stuEmpRes = await request("/api/employers", { headers: { Cookie: studentLogin.cookies } });
    record("Student RBAC: GET /api/employers returns 403 Forbidden", 403, stuEmpRes.status, "RBAC");

    const stuVacRes = await request("/api/vacancies", { headers: { Cookie: studentLogin.cookies } });
    record("Student RBAC: GET /api/vacancies returns 403 Forbidden", 403, stuVacRes.status, "RBAC");

    const stuVacPost = await request("/api/vacancies", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentLogin.cookies },
      body: JSON.stringify({ title: "Test" }),
    });
    record("Student RBAC: POST /api/vacancies returns 403 Forbidden", 403, stuVacPost.status, "RBAC");

    const stuEmpPost = await request("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentLogin.cookies },
      body: JSON.stringify({ name: "Test" }),
    });
    record("Student RBAC: POST /api/employers returns 403 Forbidden", 403, stuEmpPost.status, "RBAC");

    // Student allowed to read own lists
    const stuAppRes = await request("/api/applications", { headers: { Cookie: studentLogin.cookies } });
    record("Student RBAC: GET own /api/applications returns 200", 200, stuAppRes.status, "RBAC");

    const stuIntRes = await request("/api/interviews", { headers: { Cookie: studentLogin.cookies } });
    record("Student RBAC: GET own /api/interviews returns 200", 200, stuIntRes.status, "RBAC");

    const stuPlcRes = await request("/api/placements", { headers: { Cookie: studentLogin.cookies } });
    record("Student RBAC: GET own /api/placements returns 200", 200, stuPlcRes.status, "RBAC");

    // ========================================================
    // 7. Method Disallow (405 Method Not Allowed) Verification
    // ========================================================
    console.log("\n7. Verifying Method Not Allowed (405) Protection...");
    const disallowedMethods = [
      { path: "/api/employers", method: "DELETE" },
      { path: "/api/vacancies", method: "DELETE" },
      { path: "/api/applications", method: "DELETE" },
      { path: "/api/interviews", method: "DELETE" },
      { path: "/api/placements", method: "DELETE" },
      { path: "/api/documents", method: "DELETE" },
    ];

    for (const d of disallowedMethods) {
      const res = await request(d.path, {
        method: d.method,
        headers: { Cookie: adminLogin.cookies },
      });
      record(`Method Security: ${d.method} ${d.path} returns 405 Method Not Allowed`, 405, res.status, "SECURITY_405");
    }

    // ========================================================
    // 8. Logout and Post-Logout Invalidation E2E
    // ========================================================
    console.log("\n8. Verifying Logout and Session Invalidation...");
    const csrfRes = await request("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    const logoutRes = await request("/api/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: studentLogin.cookies,
      },
      body: new URLSearchParams({ csrfToken, json: "true" }),
      redirect: "manual",
    });
    record("Logout E2E: Signout returns 200/302/303 redirect", true, logoutRes.status === 200 || logoutRes.status === 302 || logoutRes.status === 303, "LOGOUT");

    // Using cleared cookies to access protected page
    const postLogoutPage = await request("/dashboard/student", { redirect: "manual" });
    record("Post-Logout: Accessing /dashboard/student redirects to /login", true, postLogoutPage.status === 307 || postLogoutPage.status === 302, "LOGOUT");

    const postLogoutApi = await request("/api/applications");
    record("Post-Logout: Accessing /api/applications returns 401 Unauthorized", 401, postLogoutApi.status, "LOGOUT");

    // ========================================================
    // 9. Final Database Baseline Verification
    // ========================================================
    console.log("\n9. Verifying Database Baseline Integrity...");
    const finalCounts = {
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

    record("Final Baseline: Employers remains 0", 0, finalCounts.employers, "DB_INTEGRITY");
    record("Final Baseline: Vacancies remains 0", 0, finalCounts.vacancies, "DB_INTEGRITY");
    record("Final Baseline: Applications remains 0", 0, finalCounts.applications, "DB_INTEGRITY");
    record("Final Baseline: Interviews remains 0", 0, finalCounts.interviews, "DB_INTEGRITY");
    record("Final Baseline: Placements remains 0", 0, finalCounts.placements, "DB_INTEGRITY");
    record("Final Baseline: Documents remains 0", 0, finalCounts.documents, "DB_INTEGRITY");
    record("Final Baseline: Students remains 21", 21, finalCounts.students, "DB_INTEGRITY");
    record("Final Baseline: Enrollments remains 21", 21, finalCounts.enrollments, "DB_INTEGRITY");
    record("Final Baseline: Subjects remains 6", 6, finalCounts.subjects, "DB_INTEGRITY");
    record("Final Baseline: Classes remains 10", 10, finalCounts.classes, "DB_INTEGRITY");
    record("Final Baseline: Schedules remains 10", 10, finalCounts.schedules, "DB_INTEGRITY");
    record("Final Baseline: Instructors remains 6", 6, finalCounts.instructors, "DB_INTEGRITY");
    record("Final Baseline: Users remains 2", 2, finalCounts.users, "DB_INTEGRITY");

  } catch (error) {
    console.error("Test execution encountered an error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n==========================================");
  console.log(`TOTAL E2E ASSERTIONS: ${results.length}`);
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
