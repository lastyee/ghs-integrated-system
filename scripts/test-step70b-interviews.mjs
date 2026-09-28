// scripts/test-step70b-interviews.mjs
// Step 70B: Interview API & Business Logic Comprehensive Test Suite

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
    mutationFlag: "STEP70B_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "STEP70B_TEST_CONFIRM_DATABASE",
    baseUrl,
  });
  console.log("=== STEP 70B INTERVIEW API & BUSINESS LOGIC TEST SUITE ===\n");

  const createdUserIds = [];
  const createdRoleIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];
  const createdInterviewIds = [];

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
    const adminUser = await createTempUser("ADMIN", "test.admin70b@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic70b@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management70b@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement70b@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor70b@ghs.test"
    );
    const studentBUser = await createTempUser(
      "STUDENT",
      "test.studentb70b@ghs.test"
    );

    // Create a special role that has interview:read and interview:update but NOT interview:result
    const updateOnlyRole = await prisma.role.create({
      data: {
        name: "TEST_INTERVIEW_UPDATE_ONLY",
        description: "Test role with update permission only",
      },
    });
    createdRoleIds.push(updateOnlyRole.id);

    const updatePerms = await prisma.permission.findMany({
      where: { name: { in: ["interview:read", "interview:update"] } },
    });
    for (const p of updatePerms) {
      await prisma.rolePermission.create({
        data: { roleId: updateOnlyRole.id, permissionId: p.id },
      });
    }

    const updateOnlyUser = await prisma.user.create({
      data: {
        email: "test.updateonly70b@ghs.test",
        name: "Test Update Only",
        passwordHash: tempPasswordHash,
        roleId: updateOnlyRole.id,
      },
    });
    createdUserIds.push(updateOnlyUser.id);

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);
    const studentBCookies = await login(studentBUser.email, tempPassword);
    const updateOnlyCookies = await login(updateOnlyUser.email, tempPassword);

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

    await prisma.student.update({
      where: { id: studentB.id },
      data: { userId: studentBUser.id },
    });

    console.log("4. Setting up test Employer, Vacancy, and Applications...");
    const testEmployer = await prisma.employer.create({
      data: {
        name: "PT Grand Sukabumi Hotel 70B",
        companyInfo: "Hotel bintang 5 di Sukabumi",
        address: "Jl. Pelabuhan Ratu No. 10",
        contactName: "Budi Santoso",
        contactEmail: "hrd@grandsukabumi70b.test",
        contactPhone: "08123456789",
      },
    });
    createdEmployerIds.push(testEmployer.id);

    const testVacancy = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Front Desk Agent 70B",
        description: "Pelayanan tamu hotel",
        requirements: "Bahasa Inggris aktif",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(testVacancy.id);

    // Application for Student A
    const appA = await prisma.application.create({
      data: {
        studentId: studentA.id,
        vacancyId: testVacancy.id,
        status: "INTERVIEW",
        notes: "Kandidat lolos tahap screening",
      },
    });
    createdApplicationIds.push(appA.id);

    // Application for Student B
    const appB = await prisma.application.create({
      data: {
        studentId: studentB.id,
        vacancyId: testVacancy.id,
        status: "INTERVIEW",
        notes: "Kandidat Student B tahap interview",
      },
    });
    createdApplicationIds.push(appB.id);

    // Rejected Application
    const appRejected = await prisma.application.create({
      data: {
        studentId: studentA.id,
        vacancyId: testVacancy.id,
        status: "REJECTED",
        notes: "Kandidat ditolak pada screening",
      },
    });
    createdApplicationIds.push(appRejected.id);

    // Withdrawn Application
    const appWithdrawn = await prisma.application.create({
      data: {
        studentId: studentB.id,
        vacancyId: testVacancy.id,
        status: "WITHDRAWN",
        notes: "Lamaran ditarik oleh siswa",
      },
    });
    createdApplicationIds.push(appWithdrawn.id);

    console.log("5. Running Interview Tests...\n");

    // --- TEST GROUP 1: UNAUTHENTICATED & FORBIDDEN ROLES ---
    console.log("--- TEST GROUP 1: AUTHENTICATION & ACCESS CONTROL ---");

    const unauthRes = await request("/api/interviews");
    record("1.1 Unauthenticated GET /api/interviews returns 307 or 401", [307, 401].includes(unauthRes.status), true);

    const academicGet = await request("/api/interviews", {
      headers: { Cookie: academicCookies },
    });
    record("1.2 Academic Staff GET /api/interviews returns 403", 403, academicGet.status);

    const instructorGet = await request("/api/interviews", {
      headers: { Cookie: instructorCookies },
    });
    record("1.3 Instructor GET /api/interviews returns 403", 403, instructorGet.status);

    const studentPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentACookies },
      body: JSON.stringify({
        applicationId: appA.id,
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("1.4 Student POST /api/interviews returns 403", 403, studentPost.status);

    const managementPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({
        applicationId: appA.id,
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("1.5 Management POST /api/interviews returns 403", 403, managementPost.status);

    // --- TEST GROUP 2: POST /api/interviews VALIDATION ---
    console.log("\n--- TEST GROUP 2: POST /api/interviews VALIDATION ---");

    const invalidAppPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: "nonexistent-app-id",
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("2.1 POST with nonexistent applicationId returns 404", 404, invalidAppPost.status);

    const invalidDatePost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appA.id,
        scheduledAt: "invalid-date-format",
      }),
    });
    record("2.2 POST with invalid scheduledAt returns 400", 400, invalidDatePost.status);

    const missingAppPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("2.3 POST with missing applicationId returns 400", 400, missingAppPost.status);

    const rejectedAppPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appRejected.id,
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("2.4 POST for REJECTED application returns 409", 409, rejectedAppPost.status);

    const withdrawnAppPost = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appWithdrawn.id,
        scheduledAt: "2026-09-30T10:00:00.000Z",
      }),
    });
    record("2.5 POST for WITHDRAWN application returns 409", 409, withdrawnAppPost.status);

    // --- TEST GROUP 3: SUCCESSFUL CREATION & MULTI-INTERVIEW ---
    console.log("\n--- TEST GROUP 3: INTERVIEW CREATION & MULTI-INTERVIEW ---");

    const createResA1 = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appA.id,
        scheduledAt: "2026-09-28T09:00:00.000Z",
        method: "Online",
        location: "https://meet.google.com/test-room-1",
        notes: "Wawancara Tahap 1",
      }),
    });
    record("3.1 Placement Staff creates interview for App A returns 201", 201, createResA1.status);
    const interviewA1 = await createResA1.json();
    createdInterviewIds.push(interviewA1.id);

    record("3.2 Created interview has status PENDING", "PENDING", interviewA1.status);
    record("3.3 Created interview has correct applicationId", appA.id, interviewA1.applicationId);
    record("3.4 Created interview method is Online", "Online", interviewA1.method);

    // Multi-interview for same application (Round 2)
    const createResA2 = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appA.id,
        scheduledAt: "2026-10-02T14:00:00.000Z",
        method: "On-site",
        location: "Ruang Rapat 2 Lantai 3",
        notes: "Wawancara Tahap 2 (User / GM)",
      }),
    });
    record("3.5 Placement Staff creates multi-round interview returns 201", 201, createResA2.status);
    const interviewA2 = await createResA2.json();
    createdInterviewIds.push(interviewA2.id);

    // Interview for Student B
    const createResB = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appB.id,
        scheduledAt: "2026-09-29T11:00:00.000Z",
        method: "Online",
        location: "https://meet.google.com/test-room-b",
        notes: "Wawancara Student B",
      }),
    });
    record("3.6 Placement Staff creates interview for App B returns 201", 201, createResB.status);
    const interviewB = await createResB.json();
    createdInterviewIds.push(interviewB.id);

    // Verify Application status is NOT automatically altered
    const appACheck = await prisma.application.findUnique({ where: { id: appA.id } });
    record("3.7 Application status NOT automatically changed", "INTERVIEW", appACheck.status);

    // --- TEST GROUP 4: GET LISTING & STUDENT SCOPING / IDOR ---
    console.log("\n--- TEST GROUP 4: GET LISTING & STUDENT SCOPING ---");

    const placementGet = await request("/api/interviews", {
      headers: { Cookie: placementCookies },
    });
    record("4.1 Placement Staff GET /api/interviews returns 200", 200, placementGet.status);
    const placementList = await placementGet.json();
    record("4.2 Placement Staff sees all created interviews", true, placementList.length >= 3);

    const adminGet = await request("/api/interviews", {
      headers: { Cookie: adminCookies },
    });
    record("4.2b Admin GET /api/interviews returns 200", 200, adminGet.status);

    const managementGet = await request("/api/interviews", {
      headers: { Cookie: managementCookies },
    });
    record("4.3 Management GET /api/interviews returns 200", 200, managementGet.status);
    const managementList = await managementGet.json();
    record("4.4 Management sees all interviews (global read-only)", true, managementList.length >= 3);

    const studentAGet = await request("/api/interviews", {
      headers: { Cookie: studentACookies },
    });
    record("4.5 Student A GET /api/interviews returns 200", 200, studentAGet.status);
    const studentAList = await studentAGet.json();
    const studentAHasOnlyOwn = studentAList.every(
      (iv) => iv.application?.student?.userId === demoStudentUser.id
    );
    record("4.6 Student A list only contains own interviews", true, studentAHasOnlyOwn && studentAList.length === 2);

    const studentBGet = await request("/api/interviews", {
      headers: { Cookie: studentBCookies },
    });
    const studentBList = await studentBGet.json();
    record("4.7 Student B list contains only 1 interview", 1, studentBList.length);
    record("4.8 Student B list does NOT contain Student A interviews", false, studentBList.some((iv) => iv.id === interviewA1.id));

    // Student A tries to query studentId of Student B
    const studentASpoofQuery = await request(`/api/interviews?studentId=${studentB.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("4.9 Student querying other studentId returns 403 Forbidden", 403, studentASpoofQuery.status);

    // Filter by status on staff side
    const filterPending = await request("/api/interviews?status=PENDING", {
      headers: { Cookie: placementCookies },
    });
    record("4.10 Filter by status=PENDING returns 200", 200, filterPending.status);

    // Filter by applicationId on staff side
    const filterAppA = await request(`/api/interviews?applicationId=${appA.id}`, {
      headers: { Cookie: placementCookies },
    });
    const filterAppAList = await filterAppA.json();
    record("4.11 Filter by applicationId returns exactly 2 records", 2, filterAppAList.length);

    // --- TEST GROUP 5: GET DETAIL & IDOR PROTECTION ---
    console.log("\n--- TEST GROUP 5: GET DETAIL & IDOR PROTECTION ---");

    const studentAGetOwn = await request(`/api/interviews/${interviewA1.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("5.1 Student A GET own interview detail returns 200", 200, studentAGetOwn.status);

    const studentAGetOther = await request(`/api/interviews/${interviewB.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("5.2 Student A GET Student B interview detail returns 403", 403, studentAGetOther.status);

    const studentBGetOther = await request(`/api/interviews/${interviewA1.id}`, {
      headers: { Cookie: studentBCookies },
    });
    record("5.3 Student B GET Student A interview detail returns 403", 403, studentBGetOther.status);

    const nonexistentDetail = await request("/api/interviews/nonexistent-interview-id", {
      headers: { Cookie: placementCookies },
    });
    record("5.4 GET nonexistent interview returns 404", 404, nonexistentDetail.status);

    // Verify passwordHash is never exposed in response
    const detailData = await studentAGetOwn.json();
    const detailString = JSON.stringify(detailData);
    record("5.5 passwordHash is not present in response", false, detailString.includes("passwordHash"));

    // --- TEST GROUP 6: PRIVACY OF FEEDBACK ---
    console.log("\n--- TEST GROUP 6: FEEDBACK PRIVACY (STUDENT VS STAFF) ---");

    // Add feedback to interviewA1 as placement staff
    await prisma.interview.update({
      where: { id: interviewA1.id },
      data: { feedback: "Kandidat memiliki gestur baik, bahasa Inggris memuaskan." },
    });

    const staffCheckPrivacy = await request(`/api/interviews/${interviewA1.id}`, {
      headers: { Cookie: placementCookies },
    });
    const staffDetail = await staffCheckPrivacy.json();
    record("6.1 Placement Staff receives feedback field", true, typeof staffDetail.feedback === "string");

    const studentCheckPrivacy = await request(`/api/interviews/${interviewA1.id}`, {
      headers: { Cookie: studentACookies },
    });
    const studentDetail = await studentCheckPrivacy.json();
    record("6.2 Student does NOT receive feedback field", true, studentDetail.feedback === undefined);

    const studentListPrivacy = await request("/api/interviews", {
      headers: { Cookie: studentACookies },
    });
    const studentListJson = await studentListPrivacy.json();
    const studentListHasNoFeedback = studentListJson.every((iv) => iv.feedback === undefined);
    record("6.3 Student listing has NO feedback field on any item", true, studentListHasNoFeedback);

    // --- TEST GROUP 7: OPERATIONAL PATCH (UPDATE) ---
    console.log("\n--- TEST GROUP 7: OPERATIONAL PATCH (interview:update) ---");

    const studentPatch = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentACookies },
      body: JSON.stringify({ scheduledAt: "2026-10-01T10:00:00.000Z" }),
    });
    record("7.1 Student PATCH returns 403 Forbidden", 403, studentPatch.status);

    const academicPatch = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: academicCookies },
      body: JSON.stringify({ scheduledAt: "2026-10-01T10:00:00.000Z" }),
    });
    record("7.2 Academic Staff PATCH returns 403 Forbidden", 403, academicPatch.status);

    const instructorPatch = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: instructorCookies },
      body: JSON.stringify({ scheduledAt: "2026-10-01T10:00:00.000Z" }),
    });
    record("7.3 Instructor PATCH returns 403 Forbidden", 403, instructorPatch.status);

    const staffPatchTime = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        scheduledAt: "2026-09-28T10:30:00.000Z",
        location: "https://meet.google.com/new-room-1",
        notes: "Jadwal digeser 30 menit",
      }),
    });
    record("7.4 Placement Staff operational update returns 200", 200, staffPatchTime.status);
    const patchedIv = await staffPatchTime.json();
    record("7.5 Updated location saved", "https://meet.google.com/new-room-1", patchedIv.location);

    // Reschedule
    const staffReschedule = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        status: "RESCHEDULED",
        scheduledAt: "2026-09-29T13:00:00.000Z",
        notes: "Kandidat berhalangan, jadwal diundur ke esok hari",
      }),
    });
    record("7.6 Placement Staff sets status RESCHEDULED returns 200", 200, staffReschedule.status);
    const rescheduledIv = await staffReschedule.json();
    record("7.7 Status is now RESCHEDULED", "RESCHEDULED", rescheduledIv.status);

    // General update trying invalid status like CANCELLED
    const invalidStatusPatch = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    record("7.8 General update with CANCELLED returns 400 Bad Request", 400, invalidStatusPatch.status);

    // --- TEST GROUP 8: RESULT EVALUATION & LIFECYCLE ENFORCEMENT ---
    console.log("\n--- TEST GROUP 8: RESULT EVALUATION (interview:result) & LIFECYCLE ---");

    // Attempt to set PASSED using user with ONLY interview:update (no interview:result)
    const updateOnlyTryResult = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: updateOnlyCookies },
      body: JSON.stringify({
        status: "PASSED",
        feedback: "Hasil memuaskan",
      }),
    });
    record("8.1 User WITHOUT interview:result setting PASSED returns 403", 403, updateOnlyTryResult.status);

    const updateOnlyTryFailed = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: updateOnlyCookies },
      body: JSON.stringify({
        status: "FAILED",
        feedback: "Hasil kurang",
      }),
    });
    record("8.2 User WITHOUT interview:result setting FAILED returns 403", 403, updateOnlyTryFailed.status);

    // Lifecycle 1: PENDING -> PASSED
    const passIvA2 = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        status: "PASSED",
        feedback: "Kandidat direkomendasikan untuk posisi Front Desk Agent.",
      }),
    });
    record("8.3 Lifecycle PENDING -> PASSED returns 200", 200, passIvA2.status);
    const passedDataA2 = await passIvA2.json();
    record("8.4 Status is now PASSED", "PASSED", passedDataA2.status);

    // Lifecycle 2: PENDING -> FAILED (using interviewB)
    const failIvB = await request(`/api/interviews/${interviewB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        status: "FAILED",
        feedback: "Kandidat belum memenuhi standar bahasa Inggris.",
      }),
    });
    record("8.5 Lifecycle PENDING -> FAILED returns 200", 200, failIvB.status);
    const failedDataB = await failIvB.json();
    record("8.6 Status is now FAILED", "FAILED", failedDataB.status);

    // Lifecycle 3: RESCHEDULED -> PASSED (interviewA1 is RESCHEDULED)
    const passRescheduled = await request(`/api/interviews/${interviewA1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        status: "PASSED",
        feedback: "Wawancara ulang selesai dan dinyatakan lolos.",
      }),
    });
    record("8.7 Lifecycle RESCHEDULED -> PASSED returns 200", 200, passRescheduled.status);
    const passedA1 = await passRescheduled.json();
    record("8.8 Status is now PASSED from RESCHEDULED", "PASSED", passedA1.status);

    // Create a new interview for RESCHEDULED -> FAILED testing
    const createIvFail = await request("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        applicationId: appB.id,
        scheduledAt: "2026-10-05T09:00:00.000Z",
        method: "Online",
      }),
    });
    const ivFailObj = await createIvFail.json();
    createdInterviewIds.push(ivFailObj.id);

    await request(`/api/interviews/${ivFailObj.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "RESCHEDULED" }),
    });

    const failRescheduled = await request(`/api/interviews/${ivFailObj.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        status: "FAILED",
        feedback: "Tidak hadir pada jadwal ulang.",
      }),
    });
    record("8.9 Lifecycle RESCHEDULED -> FAILED returns 200", 200, failRescheduled.status);

    // Terminal Violations:
    // PASSED -> FAILED rejected
    const passedToFailed = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "FAILED" }),
    });
    record("8.10 Terminal violation PASSED -> FAILED returns 409", 409, passedToFailed.status);

    // FAILED -> PASSED rejected
    const failedToPassed = await request(`/api/interviews/${interviewB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "PASSED" }),
    });
    record("8.11 Terminal violation FAILED -> PASSED returns 409", 409, failedToPassed.status);

    // PASSED -> RESCHEDULED rejected
    const passedToRescheduled = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "RESCHEDULED" }),
    });
    record("8.12 Terminal violation PASSED -> RESCHEDULED returns 409", 409, passedToRescheduled.status);

    // FAILED -> RESCHEDULED rejected
    const failedToRescheduled = await request(`/api/interviews/${interviewB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "RESCHEDULED" }),
    });
    record("8.13 Terminal violation FAILED -> RESCHEDULED returns 409", 409, failedToRescheduled.status);

    // Operational update on terminal PASSED interview rejected
    const updatePassedIv = await request(`/api/interviews/${interviewA2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ location: "Gedung Utama" }),
    });
    record("8.14 Operational update on terminal interview returns 409", 409, updatePassedIv.status);

    // --- TEST GROUP 9: DELETE (METHOD NOT ALLOWED) ---
    console.log("\n--- TEST GROUP 9: DELETE METHOD NOT ALLOWED ---");

    const deleteDetailRes = await request(`/api/interviews/${interviewA1.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("9.1 DELETE /api/interviews/[id] returns 405", 405, deleteDetailRes.status);

    const deleteListRes = await request("/api/interviews", {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("9.2 DELETE /api/interviews returns 405", 405, deleteListRes.status);

    // --- TEST GROUP 10: AUDIT LOG VERIFICATION ---
    console.log("\n--- TEST GROUP 10: AUDIT LOG VERIFICATION ---");

    const createAudits = await prisma.auditLog.findMany({
      where: { entity: "Interview", action: "CREATE", entityId: interviewA1.id },
    });
    record("10.1 Audit log for CREATE interview exists", true, createAudits.length >= 1);

    const updateAudits = await prisma.auditLog.findMany({
      where: { entity: "Interview", action: "UPDATE", entityId: interviewA1.id },
    });
    record("10.2 Audit log for UPDATE/RESULT interview exists", true, updateAudits.length >= 1);

    // Verify audit logs do not contain sensitive tokens or passwords
    const sampleAudit = updateAudits[0];
    const auditString = JSON.stringify(sampleAudit.changes);
    record("10.3 Audit log changes do not contain password/token", false, auditString.includes("password"));

    console.log("\n6. Cleaning up test data & verifying baseline...");

    // Clean up created records
    await prisma.auditLog.deleteMany({
      where: { entity: "Interview", entityId: { in: createdInterviewIds } },
    });
    await prisma.interview.deleteMany({
      where: { id: { in: createdInterviewIds } },
    });
    createdInterviewIds.length = 0;

    await prisma.auditLog.deleteMany({
      where: { entity: "Application", entityId: { in: createdApplicationIds } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
    });
    createdApplicationIds.length = 0;

    await prisma.auditLog.deleteMany({
      where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
    });
    await prisma.vacancy.deleteMany({
      where: { id: { in: createdVacancyIds } },
    });
    createdVacancyIds.length = 0;

    await prisma.auditLog.deleteMany({
      where: { entity: "Employer", entityId: { in: createdEmployerIds } },
    });
    await prisma.employer.deleteMany({
      where: { id: { in: createdEmployerIds } },
    });
    createdEmployerIds.length = 0;

    if (studentB) {
      await prisma.student.update({
        where: { id: studentB.id },
        data: { userId: originalStudentBUserId },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }

    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
      createdRoleIds.length = 0;
    }

    // Verify Master Database Baseline
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

    console.log("\n--- VERIFYING MASTER DATABASE BASELINE ---");
    record("11.1 Employers = 0", 0, employersCount);
    record("11.2 Vacancies = 0", 0, vacanciesCount);
    record("11.3 Applications = 0", 0, applicationsCount);
    record("11.4 Interviews = 0", 0, interviewsCount);
    record("11.5 Placements = 0", 0, placementsCount);
    record("11.6 Documents = 0", 0, documentsCount);
    record("11.7 Students = 21", 21, studentsCount);
    record("11.8 Enrollments = 21", 21, enrollmentsCount);
    record("11.9 Subjects = 6", 6, subjectsCount);
    record("11.10 Classes = 10", 10, classesCount);
    record("11.11 Schedules = 10", 10, schedulesCount);
    record("11.12 Instructors = 6", 6, instructorsCount);
    record("11.13 Users = 3", 3, usersCount /* Updated STEP 88 */);

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
    // Safety cleanup
    if (createdInterviewIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Interview", entityId: { in: createdInterviewIds } },
      }).catch(() => {});
      await prisma.interview.deleteMany({
        where: { id: { in: createdInterviewIds } },
      }).catch(() => {});
    }
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
    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      }).catch(() => {});
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
