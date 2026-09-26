// scripts/test-step76-user-profile-ui.mjs
// Step 76: User Account, Student Profile & Global GHS UI Verification Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function record(name, expected, actual, category = "STEP 76") {
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
  const headers = {
    "X-Forwarded-For": "198.51.100.76",
  };
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
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, data: json, headers: res.headers };
}

async function main() {
  console.log("==================================================");
  console.log("STEP 76: USER ACCOUNT, STUDENT PROFILE & UI AUDIT");
  console.log("==================================================");

  let adminCookies = "";
  let studentCookies = "";
  let activatedTestUserId = null;
  const testNim = "260405064"; // RAFLI AULIA RAHMAN
  const testStudentName = "RAFLI AULIA RAHMAN";
  const testEmail = "rafli.test@ghs.local";
  const testPassword = "securepassword123";

  try {
    // 1. Authenticate baseline users
    adminCookies = await login("admin.demo@ghs.local", "superadmin123");
    studentCookies = await login("student.demo@ghs.local", "murid123");
    record("Super Admin authenticated successfully", true, Boolean(adminCookies), "AUTH");
    record("Student Demo authenticated successfully", true, Boolean(studentCookies), "AUTH");

    // 2. Student Activation Security & Contract
    console.log("\n--- PART 1: STUDENT ACTIVATION API ---");

    // 2.1 Validation failure: empty fields
    const valRes = await api("POST", "/api/auth/activate", "", {});
    record("Activation rejects empty payload with 400", 400, valRes.status, "ACTIVATION");

    // 2.2 Rejects non-existent NIM
    const nonExistRes = await api("POST", "/api/auth/activate", "", {
      nim: "999999999",
      name: "Non Existent Student",
      email: "fake@ghs.local",
      password: "password123",
    });
    record("Activation rejects non-existent NIM with 404", 404, nonExistRes.status, "ACTIVATION");

    // 2.3 Rejects mismatched student name
    const mismatchRes = await api("POST", "/api/auth/activate", "", {
      nim: testNim,
      name: "WRONG NAME",
      email: testEmail,
      password: testPassword,
    });
    record("Activation rejects name mismatch with 400", 400, mismatchRes.status, "ACTIVATION");

    // 2.4 Rejects already activated student (TIARA ISMI LAILA - 260405066)
    const alreadyActRes = await api("POST", "/api/auth/activate", "", {
      nim: "260405066",
      name: "TIARA ISMI LAILA",
      email: "tiara.new@ghs.local",
      password: testPassword,
    });
    record("Activation rejects already activated student with 409", 409, alreadyActRes.status, "ACTIVATION");

    // 2.5 Rejects if email already taken
    const dupEmailRes = await api("POST", "/api/auth/activate", "", {
      nim: testNim,
      name: testStudentName,
      email: "admin.demo@ghs.local",
      password: testPassword,
    });
    record("Activation rejects duplicate email with 409", 409, dupEmailRes.status, "ACTIVATION");

    // 2.6 Successful activation of unactivated student
    const actSuccessRes = await api("POST", "/api/auth/activate", "", {
      nim: testNim,
      name: testStudentName,
      email: testEmail,
      password: testPassword,
    });
    record("Successful activation returns 201", 201, actSuccessRes.status, "ACTIVATION");
    record("Activation returns success boolean", true, actSuccessRes.data?.success === true, "ACTIVATION");
    record("Activation does NOT leak passwordHash", undefined, actSuccessRes.data?.user?.passwordHash, "ACTIVATION");

    activatedTestUserId = actSuccessRes.data?.user?.id;
    record("Activation returns user id", true, Boolean(activatedTestUserId), "ACTIVATION");

    // 2.7 Verify DB state
    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { role: true, student: true },
    });
    record("Created user has role STUDENT", "STUDENT", createdUser?.role?.name, "ACTIVATION");
    record("Student record is linked to new user", testNim, createdUser?.student?.nim, "ACTIVATION");
    record("Password is validly hashed with bcrypt", true, await bcrypt.compare(testPassword, createdUser?.passwordHash || ""), "ACTIVATION");

    // 2.8 Concurrent / second activation with same NIM now blocked
    const secondActRes = await api("POST", "/api/auth/activate", "", {
      nim: testNim,
      name: testStudentName,
      email: "another.email@ghs.local",
      password: testPassword,
    });
    record("Second activation of now-activated student returns 409", 409, secondActRes.status, "ACTIVATION");

    // 2.9 Test newly activated user can log in
    let newStudentCookies = "";
    try {
      newStudentCookies = await login(testEmail, testPassword);
    } catch {
      newStudentCookies = "";
    }
    record("Newly activated student can successfully log in", true, Boolean(newStudentCookies), "ACTIVATION");

    // 3. Student Profile API & Security
    console.log("\n--- PART 2: STUDENT PROFILE API & SECURITY ---");

    // 3.1 Unauthenticated profile access -> 401
    const unauthProf = await api("GET", "/api/profile", "");
    record("Unauthenticated GET /api/profile returns 401", 401, unauthProf.status, "PROFILE");

    // 3.2 Authenticated student GET /api/profile
    const studentProf = await api("GET", "/api/profile", studentCookies);
    record("Student GET /api/profile returns 200", 200, studentProf.status, "PROFILE");
    record("Profile returns correct student name (TIARA ISMI LAILA)", "TIARA ISMI LAILA", studentProf.data?.name, "PROFILE");
    record("Profile returns correct NIM (260405066)", "260405066", studentProf.data?.nim, "PROFILE");
    record("Profile returns user email (student.demo@ghs.local)", "student.demo@ghs.local", studentProf.data?.email, "PROFILE");
    record("Profile returns enrollment batch (GHI-07)", "GHI-07", studentProf.data?.enrollment?.batchName, "PROFILE");
    record("Profile returns enrollment program (HTP)", "HTP", studentProf.data?.enrollment?.programCode, "PROFILE");

    // 3.3 Query spoofing attempt: student passes ?studentId=other
    const spoofProf = await api("GET", "/api/profile?studentId=cmuc5fakeid", studentCookies);
    record("Profile ignores query studentId and still returns own profile", "260405066", spoofProf.data?.nim, "PROFILE");

    // 3.4 Student profile update: phone & address
    const updateRes = await api("PATCH", "/api/profile", studentCookies, {
      phone: "081234567890",
      address: "Jl. Bhayangkara No. 12, Sukabumi",
    });
    record("Student can update own phone and address (200)", 200, updateRes.status, "PROFILE");
    record("Updated profile returns new phone", "081234567890", updateRes.data?.data?.phone, "PROFILE");
    record("Updated profile returns new address", "Jl. Bhayangkara No. 12, Sukabumi", updateRes.data?.data?.address, "PROFILE");

    // 3.5 Student cannot mutate academic ownership fields (NIM, name, userId, etc.)
    const mutateAcademic = await api("PATCH", "/api/profile", studentCookies, {
      nim: "999999999",
      name: "HACKED NAME",
      userId: "hacked-user",
      role: "SUPER_ADMIN",
    });
    // Schema is strict so it rejects unexpected properties with 400
    record("Student attempting to mutate academic fields is rejected with 400", 400, mutateAcademic.status, "SECURITY");

    // Re-verify student NIM in DB is untouched
    const verifiedStudent = await prisma.student.findUnique({
      where: { nim: "260405066" },
      select: { name: true, nim: true },
    });
    record("Student NIM remains unaltered in database", "260405066", verifiedStudent?.nim, "SECURITY");
    record("Student Name remains unaltered in database", "TIARA ISMI LAILA", verifiedStudent?.name, "SECURITY");

    // 3.6 Non-student (Admin) GET /api/profile returns user info
    const adminProf = await api("GET", "/api/profile", adminCookies);
    record("Admin GET /api/profile returns 200", 200, adminProf.status, "PROFILE");
    record("Admin profile returns role SUPER_ADMIN", "SUPER_ADMIN", adminProf.data?.role, "PROFILE");

    // 3.7 Non-student (Admin) PATCH /api/profile returns 403 Forbidden
    const adminPatch = await api("PATCH", "/api/profile", adminCookies, {
      phone: "0899999999",
    });
    record("Admin PATCH /api/profile returns 403 Forbidden", 403, adminPatch.status, "SECURITY");

    // 4. User Management API & Visibility
    console.log("\n--- PART 3: USER MANAGEMENT API ---");

    // 4.1 Unauthenticated GET /api/users -> 401
    const unauthUsers = await api("GET", "/api/users", "");
    record("Unauthenticated GET /api/users returns 401", 401, unauthUsers.status, "USER_MGMT");

    // 4.2 Student GET /api/users -> 403 Forbidden
    const studentUsers = await api("GET", "/api/users", studentCookies);
    record("Student GET /api/users returns 403 Forbidden", 403, studentUsers.status, "USER_MGMT");

    // 4.3 Super Admin GET /api/users -> 200
    const adminUsers = await api("GET", "/api/users", adminCookies);
    record("Super Admin GET /api/users returns 200", 200, adminUsers.status, "USER_MGMT");
    record("User management returns users list array", true, Array.isArray(adminUsers.data?.users), "USER_MGMT");
    record("User management returns stats object", true, Boolean(adminUsers.data?.stats), "USER_MGMT");
    record("Total students in stats equals 21", 21, adminUsers.data?.stats?.totalStudents, "USER_MGMT");

    // 5. Page Routes Availability
    console.log("\n--- PART 4: PAGE ROUTES AUDIT ---");
    const loginPageRes = await request("/login");
    record("GET /login returns 200", 200, loginPageRes.status, "PAGES");

    const activatePageRes = await request("/activate");
    record("GET /activate returns 200", 200, activatePageRes.status, "PAGES");

    const profilePageRes = await request("/profile", {
      headers: { Cookie: studentCookies },
    });
    record("GET /profile with student session returns 200", 200, profilePageRes.status, "PAGES");

    const usersPageRes = await request("/users", {
      headers: { Cookie: adminCookies },
    });
    record("GET /users with admin session returns 200", 200, usersPageRes.status, "PAGES");

  } finally {
    // 6. Database Cleanup & Baseline Restoration
    console.log("\n--- PART 5: CLEANUP & BASELINE RESTORATION ---");

    // Unlink test student and delete test user
    await prisma.student.updateMany({
      where: { nim: testNim },
      data: { userId: null, phone: null, address: null },
    });

    if (activatedTestUserId) {
      await prisma.auditLog.deleteMany({
        where: { userId: activatedTestUserId },
      });
      await prisma.user.deleteMany({
        where: { id: activatedTestUserId },
      });
    }

    // Reset Demo Student contact info to clean baseline
    await prisma.student.updateMany({
      where: { nim: "260405066" },
      data: { phone: null, address: null },
    });

    // Delete test audit logs generated by update test
    await prisma.auditLog.deleteMany({
      where: { action: { in: ["ACTIVATE_ACCOUNT", "UPDATE"] } },
    });

    // Verify baseline counts across all models
    const [
      userCount,
      instructorCount,
      programCount,
      batchCount,
      studentCount,
      enrollmentCount,
      subjectCount,
      classCount,
      scheduleCount,
      employerCount,
      vacancyCount,
      applicationCount,
      interviewCount,
      placementCount,
      documentCount,
      certificateCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.instructor.count(),
      prisma.program.count(),
      prisma.batch.count(),
      prisma.student.count(),
      prisma.enrollment.count(),
      prisma.subject.count(),
      prisma.class.count(),
      prisma.schedule.count(),
      prisma.employer.count(),
      prisma.vacancy.count(),
      prisma.application.count(),
      prisma.interview.count(),
      prisma.placement.count(),
      prisma.document.count(),
      prisma.certificate.count(),
    ]);

    record("Baseline Users = 2", 2, userCount, "BASELINE");
    record("Baseline Instructors = 6", 6, instructorCount, "BASELINE");
    record("Baseline Programs = 1", 1, programCount, "BASELINE");
    record("Baseline Batches = 2", 2, batchCount, "BASELINE");
    record("Baseline Students = 21", 21, studentCount, "BASELINE");
    record("Baseline Enrollments = 21", 21, enrollmentCount, "BASELINE");
    record("Baseline Subjects = 6", 6, subjectCount, "BASELINE");
    record("Baseline Classes = 10", 10, classCount, "BASELINE");
    record("Baseline Schedules = 10", 10, scheduleCount, "BASELINE");
    record("Baseline Employers = 0", 0, employerCount, "BASELINE");
    record("Baseline Vacancies = 0", 0, vacancyCount, "BASELINE");
    record("Baseline Applications = 0", 0, applicationCount, "BASELINE");
    record("Baseline Interviews = 0", 0, interviewCount, "BASELINE");
    record("Baseline Placements = 0", 0, placementCount, "BASELINE");
    record("Baseline Documents = 0", 0, documentCount, "BASELINE");
    record("Baseline Certificates = 0", 0, certificateCount, "BASELINE");
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log("\n==================================================");
  console.log(`STEP 76 TEST SUMMARY: ${passedCount}/${results.length} PASSED`);
  if (failedCount > 0) {
    console.error(`FAILED: ${failedCount} assertions`);
    process.exit(1);
  } else {
    console.log("ALL ASSERTIONS PASSED!");
  }
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in test-step76:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
