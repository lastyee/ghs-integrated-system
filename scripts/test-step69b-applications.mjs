// scripts/test-step69b-applications.mjs
// Step 69B: Application API & Business Logic Comprehensive Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

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

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
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
  assertSafeMutationTarget({
    mutationFlag: "STEP69B_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "STEP69B_TEST_CONFIRM_DATABASE",
    baseUrl,
  });
  console.log("=== STEP 69B APPLICATION API & BUSINESS LOGIC TEST SUITE ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];

  let studentA = null;
  let studentB = null;
  let originalStudentBUserId = null;

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

    const superAdminPassword =
      process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("1. Authenticating demo users...");
    const superAdminCookies = await login(
      "admin.demo@ghs.local",
      superAdminPassword
    );
    const studentACookies = await login(
      "student.demo@ghs.local",
      studentPassword
    );

    console.log("2. Creating temporary RBAC test users...");
    const adminUser = await createTempUser("ADMIN", "test.admin69b@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic69b@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management69b@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement69b@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor69b@ghs.test"
    );
    const studentBUser = await createTempUser(
      "STUDENT",
      "test.studentb69b@ghs.test"
    );

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);
    const studentBCookies = await login(studentBUser.email, tempPassword);

    console.log("3. Setting up Student A and Student B records...");
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });

    studentA = await prisma.student.findUnique({
      where: { userId: demoStudentUser.id },
    });
    if (!studentA) {
      throw new Error("Student A linked to demo user not found.");
    }
    studentB = await prisma.student.findFirst({
      where: { id: { not: studentA.id } },
    });
    if (!studentB) {
      throw new Error("Student B not found.");
    }

    originalStudentBUserId = studentB.userId;

    // Link studentB to studentBUser
    await prisma.student.update({
      where: { id: studentB.id },
      data: { userId: studentBUser.id },
    });

    console.log("4. Setting up test Employer and Vacancies...");
    const testEmployer = await prisma.employer.create({
      data: {
        name: "PT Grand Sukabumi Hotel 69B",
        companyInfo: "Resort bintang 4 di Sukabumi",
        address: "Jl. Cisolok No. 12",
        contactName: "Budi Santoso",
        contactEmail: "hrd@grandsukabumi69b.test",
        contactPhone: "08123456789",
      },
    });
    createdEmployerIds.push(testEmployer.id);

    const openVacancy1 = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Front Desk Agent 69B",
        description: "Menyambut tamu hotel",
        requirements: "Bahasa Inggris aktif",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(openVacancy1.id);

    const openVacancy2 = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Commis Pastry 69B",
        description: "Membuat pastry dan roti",
        requirements: "Pengalaman kuliner",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(openVacancy2.id);

    const closedVacancy = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Closed Position 69B",
        description: "Lowongan sudah ditutup",
        requirements: "N/A",
        status: "CLOSED",
      },
    });
    createdVacancyIds.push(closedVacancy.id);

    console.log("\n--- EXECUTING REQUIRED TEST SCENARIOS ---\n");

    // ==========================================
    // SECTION 1: AUTHENTICATION (Tests 1 - 2)
    // ==========================================
    console.log("Section 1: Authentication");
    const unauthGetRes = await request("/api/applications");
    record("1.1 Unauthenticated GET /api/applications -> 401", 401, unauthGetRes.status);

    const unauthPostRes = await request("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId: openVacancy1.id }),
    });
    record("1.2 Unauthenticated POST /api/applications -> 401", 401, unauthPostRes.status);

    // ==========================================
    // SECTION 2: VACANCY VALIDATION (Tests 3 - 5)
    // ==========================================
    console.log("\nSection 2: Vacancy Validation");
    // Nonexistent Vacancy
    const nonExistentVacRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ vacancyId: "cuid_nonexistent_vacancy_123" }),
    });
    record("2.1 POST Application with nonexistent vacancy -> 404", 404, nonExistentVacRes.status);

    // CLOSED Vacancy
    const closedVacRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ vacancyId: closedVacancy.id }),
    });
    record("2.2 POST Application to CLOSED vacancy -> 409 Conflict", 409, closedVacRes.status);

    // OPEN Vacancy: Student A creates application
    const validApp1Res = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: openVacancy1.id,
        notes: "Saya sangat tertarik dengan posisi ini.",
      }),
    });
    record("2.3 Student A POST to OPEN vacancy -> 201 Created", 201, validApp1Res.status);
    const app1Data = await validApp1Res.json();
    createdApplicationIds.push(app1Data.id);
    record("2.4 Created application initial status is APPLIED", "APPLIED", app1Data.status);
    record("2.5 Created application studentId matches Student A", studentA.id, app1Data.studentId);

    // ==========================================
    // SECTION 3: DUPLICATE PROTECTION & CONCURRENCY (Tests 6 - 8)
    // ==========================================
    console.log("\nSection 3: Duplicate Protection");
    // Duplicate active application attempt by Student A to openVacancy1
    const duplicateAppRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: openVacancy1.id,
        notes: "Mencoba mendaftar lagi",
      }),
    });
    record("3.1 Duplicate active application -> 409 Conflict", 409, duplicateAppRes.status);
    const duplicateErr = await duplicateAppRes.json();
    record("3.2 Duplicate error message specifies active application", true, duplicateErr.message.includes("active application"));

    // Student A applying to a DIFFERENT vacancy (openVacancy2) is allowed
    const diffVacAppRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: openVacancy2.id,
      }),
    });
    record("3.3 Student applying to different vacancy -> 201 Created", 201, diffVacAppRes.status);
    const app2Data = await diffVacAppRes.json();
    createdApplicationIds.push(app2Data.id);

    // ==========================================
    // SECTION 4: SECURITY & IDOR PROTECTION (Tests 9 - 18)
    // ==========================================
    console.log("\nSection 4: Security & IDOR Protection");

    // 4.1 Student A tries to POST with studentId of Student B
    // Server MUST NOT trust client studentId; must assign Student A's own ID
    const studentSpoofRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({
        vacancyId: openVacancy1.id,
        studentId: studentB.id, // spoof attempt
      }),
    });
    // Because Student A already applied to openVacancy1, server identifies Student A and returns 409!
    record("4.1 Student A spoofing Student B ID is evaluated for Student A -> 409 (duplicate)", 409, studentSpoofRes.status);

    // Let Student B create an application to openVacancy1
    const studentBAppRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentBCookies,
      },
      body: JSON.stringify({
        vacancyId: openVacancy1.id,
      }),
    });
    record("4.2 Student B creates own application -> 201 Created", 201, studentBAppRes.status);
    const appBData = await studentBAppRes.json();
    createdApplicationIds.push(appBData.id);
    record("4.3 Student B application belongs to Student B", studentB.id, appBData.studentId);

    // 4.4 Student A GET own application -> 200
    const stuAGetOwn = await request(`/api/applications/${app1Data.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("4.4 Student A GET own application -> 200", 200, stuAGetOwn.status);

    // 4.5 Student A GET Student B's application -> 403 Forbidden (IDOR prevention)
    const stuAGetB = await request(`/api/applications/${appBData.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("4.5 Student A GET Student B application -> 403 Forbidden", 403, stuAGetB.status);

    // 4.6 Student A PATCH Student B's application -> 403 Forbidden
    const stuAPatchB = await request(`/api/applications/${appBData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("4.6 Student A PATCH Student B application -> 403 Forbidden", 403, stuAPatchB.status);

    // 4.7 Student A attempts privilege escalation to SELECTED -> 403 Forbidden
    const stuAPrivEsc1 = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "SELECTED" }),
    });
    record("4.7 Student A attempts status SELECTED -> 403 Forbidden", 403, stuAPrivEsc1.status);

    // 4.8 Student A attempts privilege escalation to INTERVIEW -> 403 Forbidden
    const stuAPrivEsc2 = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("4.8 Student A attempts status INTERVIEW -> 403 Forbidden", 403, stuAPrivEsc2.status);

    // 4.9 Student A attempts privilege escalation to SCREENING -> 403 Forbidden
    const stuAPrivEsc3 = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "SCREENING" }),
    });
    record("4.9 Student A attempts status SCREENING -> 403 Forbidden", 403, stuAPrivEsc3.status);

    // 4.10 Student A attempts to modify notes -> 403 Forbidden
    const stuAPrivEsc4 = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ notes: "Student modifying internal notes" }),
    });
    record("4.10 Student A attempts to modify notes -> 403 Forbidden", 403, stuAPrivEsc4.status);

    // ==========================================
    // SECTION 5: STUDENT WITHDRAWAL (Tests 19 - 22)
    // ==========================================
    console.log("\nSection 5: Student Withdrawal");

    // Student A withdraws APPLIED application (app1Data) -> allowed (200)
    const stuAWithdrawRes = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("5.1 Student A withdraws APPLIED application -> 200 OK", 200, stuAWithdrawRes.status);
    const stuAWithdrawnData = await stuAWithdrawRes.json();
    record("5.2 Application status is now WITHDRAWN", "WITHDRAWN", stuAWithdrawnData.status);

    // Student A tries to withdraw AGAIN when already WITHDRAWN -> 409 Conflict
    const stuAWithdrawAgain = await request(`/api/applications/${app1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("5.3 Student A withdraws already WITHDRAWN application -> 409 Conflict", 409, stuAWithdrawAgain.status);

    // Re-apply policy is TBD: student trying to re-apply after WITHDRAWN returns 409 (pending confirmation)
    const stuAReapplyRes = await request("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ vacancyId: openVacancy1.id }),
    });
    record("5.4 Re-application after WITHDRAWN returns 409 (TBD policy)", 409, stuAReapplyRes.status);

    // ==========================================
    // SECTION 6: STATUS TRANSITION MATRIX (Tests 23 - 35)
    // ==========================================
    console.log("\nSection 6: Status Transition Matrix (Placement Staff)");

    // Target application: app2Data (initially APPLIED)
    // 6.1 Placement staff tries invalid transition: APPLIED -> SELECTED (409)
    const invalidTrans1 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SELECTED" }),
    });
    record("6.1 Invalid transition: APPLIED -> SELECTED returns 409 Conflict", 409, invalidTrans1.status);

    // 6.2 Placement staff tries invalid transition: APPLIED -> INTERVIEW (409)
    const invalidTrans2 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("6.2 Invalid transition: APPLIED -> INTERVIEW returns 409 Conflict", 409, invalidTrans2.status);

    // 6.3 Placement staff valid transition: APPLIED -> SCREENING (200)
    const validTrans1 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SCREENING", notes: "Lolos cek administrasi awal" }),
    });
    record("6.3 Valid transition: APPLIED -> SCREENING returns 200 OK", 200, validTrans1.status);
    const app2Screening = await validTrans1.json();
    record("6.4 Status is now SCREENING", "SCREENING", app2Screening.status);

    // 6.5 Student A tries to withdraw while in SCREENING status -> 409 Conflict
    const stuWithdrawScreening = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentACookies,
      },
      body: JSON.stringify({ status: "WITHDRAWN" }),
    });
    record("6.5 Student cannot withdraw when status is SCREENING -> 409 Conflict", 409, stuWithdrawScreening.status);

    // 6.6 Placement staff invalid transition: SCREENING -> APPLIED (409)
    const invalidTrans3 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "APPLIED" }),
    });
    record("6.6 Invalid transition: SCREENING -> APPLIED returns 409 Conflict", 409, invalidTrans3.status);

    // 6.7 Placement staff invalid transition: SCREENING -> SELECTED (409)
    const invalidTrans4 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SELECTED" }),
    });
    record("6.7 Invalid transition: SCREENING -> SELECTED returns 409 Conflict", 409, invalidTrans4.status);

    // 6.8 Placement staff valid transition: SCREENING -> INTERVIEW (200)
    const validTrans2 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "INTERVIEW", notes: "Jadwal interview diatur" }),
    });
    record("6.8 Valid transition: SCREENING -> INTERVIEW returns 200 OK", 200, validTrans2.status);

    // 6.9 Placement staff invalid transition: INTERVIEW -> APPLIED (409)
    const invalidTrans5 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "APPLIED" }),
    });
    record("6.9 Invalid transition: INTERVIEW -> APPLIED returns 409 Conflict", 409, invalidTrans5.status);

    // 6.10 Placement staff valid transition: INTERVIEW -> SELECTED (200)
    const validTrans3 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SELECTED", notes: "Kandidat diterima oleh hotel" }),
    });
    record("6.10 Valid transition: INTERVIEW -> SELECTED returns 200 OK", 200, validTrans3.status);
    const app2Selected = await validTrans3.json();
    record("6.11 Status is now SELECTED", "SELECTED", app2Selected.status);

    // 6.12 Terminal status SELECTED cannot transition to any other status (409)
    const invalidTrans6 = await request(`/api/applications/${app2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    record("6.12 Terminal status SELECTED cannot transition -> 409 Conflict", 409, invalidTrans6.status);

    // Test REJECTED transition: on appBData (Student B)
    // APPLIED -> SCREENING
    await request(`/api/applications/${appBData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SCREENING" }),
    });
    // SCREENING -> REJECTED
    const validRejectRes = await request(`/api/applications/${appBData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "REJECTED", notes: "Kualifikasi bahasa belum memenuhi" }),
    });
    record("6.13 Valid transition: SCREENING -> REJECTED returns 200 OK", 200, validRejectRes.status);

    // Terminal status REJECTED cannot transition (409)
    const invalidTrans7 = await request(`/api/applications/${appBData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "SCREENING" }),
    });
    record("6.14 Terminal status REJECTED cannot transition -> 409 Conflict", 409, invalidTrans7.status);

    // ==========================================
    // SECTION 7: RBAC VERIFICATION ACROSS ALL ROLES (Tests 36 - 55)
    // ==========================================
    console.log("\nSection 7: RBAC Verification Across Roles");

    // SUPER_ADMIN
    const saGet = await request("/api/applications", { headers: { Cookie: superAdminCookies } });
    record("7.1 SUPER_ADMIN GET /api/applications -> 200", 200, saGet.status);
    const saPost = await request("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookies },
      body: JSON.stringify({ vacancyId: openVacancy2.id, studentId: studentB.id }),
    });
    record("7.2 SUPER_ADMIN POST /api/applications -> 201", 201, saPost.status);
    const saApp = await saPost.json();
    createdApplicationIds.push(saApp.id);
    const saPatch = await request(`/api/applications/${saApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookies },
      body: JSON.stringify({ status: "SCREENING" }),
    });
    record("7.3 SUPER_ADMIN PATCH /api/applications/[id] -> 200", 200, saPatch.status);
    const saDel = await request(`/api/applications/${saApp.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("7.4 SUPER_ADMIN DELETE /api/applications/[id] -> 405", 405, saDel.status);

    // ADMIN
    const admGet = await request("/api/applications", { headers: { Cookie: adminCookies } });
    record("7.5 ADMIN GET /api/applications -> 200", 200, admGet.status);
    const admPatch = await request(`/api/applications/${saApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ notes: "Admin updated notes" }),
    });
    record("7.6 ADMIN PATCH /api/applications/[id] -> 200", 200, admPatch.status);
    const admDel = await request(`/api/applications/${saApp.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record("7.7 ADMIN DELETE /api/applications/[id] -> 405", 405, admDel.status);

    // PLACEMENT_STAFF
    const psGet = await request("/api/applications", { headers: { Cookie: placementCookies } });
    record("7.8 PLACEMENT_STAFF GET /api/applications -> 200", 200, psGet.status);
    const psDel = await request(`/api/applications/${saApp.id}`, {
      method: "DELETE",
      headers: { Cookie: placementCookies },
    });
    record("7.9 PLACEMENT_STAFF DELETE /api/applications/[id] -> 405", 405, psDel.status);

    // MANAGEMENT (Read-only)
    const mgtGet = await request("/api/applications", { headers: { Cookie: managementCookies } });
    record("7.10 MANAGEMENT GET /api/applications -> 200", 200, mgtGet.status);
    const mgtPost = await request("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({ vacancyId: openVacancy2.id, studentId: studentA.id }),
    });
    record("7.11 MANAGEMENT POST /api/applications -> 403 Forbidden", 403, mgtPost.status);
    const mgtPatch = await request(`/api/applications/${saApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("7.12 MANAGEMENT PATCH /api/applications/[id] -> 403 Forbidden", 403, mgtPatch.status);
    const mgtDel = await request(`/api/applications/${saApp.id}`, {
      method: "DELETE",
      headers: { Cookie: managementCookies },
    });
    record("7.13 MANAGEMENT DELETE /api/applications/[id] -> 405", 405, mgtDel.status);

    // ACADEMIC_STAFF (No Access)
    const acadGet = await request("/api/applications", { headers: { Cookie: academicCookies } });
    record("7.14 ACADEMIC_STAFF GET /api/applications -> 403 Forbidden", 403, acadGet.status);
    const acadPost = await request("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: academicCookies },
      body: JSON.stringify({ vacancyId: openVacancy2.id, studentId: studentA.id }),
    });
    record("7.15 ACADEMIC_STAFF POST /api/applications -> 403 Forbidden", 403, acadPost.status);
    const acadPatch = await request(`/api/applications/${saApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: academicCookies },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("7.16 ACADEMIC_STAFF PATCH /api/applications/[id] -> 403 Forbidden", 403, acadPatch.status);

    // INSTRUCTOR (No Access)
    const insGet = await request("/api/applications", { headers: { Cookie: instructorCookies } });
    record("7.17 INSTRUCTOR GET /api/applications -> 403 Forbidden", 403, insGet.status);
    const insPost = await request("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: instructorCookies },
      body: JSON.stringify({ vacancyId: openVacancy2.id, studentId: studentA.id }),
    });
    record("7.18 INSTRUCTOR POST /api/applications -> 403 Forbidden", 403, insPost.status);
    const insPatch = await request(`/api/applications/${saApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: instructorCookies },
      body: JSON.stringify({ status: "INTERVIEW" }),
    });
    record("7.19 INSTRUCTOR PATCH /api/applications/[id] -> 403 Forbidden", 403, insPatch.status);

    // Collection DELETE
    const colDel = await request("/api/applications", {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("7.20 DELETE /api/applications (collection) -> 405 Method Not Allowed", 405, colDel.status);

    // ==========================================
    // SECTION 8: QUERY FILTERING & OWNERSHIP SCOPE (Tests 56 - 60)
    // ==========================================
    console.log("\nSection 8: Query Filtering & Ownership Scope");

    // Student A queries /api/applications without params: returns only Student A's applications
    const stuAListRes = await request("/api/applications", { headers: { Cookie: studentACookies } });
    record("8.1 Student A GET list returns 200", 200, stuAListRes.status);
    const stuAList = await stuAListRes.json();
    const allBelongToStuA = stuAList.every((app) => app.studentId === studentA.id);
    record("8.2 All applications in Student A list belong to Student A", true, allBelongToStuA && stuAList.length > 0);

    // Student A tries to pass studentId=studentB.id in query: must return 403 Forbidden!
    const stuABypassQuery = await request(`/api/applications?studentId=${studentB.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("8.3 Student A query with studentId of Student B -> 403 Forbidden", 403, stuABypassQuery.status);

    // Staff filter by studentId
    const staffFilterStu = await request(`/api/applications?studentId=${studentB.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("8.4 Staff query filter by studentId returns 200", 200, staffFilterStu.status);
    const staffFilterStuData = await staffFilterStu.json();
    record("8.5 Filtered list contains only Student B applications", true, staffFilterStuData.every((app) => app.studentId === studentB.id));

    // Staff filter by status
    const staffFilterStatus = await request("/api/applications?status=SELECTED", {
      headers: { Cookie: placementCookies },
    });
    record("8.6 Staff query filter by status=SELECTED returns 200", 200, staffFilterStatus.status);
    const staffFilterStatusData = await staffFilterStatus.json();
    record("8.7 Filtered list contains only SELECTED applications", true, staffFilterStatusData.every((app) => app.status === "SELECTED"));

    // ==========================================
    // SECTION 9: AUDIT LOG VERIFICATION (Tests 61 - 66)
    // ==========================================
    console.log("\nSection 9: Audit Log Verification");

    // Check CREATE audit log exists for app1Data
    const createAudit = await prisma.auditLog.findFirst({
      where: {
        entity: "Application",
        entityId: app1Data.id,
        action: "CREATE",
      },
    });
    record("9.1 AuditLog for Application CREATE exists", true, Boolean(createAudit));
    record("9.2 AuditLog records initial status APPLIED", "APPLIED", createAudit?.changes?.status);
    record("9.3 AuditLog userId matches Student A user ID", demoStudentUser.id, createAudit?.userId);

    // Check UPDATE audit log exists for app2Data (which transitioned to SELECTED)
    const updateAudit = await prisma.auditLog.findFirst({
      where: {
        entity: "Application",
        entityId: app2Data.id,
        action: "UPDATE",
      },
      orderBy: { createdAt: "desc" },
    });
    record("9.4 AuditLog for Application UPDATE exists", true, Boolean(updateAudit));
    record("9.5 AuditLog records after status SELECTED", "SELECTED", updateAudit?.changes?.after?.status);

    // Verify sensitive keys are NOT in audit logs
    const auditStr = JSON.stringify(updateAudit);
    record("9.6 AuditLog does not contain passwordHash or token", false, auditStr.includes("passwordHash") || auditStr.includes("token"));

    // ==========================================
    // SECTION 10: DATA INTEGRITY & BASELINE CLEANUP (Tests 67 - 78)
    // ==========================================
    console.log("\n--- TEARDOWN & DATABASE CLEANUP ---");

    // Clean up applications & audit logs
    if (createdApplicationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Application", entityId: { in: createdApplicationIds } },
      });
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      });
      createdApplicationIds.length = 0;
    }

    // Clean up vacancies
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
      });
      await prisma.vacancy.deleteMany({
        where: { id: { in: createdVacancyIds } },
      });
      createdVacancyIds.length = 0;
    }

    // Clean up employers
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Employer", entityId: { in: createdEmployerIds } },
      });
      await prisma.employer.deleteMany({
        where: { id: { in: createdEmployerIds } },
      });
      createdEmployerIds.length = 0;
    }

    // Reset student userId links
    if (studentB) {
      await prisma.student.update({
        where: { id: studentB.id },
        data: { userId: originalStudentBUserId },
      });
    }

    // Clean up temp users & audit logs
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

    record("10.1 Employers = 0", 0, employersCount);
    record("10.2 Vacancies = 0", 0, vacanciesCount);
    record("10.3 Applications = 0", 0, applicationsCount);
    record("10.4 Placements = 0", 0, placementsCount);
    record("10.5 Documents = 0", 0, documentsCount);
    record("10.6 Students = 21", 21, studentsCount);
    record("10.7 Enrollments = 21", 21, enrollmentsCount);
    record("10.8 Subjects = 6", 6, subjectsCount);
    record("10.9 Classes = 10", 10, classesCount);
    record("10.10 Schedules = 10", 10, schedulesCount);
    record("10.11 Instructors = 6", 6, instructorsCount);
    record("10.12 Users = 3", 3, usersCount /* Updated STEP 88 */);

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
    if (createdApplicationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Application", entityId: { in: createdApplicationIds } },
      }).catch(() => {});
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      }).catch(() => {});
    }
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
    if (studentB) {
      await prisma.student.update({
        where: { id: studentB.id },
        data: { userId: originalStudentBUserId },
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
