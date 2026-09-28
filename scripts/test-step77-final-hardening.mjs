// scripts/test-step77-final-hardening.mjs
// Step 77: Final Security, Identity & Completion Hardening Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP77_FINAL_HARDENING_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP77_FINAL_HARDENING_CONFIRM_DATABASE",
});
const prisma = new PrismaClient();

const results = [];

function record(name, expected, actual, category = "STEP 77") {
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
    "X-Forwarded-For": "198.51.100.77",
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
  console.log("STEP 77: FINAL SECURITY, IDENTITY & COMPLETION AUDIT");
  console.log("==================================================");

  let adminCookies = "";
  let studentCookies = "";
  let activatedTestUserId = null;
  let unlinkedStudentUserId = null;

  const testNim = "260405065"; // SAHRUL GUNAWAN (Unlinked in baseline)
  const testStudentName = "SAHRUL GUNAWAN";
  const testEmail = "sahrul.test77@ghs.local";
  const testPassword = "password77secure";

  try {
    // 1. Authenticate baseline users
    adminCookies = await login("admin.demo@ghs.local", "superadmin123");
    studentCookies = await login("student.demo@ghs.local", "murid123");
    record("Super Admin login valid", true, Boolean(adminCookies), "AUTH");
    record("Student Demo login valid", true, Boolean(studentCookies), "AUTH");

    // =========================================================================
    // PART 1: 10 MANDATORY ACTIVATION SECURITY TESTS
    // =========================================================================
    console.log("\n--- PART 1: 10 ACTIVATION SECURITY & ACCOUNT CLAIM TESTS ---");

    // Test 1: NIM benar + nama benar -> Success (201)
    const actRes1 = await api("POST", "/api/auth/activate", "", {
      nim: testNim,
      name: testStudentName,
      email: testEmail,
      password: testPassword,
    });
    record("1. NIM benar + nama benar -> 201 Created", 201, actRes1.status, "ACTIVATION_SECURITY");
    activatedTestUserId = actRes1.data?.user?.id;
    record("1b. Activation returns user ID", true, Boolean(activatedTestUserId), "ACTIVATION_SECURITY");

    // Test 2: NIM benar + nama salah -> Rejection (400)
    const actRes2 = await api("POST", "/api/auth/activate", "", {
      nim: "260405064", // RAFLI AULIA RAHMAN
      name: "SALAH NAMA",
      email: "wrong.name@ghs.local",
      password: "password123",
    });
    record("2. NIM benar + nama salah -> 400 Bad Request", 400, actRes2.status, "ACTIVATION_SECURITY");

    // Test 3: NIM tidak ada -> Rejection (404)
    const actRes3 = await api("POST", "/api/auth/activate", "", {
      nim: "999999999",
      name: "Non Existent",
      email: "non.exist@ghs.local",
      password: "password123",
    });
    record("3. NIM tidak ada -> 404 Not Found", 404, actRes3.status, "ACTIVATION_SECURITY");

    // Test 4: Student sudah punya account -> Rejection (409)
    const actRes4 = await api("POST", "/api/auth/activate", "", {
      nim: "260405066", // TIARA ISMI LAILA (linked to student.demo)
      name: "TIARA ISMI LAILA",
      email: "tiara.tryagain@ghs.local",
      password: "password123",
    });
    record("4. Student sudah punya account -> 409 Conflict", 409, actRes4.status, "ACTIVATION_SECURITY");

    // Test 5: Email sudah digunakan -> Rejection (409)
    const actRes5 = await api("POST", "/api/auth/activate", "", {
      nim: "260405067", // KHALIF FAUZI
      name: "KHALIF FAUZI",
      email: "admin.demo@ghs.local", // Existing admin email
      password: "password123",
    });
    record("5. Email sudah digunakan -> 409 Conflict", 409, actRes5.status, "ACTIVATION_SECURITY");

    // Test 6: Concurrent activation attempt -> Rejection (409)
    const actRes6 = await api("POST", "/api/auth/activate", "", {
      nim: testNim, // Already activated in Test 1
      name: testStudentName,
      email: "sahrul.second@ghs.local",
      password: "password123",
    });
    record("6. Concurrent activation attempt -> 409 Conflict", 409, actRes6.status, "ACTIVATION_SECURITY");

    // Test 7: studentId spoofing attempt -> Rejection (400)
    const actRes7 = await api("POST", "/api/auth/activate", "", {
      nim: "260405067",
      name: "KHALIF FAUZI",
      email: "khalif.spoof@ghs.local",
      password: "password123",
      studentId: "cmuf0spoofedid", // Forbidden extra field
    });
    record("7. studentId spoofing attempt rejected -> 400 Bad Request", 400, actRes7.status, "ACTIVATION_SECURITY");

    // Test 8: role spoofing attempt -> Rejection (400)
    const actRes8 = await api("POST", "/api/auth/activate", "", {
      nim: "260405067",
      name: "KHALIF FAUZI",
      email: "khalif.role@ghs.local",
      password: "password123",
      role: "SUPER_ADMIN", // Forbidden role spoofing
    });
    record("8. role spoofing attempt rejected -> 400 Bad Request", 400, actRes8.status, "ACTIVATION_SECURITY");

    // Test 9: extra fields attempt -> Rejection (400)
    const actRes9 = await api("POST", "/api/auth/activate", "", {
      nim: "260405067",
      name: "KHALIF FAUZI",
      email: "khalif.extra@ghs.local",
      password: "password123",
      roleId: "cmuc5roleid", // Forbidden roleId
      isAdmin: true,
      status: "COMPLETED",
    });
    record("9. Extra unexpected fields rejected -> 400 Bad Request", 400, actRes9.status, "ACTIVATION_SECURITY");

    // Test 10: passwordHash exposure check
    record("10a. Activation response data has no passwordHash", undefined, actRes1.data?.passwordHash, "ACTIVATION_SECURITY");
    record("10b. Activation user object has no passwordHash", undefined, actRes1.data?.user?.passwordHash, "ACTIVATION_SECURITY");

    // Verify created user properties in database
    const dbUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { role: true, student: true },
    });
    record("Created user role strictly equals STUDENT", "STUDENT", dbUser?.role?.name, "USER_STUDENT_INTEGRITY");
    record("Created user is linked to correct student NIM", testNim, dbUser?.student?.nim, "USER_STUDENT_INTEGRITY");
    record("Password stored as bcrypt hash (not plaintext)", true, dbUser?.passwordHash.startsWith("$2"), "USER_STUDENT_INTEGRITY");

    // =========================================================================
    // PART 2: USER ↔ STUDENT INTEGRITY & UNLINKED STUDENT RESILIENCE
    // =========================================================================
    console.log("\n--- PART 2: USER ↔ STUDENT INTEGRITY & RESILIENCE ---");

    // Create a temporary STUDENT role user without a linked Student record
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });
    const dummyHash = await bcrypt.hash("unlinkedpass123", 10);
    const unlinkedUser = await prisma.user.create({
      data: {
        email: "unlinked.student@ghs.local",
        name: "Unlinked Student Account",
        passwordHash: dummyHash,
        roleId: studentRole.id,
      },
    });
    unlinkedStudentUserId = unlinkedUser.id;

    // Authenticate the unlinked student
    const unlinkedCookies = await login("unlinked.student@ghs.local", "unlinkedpass123");
    record("Unlinked student user authenticated", true, Boolean(unlinkedCookies), "USER_STUDENT_INTEGRITY");

    // Calling /api/profile with unlinked student session must return controlled 404 without crashing
    const unlinkedProfRes = await api("GET", "/api/profile", unlinkedCookies);
    record("Unlinked student accessing /api/profile returns controlled 404", 404, unlinkedProfRes.status, "USER_STUDENT_INTEGRITY");
    record("Unlinked student error message is controlled", "Profil mahasiswa belum terhubung dengan akun ini.", unlinkedProfRes.data?.error, "USER_STUDENT_INTEGRITY");

    // Verify student cannot mutate academic fields via PATCH /api/profile
    const mutateRes = await api("PATCH", "/api/profile", studentCookies, {
      nim: "999999999",
      name: "MUTATED NAME",
    });
    record("PATCH /api/profile rejects mutation of academic fields -> 400", 400, mutateRes.status, "USER_STUDENT_INTEGRITY");

    // Verify IDOR query spoofing is ignored
    const idorRes = await api("GET", "/api/profile?studentId=other-student-id", studentCookies);
    record("IDOR query spoofing returns authentic student NIM only", "260405066", idorRes.data?.nim, "IDOR_PROTECTION");

    // =========================================================================
    // PART 3: LOGIN ASSET AUTHENTICITY & BRANDING AUDIT
    // =========================================================================
    console.log("\n--- PART 3: LOGIN ASSET AUTHENTICITY & BRANDING ---");

    const loginPageContent = fs.readFileSync(
      path.join(process.cwd(), "app/login/page.tsx"),
      "utf8"
    );
    const globalsCssContent = fs.readFileSync(
      path.join(process.cwd(), "app/globals.css"),
      "utf8"
    );

    // Option B verification: no fake claim that generated image is GHS physical campus
    record("Login page does NOT claim generated visual as 'GHS Training Campus'", false, loginPageContent.includes('alt="GHS Training Campus"'), "ASSET_AUTHENTICITY");
    record("Login page uses truthful generic hospitality visual alt", true, loginPageContent.includes('alt="Ilustrasi Fasilitas Pelatihan Perhotelan & Kapal Pesiar"'), "ASSET_AUTHENTICITY");

    // Logo assets
    const compactLogoExists = fs.existsSync(path.join(process.cwd(), "public/images/ghs-logo.png"));
    record("Official compact GHS logo exists at public/images/ghs-logo.png", true, compactLogoExists, "GHS_BRANDING");

    // Brand color tokens in globals.css
    record("GHS Yellow #FFD618 defined in globals.css", true, globalsCssContent.includes("#FFD618"), "GHS_BRANDING");
    record("GHS Red #BF120E defined in globals.css", true, globalsCssContent.includes("#BF120E"), "GHS_BRANDING");
    record("GHS Dark #1B1B1B defined in globals.css", true, globalsCssContent.includes("#1B1B1B"), "GHS_BRANDING");
    record("GHS Secondary Dark #333333 defined in globals.css", true, globalsCssContent.includes("#333333"), "GHS_BRANDING");
    record("GHS Light Border #EEEEEE defined in globals.css", true, globalsCssContent.includes("#EEEEEE"), "GHS_BRANDING");
    record("GHS Light Background #F3F3F3 defined in globals.css", true, globalsCssContent.includes("#F3F3F3"), "GHS_BRANDING");

    // =========================================================================
    // PART 4: RATE LIMITING & ABUSE PROTECTION TEST
    // =========================================================================
    console.log("\n--- PART 4: RATE LIMITING & ABUSE PROTECTION ---");

    // Fire 10 rapid activation attempts for an arbitrary test NIM
    let rateLimitTriggered = false;
    for (let i = 0; i < 10; i++) {
      const rlRes = await api("POST", "/api/auth/activate", "", {
        nim: "260405068", // SUCI WALIYAH
        name: "WRONG NAME ATTEMPT",
        email: `rate.test.${i}@ghs.local`,
        password: "password123",
      });
      if (rlRes.status === 429) {
        rateLimitTriggered = true;
        break;
      }
    }
    record("Brute-force protection triggers 429 Too Many Requests", true, rateLimitTriggered, "RATE_LIMITING");

  } finally {
    // =========================================================================
    // PART 5: CLEANUP & BASELINE RESTORATION
    // =========================================================================
    console.log("\n--- PART 5: CLEANUP & BASELINE RESTORATION ---");

    // Unlink test student
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

    if (unlinkedStudentUserId) {
      await prisma.user.deleteMany({
        where: { id: unlinkedStudentUserId },
      });
    }

    // Reset Demo Student contact info
    await prisma.student.updateMany({
      where: { nim: "260405066" },
      data: { phone: null, address: null },
    });

    // Delete audit logs from test actions
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

    record("Baseline Users = 3", 3, userCount, "BASELINE" /* Updated STEP 88 */);
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
  console.log(`STEP 77 TEST SUMMARY: ${passedCount}/${results.length} PASSED`);
  if (failedCount > 0) {
    console.error(`FAILED: ${failedCount} assertions`);
    process.exit(1);
  } else {
    console.log("ALL ASSERTIONS PASSED!");
  }
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in test-step77:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
