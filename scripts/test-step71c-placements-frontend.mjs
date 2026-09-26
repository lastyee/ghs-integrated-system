// scripts/test-step71c-placements-frontend.mjs
// Step 71C: Placement Frontend & Real API Integration Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  if (location.includes("error=")) {
    throw new Error(`Login failed for ${email}: ${location}`);
  }
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 71C PLACEMENT FRONTEND & REAL API INTEGRATION TEST ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];
  const createdPlacementIds = [];
  let studentAId = null;
  let studentBId = null;
  let studentBOriginalUserId = null;

  try {
    // ==========================================
    // 1. Authenticating & Preparing Test Fixtures
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

    // Student B record
    const studentBRecord = await prisma.student.findFirst({
      where: { id: { not: studentAId } },
    });
    studentBId = studentBRecord.id;
    studentBOriginalUserId = studentBRecord.userId;

    const hash = await bcrypt.hash("Password123!", 10);

    const placementRole = await prisma.role.findUnique({ where: { name: "PLACEMENT_STAFF" } });
    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    const acadRole = await prisma.role.findUnique({ where: { name: "ACADEMIC_STAFF" } });
    const instRole = await prisma.role.findUnique({ where: { name: "INSTRUCTOR" } });
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });

    // Placement Staff
    const placementStaffUser = await prisma.user.create({
      data: {
        email: `placement_staff_71c_${Date.now()}@ghs.local`,
        passwordHash: hash,
        roleId: placementRole.id,
      },
    });
    createdUserIds.push(placementStaffUser.id);
    const placementStaffCookies = await login(placementStaffUser.email, "Password123!");

    // Management
    const mgmtUser = await prisma.user.create({
      data: {
        email: `mgmt_71c_${Date.now()}@ghs.local`,
        passwordHash: hash,
        roleId: mgmtRole.id,
      },
    });
    createdUserIds.push(mgmtUser.id);
    const mgmtCookies = await login(mgmtUser.email, "Password123!");

    // Academic Staff
    const acadUser = await prisma.user.create({
      data: {
        email: `acad_71c_${Date.now()}@ghs.local`,
        passwordHash: hash,
        roleId: acadRole.id,
      },
    });
    createdUserIds.push(acadUser.id);
    const acadCookies = await login(acadUser.email, "Password123!");

    // Instructor
    const instUser = await prisma.user.create({
      data: {
        email: `inst_71c_${Date.now()}@ghs.local`,
        passwordHash: hash,
        roleId: instRole.id,
      },
    });
    createdUserIds.push(instUser.id);
    const instCookies = await login(instUser.email, "Password123!");

    // Student B User
    const studentBUser = await prisma.user.create({
      data: {
        email: `student_b_71c_${Date.now()}@ghs.local`,
        passwordHash: hash,
        roleId: studentRole.id,
      },
    });
    createdUserIds.push(studentBUser.id);
    await prisma.student.update({
      where: { id: studentBId },
      data: { userId: studentBUser.id },
    });
    const studentBCookies = await login(studentBUser.email, "Password123!");

    // Employer & Vacancy & Applications
    const employer = await prisma.employer.create({
      data: {
        name: `PT Mitra Bahari Step 71C ${Date.now()}`,
        contactName: "Budi Bahari",
        contactEmail: "budi@bahari.test",
        contactPhone: "081234567890",
        address: "Jl. Pelabuhan No. 12, Denpasar",
      },
    });
    createdEmployerIds.push(employer.id);

    const vacancy = await prisma.vacancy.create({
      data: {
        employerId: employer.id,
        title: "Commis Chef Cruise Line 71C",
        description: "Penempatan Commis Chef kapal pesiar",
        requirements: "Pengalaman 1 tahun di kitchen",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(vacancy.id);

    const applicationA = await prisma.application.create({
      data: {
        studentId: studentAId,
        vacancyId: vacancy.id,
        status: "SELECTED",
      },
    });
    createdApplicationIds.push(applicationA.id);

    const applicationB = await prisma.application.create({
      data: {
        studentId: studentBId,
        vacancyId: vacancy.id,
        status: "SELECTED",
      },
    });
    createdApplicationIds.push(applicationB.id);

    console.log("Fixtures ready.\n");

    // ==========================================
    // 2. Source Code & Architecture Contracts
    // ==========================================
    console.log("2. Verifying File Existence & Architecture Contracts...");

    const placementsPageSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "placements", "placements-page.tsx"),
      "utf8"
    );
    const placementDetailSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "placements", "placement-detail.tsx"),
      "utf8"
    );
    const placementFormSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "placements", "placement-form.tsx"),
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
    const sidebarSrc = fs.readFileSync(
      path.join(process.cwd(), "components", "layout", "app-sidebar.tsx"),
      "utf8"
    );
    const proxySrc = fs.readFileSync(
      path.join(process.cwd(), "proxy.ts"),
      "utf8"
    );

    // Target files existence
    record(
      "app/placements/page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "app", "placements", "page.tsx"))
    );
    record(
      "app/placements/[id]/page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "app", "placements", "[id]", "page.tsx"))
    );
    record(
      "components/placements/placements-page.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "placements", "placements-page.tsx"))
    );
    record(
      "components/placements/placement-detail.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "placements", "placement-detail.tsx"))
    );
    record(
      "components/placements/placement-form.tsx exists",
      true,
      fs.existsSync(path.join(process.cwd(), "components", "placements", "placement-form.tsx"))
    );

    // 1. Route accessibility & Proxy Protection
    record(
      "1. proxy.ts protects /placements route",
      true,
      proxySrc.includes('"/placements/:path*"') || proxySrc.includes("/placements")
    );

    // 2. Sidebar Navigation
    record(
      "2. app-sidebar.tsx includes Penempatan / Placement menu and filters out academic/instructor",
      true,
      (sidebarSrc.includes('Penempatan: "/placements"') || sidebarSrc.includes('Placement: "/placements"')) &&
        sidebarSrc.includes("isAcademicOrInstructor") &&
        sidebarSrc.includes('"Penempatan"')
    );

    // ==========================================
    // 3. RBAC Route & API Access
    // ==========================================
    console.log("\n3. Testing RBAC Route & API Access (Test 3-8)...");

    // 3. Staff List
    const staffListRes = await request("/api/placements", {
      headers: { Cookie: placementStaffCookies },
    });
    record("3. Placement list accessible by PLACEMENT_STAFF (200)", 200, staffListRes.status);
    const staffListData = await staffListRes.json();
    record("3. Staff list returns array in data", true, Array.isArray(staffListData.data));

    const adminPageRes = await request("/placements", {
      headers: { Cookie: adminCookies },
      redirect: "manual",
    });
    record("SUPER_ADMIN can access /placements UI route (200)", 200, adminPageRes.status);

    // 4. Management Read-Only
    const mgmtListRes = await request("/api/placements", {
      headers: { Cookie: mgmtCookies },
    });
    record("4. Management can read placements list (200)", 200, mgmtListRes.status);
    const mgmtPageRes = await request("/placements", {
      headers: { Cookie: mgmtCookies },
      redirect: "manual",
    });
    record("4. Management can access /placements UI route (200)", 200, mgmtPageRes.status);

    // 7. Academic Staff denied
    const acadApiRes = await request("/api/placements", {
      headers: { Cookie: acadCookies },
    });
    record("7. Academic Staff denied from /api/placements (403)", 403, acadApiRes.status);

    // 8. Instructor denied
    const instApiRes = await request("/api/placements", {
      headers: { Cookie: instCookies },
    });
    record("8. Instructor denied from /api/placements (403)", 403, instApiRes.status);

    // ==========================================
    // 4. Create Placement & Real API Integration
    // ==========================================
    console.log("\n4. Testing Create Placement via Real API (Test 9-10)...");

    // 9. Create form visibility contract in UI
    record(
      "9. Create form trigger rendered only for authorized staff roles",
      true,
      placementsPageSrc.includes("isStaff &&") &&
        placementsPageSrc.includes("create-placement-trigger")
    );

    // 10. Create Placement 1 for Student A via Real API
    const createRes1 = await request("/api/placements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        studentId: studentAId,
        employerId: employer.id,
        vacancyId: vacancy.id,
        applicationId: applicationA.id,
        position: "Commis Chef",
        startDate: "2026-11-01T00:00:00.000Z",
        notes: "Berkas paspor dan visa sedang dipersiapkan.",
      }),
    });
    record("10. PLACEMENT_STAFF can create placement via real API (201)", 201, createRes1.status);
    const createdJson1 = await createRes1.json();
    const placement1 = createdJson1.data;
    if (placement1?.id) createdPlacementIds.push(placement1.id);

    record("10. Placement initialized with PREPARATION status", "PREPARATION", placement1.status);
    record("10. Placement position recorded correctly", "Commis Chef", placement1.position);

    // 5. Student own placement
    const studentAGetRes = await request("/api/placements", {
      headers: { Cookie: studentACookies },
    });
    record("5. Student can access their own placement list (200)", 200, studentAGetRes.status);
    const studentAGetData = await studentAGetRes.json();
    const studentAList = studentAGetData.data || [];
    record("5. Student A sees their created placement", true, studentAList.some((p) => p.id === placement1.id));

    // 6. Student cannot see other student's placement
    const studentBGetRes = await request(`/api/placements/${placement1.id}`, {
      headers: { Cookie: studentBCookies },
    });
    record("6. Student B cannot access Student A placement detail (403 IDOR protected)", 403, studentBGetRes.status);

    // ==========================================
    // 5. Detail Page & Operational Edit
    // ==========================================
    console.log("\n5. Testing Placement Detail & Operational Edit (Test 11-12)...");

    // 11. Detail Page
    const detailRes = await request(`/api/placements/${placement1.id}`, {
      headers: { Cookie: placementStaffCookies },
    });
    record("11. Placement detail accessible via real API (200)", 200, detailRes.status);
    const detailData = await detailRes.json();
    const placementDetail = detailData.data;
    record("11. Detail includes student information", studentARecord.nim, placementDetail.student.nim);
    record("11. Detail includes employer information", employer.name, placementDetail.employer.name);
    record("11. Detail includes vacancy information", vacancy.title, placementDetail.vacancy.title);
    record("11. Detail includes application status", "SELECTED", placementDetail.application.status);

    // 12. Operational Edit (Position, StartDate, Notes)
    const editRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        position: "Demi Chef de Partie",
        startDate: "2026-11-15T00:00:00.000Z",
        notes: "Promosi posisi setelah review chef.",
      }),
    });
    record("12. Operational edit updates position, date, notes (200)", 200, editRes.status);
    const editData = await editRes.json();
    record("12. Updated position saved in database", "Demi Chef de Partie", editData.data.position);
    record("12. Updated notes saved in database", "Promosi posisi setelah review chef.", editData.data.notes);

    // ==========================================
    // 6. Lifecycle Transitions (Test 13-18)
    // ==========================================
    console.log("\n6. Testing Lifecycle Transitions (Test 13-18)...");

    // 13. PREPARATION -> READY
    const transReadyRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        status: "READY",
        notes: "Semua berkas dan tiket sudah siap.",
      }),
    });
    record("13. Transition PREPARATION -> READY succeeds (200)", 200, transReadyRes.status);
    const readyData = await transReadyRes.json();
    record("13. Status is now READY", "READY", readyData.data.status);

    // 15. READY -> DEPARTED
    const transDepartedRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        status: "DEPARTED",
        notes: "Kandidat telah boarding pesawat menuju pelabuhan.",
      }),
    });
    record("15. Transition READY -> DEPARTED succeeds (200)", 200, transDepartedRes.status);
    const departedData = await transDepartedRes.json();
    record("15. Status is now DEPARTED", "DEPARTED", departedData.data.status);

    // 17. DEPARTED -> PLACED
    const transPlacedRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        status: "PLACED",
        notes: "Kandidat telah resmi onboard dan mulai bekerja.",
      }),
    });
    record("17. Transition DEPARTED -> PLACED succeeds (200)", 200, transPlacedRes.status);
    const placedData = await transPlacedRes.json();
    record("17. Status is now PLACED (terminal)", "PLACED", placedData.data.status);

    // 18. Terminal action disabled (PLACED cannot be mutated)
    const terminalMutateRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        position: "Executive Chef",
      }),
    });
    record("18. Terminal status PLACED blocks operational update (409 Conflict)", 409, terminalMutateRes.status);

    // Testing cancellation transitions on a second placement
    const createRes2 = await request("/api/placements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        studentId: studentBId,
        employerId: employer.id,
        vacancyId: vacancy.id,
        applicationId: applicationB.id,
        position: "Front Office Agent",
      }),
    });
    record("Create Placement 2 for Student B (201)", 201, createRes2.status);
    const createdJson2 = await createRes2.json();
    const placement2 = createdJson2.data;
    if (placement2?.id) createdPlacementIds.push(placement2.id);

    // 14. PREPARATION -> CANCELLED
    const cancelRes = await request(`/api/placements/${placement2.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        status: "CANCELLED",
        notes: "Kandidat mengundurkan diri karena alasan keluarga.",
      }),
    });
    record("14. Transition PREPARATION -> CANCELLED succeeds (200)", 200, cancelRes.status);
    const cancelledData = await cancelRes.json();
    record("14. Status is now CANCELLED (terminal)", "CANCELLED", cancelledData.data.status);

    // 18. Terminal action disabled (CANCELLED cannot transition)
    const cancelTransRes = await request(`/api/placements/${placement2.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        status: "READY",
      }),
    });
    record("18. Terminal status CANCELLED blocks further transitions (409 Conflict)", 409, cancelTransRes.status);

    // 16. READY -> CANCELLED transition verification in schema/source contract
    record(
      "16. UI and schema support READY -> CANCELLED transition",
      true,
      placementDetailSrc.includes('placement.status === "READY"') &&
        placementDetailSrc.includes('setTransitionTarget("CANCELLED")')
    );

    // ==========================================
    // 7. Integrations (Application & Dashboards)
    // ==========================================
    console.log("\n7. Testing Application Detail & Dashboard Integrations (Test 19-21)...");

    // 19. Application Detail Integration
    record(
      "19. Application Detail integrates live placement and + Buat Placement button",
      true,
      appDetailSrc.includes("+ Buat Placement") &&
        appDetailSrc.includes("btn-create-placement-from-application") &&
        appDetailSrc.includes("view-application-placement-link")
    );

    // 20. Placement Dashboard Real API
    record(
      "20. Placement Dashboard fetches real /api/placements and renders 5 status badges",
      true,
      placementDashSrc.includes('fetch("/api/placements")') &&
        placementDashSrc.includes("placement-status-") &&
        placementDashSrc.includes('"Persiapan"') &&
        placementDashSrc.includes('"Siap"') &&
        placementDashSrc.includes('"Berangkat"') &&
        placementDashSrc.includes('"Ditempatkan"') &&
        placementDashSrc.includes('"Dibatalkan"')
    );

    // 21. Student Dashboard Real API
    record(
      "21. Student Dashboard fetches real /api/placements and dynamically calculates status",
      true,
      studentDashSrc.includes('fetch("/api/placements")') &&
        studentDashSrc.includes("placementStatusMap")
    );

    // ==========================================
    // 8. Mock Data Cleanup & UI Contracts (Test 22-29)
    // ==========================================
    console.log("\n8. Testing Mock Cleanup, UI States & Contracts (Test 22-29)...");

    // 22. No Mock Placement Rendering in live list and detail
    record(
      "22. PlacementsPage and PlacementDetail use 100% live API data without mock placement imports",
      true,
      !placementsPageSrc.includes("mock-data") &&
        !placementDetailSrc.includes("mock-data") &&
        !placementFormSrc.includes("mock-data")
    );

    // 23. Loading State
    record(
      "23. Loading state indicators implemented cleanly across placement views",
      true,
      placementsPageSrc.includes("loading-state") &&
        placementDetailSrc.includes("loading-state")
    );

    // 24. Empty State
    record(
      "24. Empty state implemented cleanly for empty placement lists",
      true,
      placementsPageSrc.includes("empty-state") &&
        placementsPageSrc.includes("Belum Ada Data Penempatan")
    );

    // 25. Error State
    record(
      "25. Error state handles network and server errors user-friendly",
      true,
      placementsPageSrc.includes("error-state") &&
        placementDetailSrc.includes("error-state") &&
        placementFormSrc.includes("placement-form-error")
    );

    // 26. Unauthorized State
    record(
      "26. Unauthorized state cleanly handles forbidden roles",
      true,
      placementsPageSrc.includes("unauthorized-state") &&
        placementDetailSrc.includes("unauthorized-state")
    );

    // 27. Responsive / Mobile rendering contract
    record(
      "27. Responsive mobile cards alongside desktop table implemented",
      true,
      placementsPageSrc.includes("hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block") &&
        placementsPageSrc.includes("grid gap-3 md:hidden")
    );

    // 28. Icon and Action Route Behavior
    record(
      "28. Icon/action route behavior implemented with active links and modal triggers",
      true,
      placementsPageSrc.includes("view-placement-btn") &&
        placementDetailSrc.includes("back-to-placements") &&
        placementDetailSrc.includes("btn-edit-placement") &&
        placementDetailSrc.includes("btn-confirm-transition")
    );

    // 29. Duplicate placement prevention surfaced correctly
    const duplicateRes = await request("/api/placements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementStaffCookies,
      },
      body: JSON.stringify({
        studentId: studentAId,
        employerId: employer.id,
        vacancyId: vacancy.id,
        applicationId: applicationA.id,
        position: "Second Placement Attempt",
      }),
    });
    record("29. Duplicate placement creation for same application rejected (409 Conflict)", 409, duplicateRes.status);

  } catch (err) {
    console.error("Test execution fatal error:", err);
    record("Test run without fatal exceptions", true, false);
  } finally {
    // ==========================================
    // 9. Baseline Database Cleanup & Verification
    // ==========================================
    console.log("\n9. Cleaning up test fixtures & verifying database baseline (Test 30)...");

    for (const id of createdPlacementIds) {
      await prisma.placement.deleteMany({ where: { id } });
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
    console.log(`Users:       ${usersCount} (expected 2)`);

    record("30. Baseline Employers == 0", 0, employersCount);
    record("30. Baseline Vacancies == 0", 0, vacanciesCount);
    record("30. Baseline Applications == 0", 0, applicationsCount);
    record("30. Baseline Interviews == 0", 0, interviewsCount);
    record("30. Baseline Placements == 0", 0, placementsCount);
    record("30. Baseline Documents == 0", 0, documentsCount);
    record("30. Baseline Students == 21", 21, studentsCount);
    record("30. Baseline Enrollments == 21", 21, enrollmentsCount);
    record("30. Baseline Subjects == 6", 6, subjectsCount);
    record("30. Baseline Classes == 10", 10, classesCount);
    record("30. Baseline Schedules == 10", 10, schedulesCount);
    record("30. Baseline Instructors == 6", 6, instructorsCount);
    record("30. Baseline Users == 2", 2, usersCount);
  }

  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`\n==========================================`);
  console.log(`RESULTS: ${results.length - failedCount}/${results.length} PASSED`);
  if (failedCount > 0) {
    console.log(`FAILED: ${failedCount}`);
    process.exit(1);
  } else {
    console.log(`STATUS: ALL STEP 71C FRONTEND TESTS PASSED`);
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
