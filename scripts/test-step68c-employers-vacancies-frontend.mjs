// scripts/test-step68c-employers-vacancies-frontend.mjs
// Step 68C: Employer & Vacancy Frontend Integration & Hardening Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP68C_EMPLOYERS_VACANCIES_FRONTEND_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP68C_EMPLOYERS_VACANCIES_FRONTEND_CONFIRM_DATABASE",
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
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 68C EMPLOYER & VACANCY FRONTEND INTEGRATION TEST ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];

  try {
    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    async function createTempUser(roleName, email) {
      const roleId = roleMap.get(roleName);
      if (!roleId) throw new Error(`Role ${roleName} not found`);
      const user = await prisma.user.create({
        data: {
          email,
          name: `Temp ${roleName}`,
          passwordHash: tempPasswordHash,
          roleId,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("1. Authenticating demo users & test accounts...");
    const studentCookies = await login("student.demo@ghs.local", studentPassword);

    const academicUser = await createTempUser("ACADEMIC_STAFF", "test.academic68c@ghs.test");
    const managementUser = await createTempUser("MANAGEMENT", "test.management68c@ghs.test");
    const placementUser = await createTempUser("PLACEMENT_STAFF", "test.placement68c@ghs.test");
    const instructorUser = await createTempUser("INSTRUCTOR", "test.instructor68c@ghs.test");

    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);

    console.log("\n2. Checking Frontend Code Contracts & Architecture...");

    const employersPageSrc = fs.readFileSync(path.resolve("components/employers/employers-page.tsx"), "utf-8");
    const employerDetailSrc = fs.readFileSync(path.resolve("components/employers/employer-detail.tsx"), "utf-8");
    const vacanciesPageSrc = fs.readFileSync(path.resolve("components/vacancies/vacancies-page.tsx"), "utf-8");
    const vacancyDetailSrc = fs.readFileSync(path.resolve("components/vacancies/vacancy-detail.tsx"), "utf-8");
    const placementDashSrc = fs.readFileSync(path.resolve("components/dashboard/placement-dashboard.tsx"), "utf-8");
    const mockDataSrc = fs.readFileSync(path.resolve("lib/mock-data.ts"), "utf-8");

    // ==========================================
    // 1 Employer page unauthorized
    // ==========================================
    console.log("\n--- TEST 1: Employer page unauthorized ---");
    const unauthEmpPage = await request("/employers", { redirect: "manual" });
    record("1.1 Unauthenticated /employers redirects to login", true, unauthEmpPage.status === 307 || unauthEmpPage.status === 302);
    record("1.2 employers-page.tsx has unauthorized state", true, employersPageSrc.includes("data-testid=\"unauthorized-state\""));

    // ==========================================
    // 2 Vacancy page unauthorized
    // ==========================================
    console.log("\n--- TEST 2: Vacancy page unauthorized ---");
    const unauthVacPage = await request("/vacancies", { redirect: "manual" });
    record("2.1 Unauthenticated /vacancies redirects to login", true, unauthVacPage.status === 307 || unauthVacPage.status === 302);
    record("2.2 vacancies-page.tsx has unauthorized state", true, vacanciesPageSrc.includes("data-testid=\"unauthorized-state\""));

    // ==========================================
    // 3 Employer list renders real API
    // ==========================================
    console.log("\n--- TEST 3: Employer list renders real API ---");
    record("3.1 employers-page.tsx fetches /api/employers", true, employersPageSrc.includes("fetch(\"/api/employers\")"));
    record("3.2 employers-page.tsx does not import mock-data", false, employersPageSrc.includes("@/lib/mock-data"));
    const empApiRes = await request("/api/employers", { headers: { Cookie: placementCookies } });
    record("3.3 Placement Staff can fetch employers API (200)", 200, empApiRes.status);
    const empData = await empApiRes.json();
    record("3.4 API returns array", true, Array.isArray(empData));

    // ==========================================
    // 4 Vacancy list renders real API
    // ==========================================
    console.log("\n--- TEST 4: Vacancy list renders real API ---");
    record("4.1 vacancies-page.tsx fetches /api/vacancies", true, vacanciesPageSrc.includes("/api/vacancies"));
    record("4.2 vacancies-page.tsx does not import mock-data", false, vacanciesPageSrc.includes("@/lib/mock-data"));
    const vacApiRes = await request("/api/vacancies", { headers: { Cookie: placementCookies } });
    record("4.3 Placement Staff can fetch vacancies API (200)", 200, vacApiRes.status);
    const vacData = await vacApiRes.json();
    record("4.4 Vacancy API returns array", true, Array.isArray(vacData));

    // ==========================================
    // 5 Employer search
    // ==========================================
    console.log("\n--- TEST 5: Employer search ---");
    record("5.1 employers-page.tsx has search input", true, employersPageSrc.includes("id=\"employer-search-input\""));
    record("5.2 employers-page.tsx filters employers by query", true, employersPageSrc.includes("filteredEmployers") && employersPageSrc.includes("toLowerCase()"));

    // ==========================================
    // 6 Vacancy status filter
    // ==========================================
    console.log("\n--- TEST 6: Vacancy status filter ---");
    record("6.1 vacancies-page.tsx has status filter dropdown", true, vacanciesPageSrc.includes("id=\"filter-vacancy-status\""));
    record("6.2 vacancies-page.tsx appends status to API query", true, vacanciesPageSrc.includes("params.append(\"status\""));
    const vacOpenRes = await request("/api/vacancies?status=OPEN", { headers: { Cookie: placementCookies } });
    record("6.3 Vacancy status filter API responds with 200", 200, vacOpenRes.status);

    // ==========================================
    // 7 Vacancy employer filter
    // ==========================================
    console.log("\n--- TEST 7: Vacancy employer filter ---");
    record("7.1 vacancies-page.tsx has employer filter dropdown", true, vacanciesPageSrc.includes("id=\"filter-vacancy-employer\""));
    record("7.2 vacancies-page.tsx appends employerId to API query", true, vacanciesPageSrc.includes("params.append(\"employerId\""));

    // ==========================================
    // 8 Employer create UI/API
    // ==========================================
    console.log("\n--- TEST 8: Employer create UI/API ---");
    record("8.1 employers-page.tsx has create button and modal", true, employersPageSrc.includes("id=\"btn-create-employer\"") && employersPageSrc.includes("form-employer-name"));
    record("8.2 employers-page.tsx sends POST to /api/employers", true, employersPageSrc.includes("POST") && employersPageSrc.includes("/api/employers"));

    const createEmpRes = await request("/api/employers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        name: "PT Hotel Sukabumi Permai 68C",
        companyInfo: "Resort bintang 4 di Sukabumi",
        address: "Jl. Raya Cisolok No. 10",
        contactName: "Budi Santoso",
        contactEmail: "hrd@sukabumipermai.test",
        contactPhone: "081234567890",
      }),
    });
    record("8.3 Placement Staff POST /api/employers returns 201", 201, createEmpRes.status);
    const createdEmp = await createEmpRes.json();
    createdEmployerIds.push(createdEmp.id);
    record("8.4 Created employer has valid ID", true, Boolean(createdEmp.id));

    // ==========================================
    // 9 Employer update UI/API
    // ==========================================
    console.log("\n--- TEST 9: Employer update UI/API ---");
    record("9.1 employers-page.tsx has edit button calling PATCH", true, employersPageSrc.includes("PATCH") && employersPageSrc.includes("openEditModal"));
    record("9.2 employer-detail.tsx has edit button calling PATCH", true, employerDetailSrc.includes("PATCH") && employerDetailSrc.includes("/api/employers/"));

    const updateEmpRes = await request(`/api/employers/${createdEmp.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        companyInfo: "Resort bintang 4 ternama di kawasan pantai Sukabumi",
      }),
    });
    record("9.3 Placement Staff PATCH /api/employers/[id] returns 200", 200, updateEmpRes.status);
    const updatedEmp = await updateEmpRes.json();
    record("9.4 Employer info updated successfully", "Resort bintang 4 ternama di kawasan pantai Sukabumi", updatedEmp.companyInfo);

    // ==========================================
    // 10 Vacancy create UI/API
    // ==========================================
    console.log("\n--- TEST 10: Vacancy create UI/API ---");
    record("10.1 vacancies-page.tsx has create button and form inputs", true, vacanciesPageSrc.includes("id=\"btn-create-vacancy\"") && vacanciesPageSrc.includes("id=\"form-vacancy-title\""));
    record("10.2 vacancies-page.tsx sends POST to /api/vacancies", true, vacanciesPageSrc.includes("POST") && vacanciesPageSrc.includes("/api/vacancies"));

    const createVacRes = await request("/api/vacancies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        employerId: createdEmp.id,
        title: "Front Desk Officer 68C",
        description: "Menyambut tamu hotel dan melayani check-in/check-out",
        requirements: "Lulusan program perhotelan GHS, fasih bahasa Inggris",
        status: "OPEN",
      }),
    });
    record("10.3 Placement Staff POST /api/vacancies returns 201", 201, createVacRes.status);
    const createdVac = await createVacRes.json();
    createdVacancyIds.push(createdVac.id);
    record("10.4 Created vacancy has valid ID and OPEN status", "OPEN", createdVac.status);

    // ==========================================
    // 11 Vacancy update UI/API
    // ==========================================
    console.log("\n--- TEST 11: Vacancy update UI/API ---");
    record("11.1 vacancies-page.tsx & vacancy-detail.tsx have edit form calling PATCH", true, vacanciesPageSrc.includes("PATCH") && vacancyDetailSrc.includes("PATCH"));

    const updateVacRes = await request(`/api/vacancies/${createdVac.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        description: "Deskripsi diperbarui: Menyambut tamu hotel VIP dan reguler",
      }),
    });
    record("11.2 Placement Staff PATCH /api/vacancies/[id] returns 200", 200, updateVacRes.status);
    const updatedVac = await updateVacRes.json();
    record("11.3 Vacancy description updated successfully", "Deskripsi diperbarui: Menyambut tamu hotel VIP dan reguler", updatedVac.description);

    // ==========================================
    // 12 Vacancy close UI/API
    // ==========================================
    console.log("\n--- TEST 12: Vacancy close UI/API ---");
    record("12.1 vacancies-page.tsx has handleCloseVacancy function", true, vacanciesPageSrc.includes("handleCloseVacancy"));
    record("12.2 vacancy-detail.tsx has handleCloseVacancy button", true, vacancyDetailSrc.includes("id=\"btn-close-vacancy\""));

    const closeVacRes = await request(`/api/vacancies/${createdVac.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        status: "CLOSED",
      }),
    });
    record("12.3 Placement Staff PATCH /api/vacancies/[id] { status: 'CLOSED' } returns 200", 200, closeVacRes.status);
    const closedVac = await closeVacRes.json();
    record("12.4 Vacancy status is now CLOSED", "CLOSED", closedVac.status);

    // ==========================================
    // 13 Employer detail
    // ==========================================
    console.log("\n--- TEST 13: Employer detail ---");
    record("13.1 employer-detail.tsx fetches /api/employers/[id]", true, employerDetailSrc.includes("fetch(`/api/employers/${employerId}`)"));
    record("13.2 employer-detail.tsx displays company information and vacancies", true, employerDetailSrc.includes("id=\"detail-employer-name\"") && employerDetailSrc.includes("employer.vacancies"));
    record("13.3 employer-detail.tsx does not display application/placement details", false, employerDetailSrc.includes("applications") || employerDetailSrc.includes("placements"));

    const getEmpDetailRes = await request(`/api/employers/${createdEmp.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("13.4 GET /api/employers/[id] returns 200", 200, getEmpDetailRes.status);
    const empDetailData = await getEmpDetailRes.json();
    record("13.5 Employer detail returns related vacancies list", true, Array.isArray(empDetailData.vacancies) && empDetailData.vacancies.length === 1);

    // ==========================================
    // 14 Vacancy detail
    // ==========================================
    console.log("\n--- TEST 14: Vacancy detail ---");
    record("14.1 vacancy-detail.tsx fetches /api/vacancies/[id]", true, vacancyDetailSrc.includes("fetch(`/api/vacancies/${vacancyId}`)"));
    record("14.2 vacancy-detail.tsx displays vacancy and employer information", true, vacancyDetailSrc.includes("id=\"detail-vacancy-description\"") && vacancyDetailSrc.includes("id=\"detail-vacancy-employer-name\""));
    record("14.3 vacancy-detail.tsx does not display application/placement details", false, vacancyDetailSrc.includes("applications") || vacancyDetailSrc.includes("placements"));

    const getVacDetailRes = await request(`/api/vacancies/${createdVac.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("14.4 GET /api/vacancies/[id] returns 200", 200, getVacDetailRes.status);
    const vacDetailData = await getVacDetailRes.json();
    record("14.5 Vacancy detail contains employer object", true, Boolean(vacDetailData.employer && vacDetailData.employer.name));

    // ==========================================
    // 15 loading state
    // ==========================================
    console.log("\n--- TEST 15: Loading state ---");
    record("15.1 employers-page.tsx has data-testid='loading-state'", true, employersPageSrc.includes("data-testid=\"loading-state\""));
    record("15.2 employer-detail.tsx has data-testid='loading-state'", true, employerDetailSrc.includes("data-testid=\"loading-state\""));
    record("15.3 vacancies-page.tsx has data-testid='loading-state'", true, vacanciesPageSrc.includes("data-testid=\"loading-state\""));
    record("15.4 vacancy-detail.tsx has data-testid='loading-state'", true, vacancyDetailSrc.includes("data-testid=\"loading-state\""));
    record("15.5 placement-dashboard.tsx has data-testid='dashboard-vacancies-loading'", true, placementDashSrc.includes("data-testid=\"dashboard-vacancies-loading\""));

    // ==========================================
    // 16 empty state
    // ==========================================
    console.log("\n--- TEST 16: Empty state ---");
    record("16.1 employers-page.tsx has data-testid='empty-state'", true, employersPageSrc.includes("data-testid=\"empty-state\""));
    record("16.2 employer-detail.tsx has data-testid='employer-vacancies-empty'", true, employerDetailSrc.includes("data-testid=\"employer-vacancies-empty\""));
    record("16.3 vacancies-page.tsx has data-testid='empty-state'", true, vacanciesPageSrc.includes("data-testid=\"empty-state\""));
    record("16.4 placement-dashboard.tsx has data-testid='dashboard-vacancies-empty'", true, placementDashSrc.includes("data-testid=\"dashboard-vacancies-empty\""));

    // ==========================================
    // 17 error state
    // ==========================================
    console.log("\n--- TEST 17: Error state ---");
    record("17.1 employers-page.tsx has data-testid='error-state'", true, employersPageSrc.includes("data-testid=\"error-state\""));
    record("17.2 employer-detail.tsx has data-testid='error-state'", true, employerDetailSrc.includes("data-testid=\"error-state\""));
    record("17.3 vacancies-page.tsx has data-testid='error-state'", true, vacanciesPageSrc.includes("data-testid=\"error-state\""));
    record("17.4 vacancy-detail.tsx has data-testid='error-state'", true, vacancyDetailSrc.includes("data-testid=\"error-state\""));
    record("17.5 placement-dashboard.tsx has data-testid='dashboard-vacancies-error'", true, placementDashSrc.includes("data-testid=\"dashboard-vacancies-error\""));

    // ==========================================
    // 18 Student gets forbidden
    // ==========================================
    console.log("\n--- TEST 18: Student gets forbidden ---");
    const studentEmpRes = await request("/api/employers", { headers: { Cookie: studentCookies } });
    record("18.1 Student GET /api/employers returns 403 Forbidden", 403, studentEmpRes.status);

    const studentVacRes = await request("/api/vacancies", { headers: { Cookie: studentCookies } });
    record("18.2 Student GET /api/vacancies returns 403 Forbidden", 403, studentVacRes.status);

    const studentVacDetailRes = await request(`/api/vacancies/${createdVac.id}`, { headers: { Cookie: studentCookies } });
    record("18.3 Student GET /api/vacancies/[id] returns 403 Forbidden", 403, studentVacDetailRes.status);

    // ==========================================
    // 19 Academic Staff gets forbidden
    // ==========================================
    console.log("\n--- TEST 19: Academic Staff gets forbidden ---");
    const academicEmpRes = await request("/api/employers", { headers: { Cookie: academicCookies } });
    record("19.1 Academic Staff GET /api/employers returns 403 Forbidden", 403, academicEmpRes.status);

    const academicVacRes = await request("/api/vacancies", { headers: { Cookie: academicCookies } });
    record("19.2 Academic Staff GET /api/vacancies returns 403 Forbidden", 403, academicVacRes.status);

    // ==========================================
    // 20 Instructor gets forbidden
    // ==========================================
    console.log("\n--- TEST 20: Instructor gets forbidden ---");
    const instructorEmpRes = await request("/api/employers", { headers: { Cookie: instructorCookies } });
    record("20.1 Instructor GET /api/employers returns 403 Forbidden", 403, instructorEmpRes.status);

    const instructorVacRes = await request("/api/vacancies", { headers: { Cookie: instructorCookies } });
    record("20.2 Instructor GET /api/vacancies returns 403 Forbidden", 403, instructorVacRes.status);

    // ==========================================
    // 21 Management read-only
    // ==========================================
    console.log("\n--- TEST 21: Management read-only ---");
    const mgtEmpGetRes = await request("/api/employers", { headers: { Cookie: managementCookies } });
    record("21.1 Management GET /api/employers returns 200 OK", 200, mgtEmpGetRes.status);

    const mgtVacGetRes = await request("/api/vacancies", { headers: { Cookie: managementCookies } });
    record("21.2 Management GET /api/vacancies returns 200 OK", 200, mgtVacGetRes.status);

    const mgtEmpPostRes = await request("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({ name: "PT Management Test" }),
    });
    record("21.3 Management POST /api/employers returns 403 Forbidden", 403, mgtEmpPostRes.status);

    const mgtVacPostRes = await request("/api/vacancies", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({ employerId: createdEmp.id, title: "Test", description: "Test", requirements: "Test" }),
    });
    record("21.4 Management POST /api/vacancies returns 403 Forbidden", 403, mgtVacPostRes.status);

    // ==========================================
    // 22 Placement Staff mutation available
    // ==========================================
    console.log("\n--- TEST 22: Placement Staff mutation available ---");
    record("22.1 Placement Staff successfully created employer", true, createdEmployerIds.length > 0);
    record("22.2 Placement Staff successfully created vacancy", true, createdVacancyIds.length > 0);
    record("22.3 Placement Staff successfully updated employer", "Resort bintang 4 ternama di kawasan pantai Sukabumi", updatedEmp.companyInfo);
    record("22.4 Placement Staff successfully closed vacancy", "CLOSED", closedVac.status);

    // ==========================================
    // 23 Placement Dashboard Real API integration
    // ==========================================
    console.log("\n--- TEST 23: Placement Dashboard Real API integration ---");
    record("23.1 placement-dashboard.tsx fetches /api/vacancies?status=OPEN", true, placementDashSrc.includes("fetch(\"/api/vacancies?status=OPEN\")"));
    record("23.2 placement-dashboard.tsx does not import activeVacancies", false, placementDashSrc.includes("activeVacancies"));
    record("23.3 mock-data.ts does not export activeVacancies", false, mockDataSrc.includes("export const activeVacancies"));
    record("23.4 placement-dashboard.tsx keeps pipeline, interviews, attention, status mock", true,
      placementDashSrc.includes("placementPipeline") &&
      placementDashSrc.includes("upcomingInterviews") &&
      placementDashSrc.includes("studentsAttention") &&
      placementDashSrc.includes("placementStatusOverview")
    );

    // ==========================================
    // 24 No DELETE endpoints / UI
    // ==========================================
    console.log("\n--- TEST 24: No DELETE endpoints or buttons ---");
    const delEmpRes = await request(`/api/employers/${createdEmp.id}`, {
      method: "DELETE",
      headers: { Cookie: placementCookies },
    });
    record("24.1 DELETE /api/employers/[id] returns 405 Method Not Allowed", 405, delEmpRes.status);

    const delVacRes = await request(`/api/vacancies/${createdVac.id}`, {
      method: "DELETE",
      headers: { Cookie: placementCookies },
    });
    record("24.2 DELETE /api/vacancies/[id] returns 405 Method Not Allowed", 405, delVacRes.status);
    record("24.3 employers-page.tsx does not contain delete button or delete action", false, employersPageSrc.includes("Hapus") || employersPageSrc.includes("DELETE"));
    record("24.4 vacancies-page.tsx does not contain delete button or delete action", false, vacanciesPageSrc.includes("Hapus") || vacanciesPageSrc.includes("DELETE"));

    // ==========================================
    // 25 Form Validation
    // ==========================================
    console.log("\n--- TEST 25: Form Validation ---");
    record("25.1 employers-page.tsx validates employer name required", true, employersPageSrc.includes("Nama perusahaan wajib diisi."));
    record("25.2 employers-page.tsx validates email format", true, employersPageSrc.includes("Format email tidak valid."));
    record("25.3 vacancies-page.tsx validates employerId required", true, vacanciesPageSrc.includes("Perusahaan mitra wajib dipilih."));
    record("25.4 vacancies-page.tsx validates title required", true, vacanciesPageSrc.includes("Judul posisi lowongan wajib diisi."));
    record("25.5 vacancies-page.tsx validates description required", true, vacanciesPageSrc.includes("Deskripsi pekerjaan wajib diisi."));
    record("25.6 vacancies-page.tsx validates requirements required", true, vacanciesPageSrc.includes("Persyaratan kualifikasi wajib diisi."));

    console.log("\n--- TEARDOWN & DATABASE CLEANUP ---");

    // Clean up created vacancies
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
      });
      await prisma.vacancy.deleteMany({
        where: { id: { in: createdVacancyIds } },
      });
      createdVacancyIds.length = 0;
    }

    // Clean up created employers
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Employer", entityId: { in: createdEmployerIds } },
      });
      await prisma.employer.deleteMany({
        where: { id: { in: createdEmployerIds } },
      });
      createdEmployerIds.length = 0;
    }

    // Clean up created temp users & their audit logs
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }

    console.log("\n--- VERIFYING MASTER DATABASE BASELINE ---");
    const employersCount = await prisma.employer.count();
    const vacanciesCount = await prisma.vacancy.count();
    const applicationsCount = await prisma.application.count();
    const placementsCount = await prisma.placement.count();
    const documentsCount = await prisma.document.count();
    const studentsCount = await prisma.student.count();
    const enrollmentsCount = await prisma.enrollment.count();
    const subjectsCount = await prisma.subject.count();
    const classesCount = await prisma.class.count();
    const schedulesCount = await prisma.schedule.count();
    const instructorsCount = await prisma.instructor.count();
    const usersCount = await prisma.user.count();

    record("26.1 Employers = 0", 0, employersCount);
    record("26.2 Vacancies = 0", 0, vacanciesCount);
    record("26.3 Applications = 0", 0, applicationsCount);
    record("26.4 Placements = 0", 0, placementsCount);
    record("26.5 Documents = 0", 0, documentsCount);
    record("26.6 Students = 21", 21, studentsCount);
    record("26.7 Enrollments = 21", 21, enrollmentsCount);
    record("26.8 Subjects = 6", 6, subjectsCount);
    record("26.9 Classes = 10", 10, classesCount);
    record("26.10 Schedules = 10", 10, schedulesCount);
    record("26.11 Instructors = 6", 6, instructorsCount);
    record("26.12 Users = 3", 3, usersCount /* Updated STEP 88 */);

    console.log("\n==========================================");
    console.log(`ALL ${results.length} TESTS FINISHED!`);
    const allPassed = results.every((r) => r.passed);
    console.log(`OVERALL STATUS: ${allPassed ? "PASSED" : "FAILED"}`);
    console.log("==========================================");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    // Safety cleanup in case of unhandled error
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
      }).catch(() => {});
      await prisma.vacancy.deleteMany({
        where: { id: { in: createdVacancyIds } },
      }).catch(() => {});
    }
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Employer", entityId: { in: createdEmployerIds } },
      }).catch(() => {});
      await prisma.employer.deleteMany({
        where: { id: { in: createdEmployerIds } },
      }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
