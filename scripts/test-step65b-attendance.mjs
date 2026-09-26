import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const results = [];

function record(name, expected, actual, passCondition) {
  const pass = passCondition !== undefined ? Boolean(passCondition) : expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) {
    throw new Error(`TEST FAILED: ${name}\nExpected: ${expected}\nActual: ${actual}`);
  }
  console.log(`✓ ${name}`);
}

function getCookies(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies.map((c) => c.split(";")[0]);
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

function mergeCookies(existing, response) {
  const values = new Map();
  for (const cookie of [...existing.split("; "), ...getCookies(response)]) {
    const separator = cookie.indexOf("=");
    if (separator > 0) values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfResponse = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfResponse);
  const { csrfToken } = await csrfResponse.json();

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
  console.log("=== STEP 65B ATTENDANCE MODULE VERIFICATION ===\n");

  const createdUserIds = [];
  const createdAttendanceIds = [];

  try {
    // 0. Setup test users and data
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

    // Get existing demo super admin & student
    const superAdminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("Logging in as demo users...");
    const superAdminCookies = await login("admin.demo@ghs.local", superAdminPassword);
    const studentCookies = await login("student.demo@ghs.local", studentPassword);

    // Create temp users for ADMIN, ACADEMIC_STAFF, MANAGEMENT, PLACEMENT_STAFF
    console.log("Creating temporary test users for RBAC testing...");
    const adminUser = await createTempUser("ADMIN", "test.admin@ghs.test");
    const academicUser = await createTempUser("ACADEMIC_STAFF", "test.academic@ghs.test");
    const managementUser = await createTempUser("MANAGEMENT", "test.management@ghs.test");
    const placementUser = await createTempUser("PLACEMENT_STAFF", "test.placement@ghs.test");

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);

    // Link demo student to first student in GHI-07 for ownership test
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });
    const studentA = await prisma.student.findUnique({
      where: { userId: demoStudentUser.id },
    });
    if (!studentA) throw new Error("Student A linked to demo user not found!");
    // Get a sample schedule for student A's enrolled batch
    const studentAEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: studentA.id },
    });
    const sampleSchedule = await prisma.schedule.findFirst({
      where: { class: { batchId: studentAEnrollment.batchId } },
    });
    if (!sampleSchedule) throw new Error("No schedules found for student A batch!");

    const studentB = await prisma.student.findFirst({
      where: {
        id: { not: studentA.id },
        enrollments: { some: { batchId: studentAEnrollment.batchId } },
      },
    });
    if (!studentB) throw new Error("Student B not found!");

    console.log("\n--- RUNNING REQUIRED 25 TESTS ---\n");

    // 1. GET attendance unauthenticated -> expected 401
    const t1 = await request("/api/attendances");
    record("1. GET attendance unauthenticated returns 401", 401, t1.status);

    // 2. GET attendance dengan role tidak berhak (PLACEMENT_STAFF) -> expected 403
    const t2 = await request("/api/attendances", {
      headers: { Cookie: placementCookies },
    });
    record("2. GET attendance dengan role tidak berhak (PLACEMENT_STAFF) returns 403", 403, t2.status);

    // 3. GET attendance SUPER_ADMIN -> expected 200
    const t3 = await request("/api/attendances", {
      headers: { Cookie: superAdminCookies },
    });
    record("3. GET attendance SUPER_ADMIN returns 200", 200, t3.status);

    // 4. GET attendance ADMIN -> expected 200
    const t4 = await request("/api/attendances", {
      headers: { Cookie: adminCookies },
    });
    record("4. GET attendance ADMIN returns 200", 200, t4.status);

    // 5. GET attendance ACADEMIC_STAFF -> expected 200
    const t5 = await request("/api/attendances", {
      headers: { Cookie: academicCookies },
    });
    record("5. GET attendance ACADEMIC_STAFF returns 200", 200, t5.status);

    // 6. GET attendance MANAGEMENT -> expected 200
    const t6 = await request("/api/attendances", {
      headers: { Cookie: managementCookies },
    });
    record("6. GET attendance MANAGEMENT returns 200", 200, t6.status);

    // 7. GET attendance STUDENT -> hanya data miliknya
    // First, create an attendance for studentA and studentB as SUPER_ADMIN
    const createResA = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentA.id,
        status: "PRESENT",
        absenceType: null,
        lateMinutes: null,
        notes: "Present student A",
      }),
    });
    record("Setup attendance for student A returns 201", 201, createResA.status);
    const attA = (await createResA.json()).data;
    createdAttendanceIds.push(attA.id);

    const t7 = await request("/api/attendances", {
      headers: { Cookie: studentCookies },
    });
    record("7. GET attendance STUDENT returns 200", 200, t7.status);
    const studentListPayload = await t7.json();
    const allBelongToStudent = studentListPayload.data.every(
      (item) => item.studentId === studentA.id,
    );
    record("7. GET attendance STUDENT contains only own data", true, allBelongToStudent);

    // 8. Student mencoba akses attendance student lain -> harus tetap ter-protect
    const t8Query = await request(`/api/attendances?studentId=${studentB.id}`, {
      headers: { Cookie: studentCookies },
    });
    record(
      "8. Student accessing another student via query parameter returns 403 Forbidden",
      403,
      t8Query.status,
    );

    // 9. POST attendance SUPER_ADMIN -> expected success (201)
    // Create attendance on another schedule for studentA within same batch
    const otherSchedule = await prisma.schedule.findFirst({
      where: {
        id: { not: sampleSchedule.id },
        class: { batchId: studentAEnrollment.batchId },
      },
    });
    const t9 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: otherSchedule.id,
        studentId: studentA.id,
        status: "PRESENT",
        absenceType: null,
        lateMinutes: null,
      }),
    });
    record("9. POST attendance SUPER_ADMIN returns 201", 201, t9.status);
    const att9 = (await t9.json()).data;
    createdAttendanceIds.push(att9.id);

    // 10. POST attendance ADMIN -> expected success (201)
    const t10 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        scheduleId: otherSchedule.id,
        studentId: studentB.id,
        status: "LATE",
        absenceType: null,
        lateMinutes: 10,
        notes: "Terlambat 10 menit",
      }),
    });
    record("10. POST attendance ADMIN returns 201", 201, t10.status);
    const att10 = (await t10.json()).data;
    createdAttendanceIds.push(att10.id);

    // 11. POST invalid PRESENT (absenceType bukan null) -> expected 400
    const t11 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
        absenceType: "SICK",
        lateMinutes: null,
      }),
    });
    record("11. POST invalid PRESENT (absenceType != null) returns 400", 400, t11.status);

    // 12. POST invalid PRESENT (lateMinutes bukan null) -> expected 400
    const t12 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
        absenceType: null,
        lateMinutes: 5,
      }),
    });
    record("12. POST invalid PRESENT (lateMinutes != null) returns 400", 400, t12.status);

    // 13. POST invalid LATE (lateMinutes null) -> expected 400
    const t13 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "LATE",
        absenceType: null,
        lateMinutes: null,
      }),
    });
    record("13. POST invalid LATE (lateMinutes null) returns 400", 400, t13.status);

    // 14. POST invalid LATE (lateMinutes < 1) -> expected 400
    const t14 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "LATE",
        absenceType: null,
        lateMinutes: 0,
      }),
    });
    record("14. POST invalid LATE (lateMinutes < 1) returns 400", 400, t14.status);

    // 15. POST invalid ABSENT (absenceType null) -> expected 400
    const t15 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "ABSENT",
        absenceType: null,
        lateMinutes: null,
      }),
    });
    record("15. POST invalid ABSENT (absenceType null) returns 400", 400, t15.status);

    // 16. POST invalid ABSENT (lateMinutes bukan null) -> expected 400
    const t16 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "ABSENT",
        absenceType: "SICK",
        lateMinutes: 10,
      }),
    });
    record("16. POST invalid ABSENT (lateMinutes != null) returns 400", 400, t16.status);

    // 17. POST nonexistent student -> expected 404
    const t17 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: "nonexistent-student-xyz",
        status: "PRESENT",
      }),
    });
    record("17. POST nonexistent student returns 404", 404, t17.status);

    // 18. POST nonexistent schedule -> expected 404
    const t18 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: "nonexistent-schedule-xyz",
        studentId: studentB.id,
        status: "PRESENT",
      }),
    });
    record("18. POST nonexistent schedule returns 404", 404, t18.status);

    // 19. POST duplicate scheduleId + studentId -> expected 409
    // Student A on sampleSchedule already exists from test 7!
    const t19 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentA.id,
        status: "PRESENT",
      }),
    });
    record("19. POST duplicate scheduleId + studentId returns 409 Conflict", 409, t19.status);

    // 20. POST sebagai ACADEMIC_STAFF -> expected 403
    const t20 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: academicCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
      }),
    });
    record("20. POST sebagai ACADEMIC_STAFF returns 403 Forbidden", 403, t20.status);

    // 21. POST sebagai MANAGEMENT -> expected 403
    const t21 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: managementCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
      }),
    });
    record("21. POST sebagai MANAGEMENT returns 403 Forbidden", 403, t21.status);

    // 22. POST sebagai STUDENT -> expected 403
    const t22 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
      }),
    });
    record("22. POST sebagai STUDENT returns 403 Forbidden", 403, t22.status);

    // 23. POST sebagai PLACEMENT_STAFF -> expected 403
    const t23 = await request("/api/attendances", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        scheduleId: sampleSchedule.id,
        studentId: studentB.id,
        status: "PRESENT",
      }),
    });
    record("23. POST sebagai PLACEMENT_STAFF returns 403 Forbidden", 403, t23.status);

    // 24. Tidak ada DELETE endpoint -> expected 405 or 404
    const t24 = await request(`/api/attendances/${attA.id}`, {
      method: "DELETE",
      headers: {
        Cookie: superAdminCookies,
      },
    });
    record("24. DELETE /api/attendances/:id returns 405 Method Not Allowed", true, t24.status === 405 || t24.status === 404);

    // 25. Response tidak mengandung password/passwordHash/credential
    const t25 = await request(`/api/attendances/${attA.id}`, {
      headers: { Cookie: superAdminCookies },
    });
    record("GET /api/attendances/:id returns 200", 200, t25.status);
    const detailPayload = await t25.json();
    const strData = JSON.stringify(detailPayload);
    let credentialExposed = false;
    for (const forbidden of ["password", "passwordHash", "credential", "secret", "sessionToken"]) {
      if (strData.includes(`"${forbidden}"`)) {
        credentialExposed = true;
      }
    }
    record("25. Response tidak mengandung password/passwordHash/credential", false, credentialExposed);

    // Additional test: PATCH /api/attendances/:id
    console.log("\n--- TESTING PATCH /api/attendances/:id ---\n");
    const patchRes = await request(`/api/attendances/${attA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: superAdminCookies,
      },
      body: JSON.stringify({
        status: "LATE",
        lateMinutes: 15,
        notes: "Diubah menjadi terlambat 15 menit",
      }),
    });
    record("PATCH /api/attendances/:id returns 200", 200, patchRes.status);
    const patchedData = (await patchRes.json()).data;
    record("Patched status is LATE", "LATE", patchedData.status);
    record("Patched lateMinutes is 15", 15, patchedData.lateMinutes);

    // Verify AuditLog record was created for the PATCH
    const auditRecord = await prisma.auditLog.findFirst({
      where: { entity: "Attendance", entityId: attA.id, action: "UPDATE" },
    });
    record("AuditLog entry exists for Attendance UPDATE", true, Boolean(auditRecord));

    console.log(`\nALL ${results.length} TESTS PASSED SUCCESSFULLY!`);
  } finally {
    console.log("\n--- CLEANUP TEMPORARY TEST DATA ---");
    // Cleanup attendance records
    if (createdAttendanceIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Attendance", entityId: { in: createdAttendanceIds } },
      });
      await prisma.attendance.deleteMany({
        where: { id: { in: createdAttendanceIds } },
      });
      console.log(`Cleaned up ${createdAttendanceIds.length} test attendances and audit logs.`);
    }

    // Cleanup temp users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      console.log(`Cleaned up ${createdUserIds.length} temporary test users.`);
    }
  }
}

run()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
