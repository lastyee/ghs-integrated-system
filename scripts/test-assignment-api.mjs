import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, AssignmentStatus } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let total = 0;

function record(name, condition, errorMsg = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}: ${errorMsg}`);
    throw new Error(`Test failed: ${name} - ${errorMsg}`);
  }
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
    if (separator > 0) {
      values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await request("/api/auth/callback/credentials", {
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

  cookies = mergeCookies(cookies, res);
  if (res.status !== 302 && res.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== RUNNING ASSIGNMENT API INTEGRATION SUITE ===\n");

  const runId = randomUUID().slice(0, 6);
  const testPassword = `Pass!${runId}`;
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const cleanupUserIds = [];
  const cleanupInstructorIds = [];
  const cleanupClassIds = [];
  const cleanupSubjectIds = [];
  const cleanupBatchIds = [];
  const cleanupProgramIds = [];
  const cleanupAssignmentIds = [];

  try {
    // 1. Fetch Roles
    const [superAdminRole, instructorRole, studentRole] = await Promise.all([
      prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } }),
      prisma.role.findUnique({ where: { name: "INSTRUCTOR" } }),
      prisma.role.findUnique({ where: { name: "STUDENT" } }),
    ]);

    // 2. Create Test Academic Fixtures
    // Program A
    const programA = await prisma.program.create({
      data: {
        code: `PRG-${runId}`,
        name: `Program Test ${runId}`,
      },
    });
    cleanupProgramIds.push(programA.id);

    // Subject A (Curriculum subject for Program A)
    const subjectA = await prisma.subject.create({
      data: {
        code: `SUB-A-${runId}`,
        name: `Mata Kuliah Terkait ${runId}`,
      },
    });
    cleanupSubjectIds.push(subjectA.id);

    // Subject Unrelated (NOT linked to Program A)
    const subjectUnrelated = await prisma.subject.create({
      data: {
        code: `SUB-UN-${runId}`,
        name: `Mata Kuliah Asing ${runId}`,
      },
    });
    cleanupSubjectIds.push(subjectUnrelated.id);

    // Link Program A to Subject A
    await prisma.programSubject.create({
      data: {
        programId: programA.id,
        subjectId: subjectA.id,
      },
    });

    // Batch A
    const batchA = await prisma.batch.create({
      data: {
        name: `Batch Test ${runId}`,
        programId: programA.id,
        startDate: new Date(),
      },
    });
    cleanupBatchIds.push(batchA.id);

    // 3. Create Users
    // Super Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: `admin.${runId}@ghs.test`,
        passwordHash,
        name: `Admin Test ${runId}`,
        roleId: superAdminRole.id,
      },
    });
    cleanupUserIds.push(adminUser.id);

    // Instructor 1 User & Profile
    const inst1User = await prisma.user.create({
      data: {
        email: `inst1.${runId}@ghs.test`,
        passwordHash,
        name: `Instruktur 1 ${runId}`,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(inst1User.id);

    const instructor1 = await prisma.instructor.create({
      data: {
        userId: inst1User.id,
        name: `Instruktur 1 ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor1.id);

    // Instructor 2 User & Profile
    const inst2User = await prisma.user.create({
      data: {
        email: `inst2.${runId}@ghs.test`,
        passwordHash,
        name: `Instruktur 2 ${runId}`,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(inst2User.id);

    const instructor2 = await prisma.instructor.create({
      data: {
        userId: inst2User.id,
        name: `Instruktur 2 ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor2.id);

    // Student User & Profile
    const studentUser = await prisma.user.create({
      data: {
        email: `student.${runId}@ghs.test`,
        passwordHash,
        name: `Mahasiswa Test ${runId}`,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(studentUser.id);

    const studentRecord = await prisma.student.create({
      data: {
        userId: studentUser.id,
        nim: `NIM${runId}`,
        name: `Mahasiswa Test ${runId}`,
      },
    });

    // Enroll student into Batch A
    await prisma.enrollment.create({
      data: {
        studentId: studentRecord.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });

    // Class 1 (Taught by Instructor 1)
    const class1 = await prisma.class.create({
      data: {
        name: `Kelas 1 ${runId}`,
        batchId: batchA.id,
        instructorId: instructor1.id,
      },
    });
    cleanupClassIds.push(class1.id);

    // Class 2 (Taught by Instructor 2)
    const class2 = await prisma.class.create({
      data: {
        name: `Kelas 2 ${runId}`,
        batchId: batchA.id,
        instructorId: instructor2.id,
      },
    });
    cleanupClassIds.push(class2.id);

    // Schedule 1 for Class 1 & Subject A
    const schedule1 = await prisma.schedule.create({
      data: {
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        date: new Date(),
        startTime: new Date(),
        endTime: new Date(Date.now() + 2 * 3600 * 1000),
        topic: "Pengenalan Arsitektur",
      },
    });

    // 4. Authenticate Users
    console.log("Authenticating test sessions...");
    const adminCookies = await login(adminUser.email, testPassword);
    const inst1Cookies = await login(inst1User.email, testPassword);
    const inst2Cookies = await login(inst2User.email, testPassword);
    const studentCookies = await login(studentUser.email, testPassword);
    console.log("Sessions authenticated successfully.\n");

    let createdAssignmentId = null;

    // -----------------------------------------------------------------
    // TEST 1: Instructor 1 creates assignment for Class 1 (Success)
    // -----------------------------------------------------------------
    const resCreate = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: inst1Cookies,
      },
      body: JSON.stringify({
        title: "Tugas 1 Basis Data",
        description: "Buat ERD dan normalisasi tabel.",
        classId: class1.id,
        subjectId: subjectA.id,
        scheduleId: schedule1.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        allowLateSubmission: true,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
      }),
    });

    const rawCreateText = await resCreate.text();
    let createJson = {};
    try {
      createJson = JSON.parse(rawCreateText);
    } catch {
      console.error("Non-JSON response for POST /api/assignments:", resCreate.status, rawCreateText);
    }
    record(
      "API: Instructor 1 creates assignment for Class 1 (HTTP 201)",
      resCreate.status === 201 && createJson.id,
      `Expected 201, got ${resCreate.status}: ${rawCreateText}`
    );
    createdAssignmentId = createJson.id;
    cleanupAssignmentIds.push(createdAssignmentId);

    // -----------------------------------------------------------------
    // TEST 2: Instructor 2 tries to create assignment for Class 1 (403 Forbidden)
    // -----------------------------------------------------------------
    const resForbiddenCreate = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: inst2Cookies,
      },
      body: JSON.stringify({
        title: "Tugas Ilegal",
        classId: class1.id,
        subjectId: subjectA.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      }),
    });

    record(
      "API: Instructor 2 cannot create assignment for Class 1 (HTTP 403)",
      resForbiddenCreate.status === 403,
      `Expected 403, got ${resForbiddenCreate.status}`
    );

    // -----------------------------------------------------------------
    // TEST 3: Reject Unrelated Subject (400 Bad Request)
    // -----------------------------------------------------------------
    const resUnrelatedSubject = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: inst1Cookies,
      },
      body: JSON.stringify({
        title: "Tugas Mata Kuliah Asing",
        classId: class1.id,
        subjectId: subjectUnrelated.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      }),
    });

    const unrelatedJson = await resUnrelatedSubject.json();
    record(
      "API: Reject assignment with subject unrelated to class curriculum (HTTP 400)",
      resUnrelatedSubject.status === 400,
      `Expected 400, got ${resUnrelatedSubject.status}: ${JSON.stringify(unrelatedJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 4: Reject Mismatched Schedule (400 Bad Request)
    // -----------------------------------------------------------------
    // Schedule belonging to Class 1, but we pass Class 2
    const resMismatchedSchedule = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: inst2Cookies,
      },
      body: JSON.stringify({
        title: "Tugas Jadwal Tidak Cocok",
        classId: class2.id,
        subjectId: subjectA.id,
        scheduleId: schedule1.id, // Belongs to Class 1, not Class 2!
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      }),
    });

    record(
      "API: Reject assignment with schedule belonging to a different class (HTTP 400)",
      resMismatchedSchedule.status === 400,
      `Expected 400, got ${resMismatchedSchedule.status}`
    );

    // -----------------------------------------------------------------
    // TEST 5: Instructor 1 views assignments list (Class isolation)
    // -----------------------------------------------------------------
    const resListInst1 = await request("/api/assignments", {
      headers: { Cookie: inst1Cookies },
    });
    const listInst1 = await resListInst1.json();

    record(
      "API: Instructor 1 list contains Class 1 assignment",
      resListInst1.status === 200 &&
        listInst1.data.some((a) => a.id === createdAssignmentId),
      `Assignment ${createdAssignmentId} not found in instructor 1 list`
    );

    // Instructor 2 should NOT see Class 1 assignment
    const resListInst2 = await request("/api/assignments", {
      headers: { Cookie: inst2Cookies },
    });
    const listInst2 = await resListInst2.json();

    record(
      "API: Instructor 2 cannot see Class 1 assignment in their list",
      resListInst2.status === 200 &&
        !listInst2.data.some((a) => a.id === createdAssignmentId),
      `Instructor 2 leaked Class 1 assignment!`
    );

    // -----------------------------------------------------------------
    // TEST 6: Super Admin can create and view across any class
    // -----------------------------------------------------------------
    const resAdminCreate = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        title: "Tugas Bersama dari Super Admin",
        classId: class2.id,
        subjectId: subjectA.id,
        dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    const adminCreateJson = await resAdminCreate.json();

    record(
      "API: Super Admin creates assignment for Class 2 (HTTP 201)",
      resAdminCreate.status === 201 && adminCreateJson.id,
      `Expected 201, got ${resAdminCreate.status}`
    );
    cleanupAssignmentIds.push(adminCreateJson.id);

    // Super Admin list sees both
    const resAdminList = await request("/api/assignments", {
      headers: { Cookie: adminCookies },
    });
    const adminList = await resAdminList.json();

    record(
      "API: Super Admin sees assignments from all classes",
      adminList.data.some((a) => a.id === createdAssignmentId) &&
        adminList.data.some((a) => a.id === adminCreateJson.id),
      "Super admin list missing assignments"
    );

    // -----------------------------------------------------------------
    // TEST 7: Get Assignment Detail
    // -----------------------------------------------------------------
    const resDetail = await request(`/api/assignments/${createdAssignmentId}`, {
      headers: { Cookie: inst1Cookies },
    });
    const detailJson = await resDetail.json();

    record(
      "API: Get assignment detail returns relational data and no raw path leak",
      resDetail.status === 200 &&
        detailJson.data.class.id === class1.id &&
        detailJson.data.attachmentPath === undefined,
      `Failed to get detail: ${JSON.stringify(detailJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 8: Instructor 2 cannot access detail of Class 1 assignment
    // -----------------------------------------------------------------
    const resForbiddenDetail = await request(
      `/api/assignments/${createdAssignmentId}`,
      { headers: { Cookie: inst2Cookies } }
    );

    record(
      "API: Instructor 2 cannot view detail of Class 1 assignment (HTTP 403)",
      resForbiddenDetail.status === 403,
      `Expected 403, got ${resForbiddenDetail.status}`
    );

    // -----------------------------------------------------------------
    // TEST 9: Instructor 1 updates assignment (PATCH)
    // -----------------------------------------------------------------
    const resPatch = await request(`/api/assignments/${createdAssignmentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: inst1Cookies,
      },
      body: JSON.stringify({
        title: "Tugas 1 Basis Data (Revisi Judul)",
        maxScore: 90,
      }),
    });
    const patchJson = await resPatch.json();

    record(
      "API: Instructor 1 updates assignment (HTTP 200)",
      resPatch.status === 200 &&
        patchJson.data.title === "Tugas 1 Basis Data (Revisi Judul)" &&
        patchJson.data.maxScore === 90,
      `Update failed: ${JSON.stringify(patchJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 10: Instructor cannot soft-delete assignment (403 Forbidden)
    // -----------------------------------------------------------------
    const resForbiddenDelete = await request(
      `/api/assignments/${createdAssignmentId}`,
      { method: "DELETE", headers: { Cookie: inst1Cookies } }
    );

    record(
      "API: Instructor cannot soft-delete assignment (HTTP 403, Admin only)",
      resForbiddenDelete.status === 403,
      `Expected 403, got ${resForbiddenDelete.status}`
    );

    // -----------------------------------------------------------------
    // TEST 11: Super Admin soft-deletes assignment (HTTP 200)
    // -----------------------------------------------------------------
    const resDelete = await request(`/api/assignments/${createdAssignmentId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });

    record(
      "API: Super Admin soft-deletes assignment (HTTP 200)",
      resDelete.status === 200,
      `Expected 200, got ${resDelete.status}`
    );

    // Verify soft-deleted assignment is excluded from standard list
    const resListAfterDelete = await request("/api/assignments", {
      headers: { Cookie: adminCookies },
    });
    const listAfterDelete = await resListAfterDelete.json();

    record(
      "API: Soft-deleted assignment is excluded from standard list",
      !listAfterDelete.data.some((a) => a.id === createdAssignmentId),
      "Soft-deleted assignment still appears in list!"
    );

    // -----------------------------------------------------------------
    // TEST 12: Student role cannot create assignment (403 Forbidden)
    // -----------------------------------------------------------------
    const resStudentCreate = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentCookies,
      },
      body: JSON.stringify({
        title: "Tugas Mahasiswa",
        classId: class1.id,
        subjectId: subjectA.id,
        dueDate: new Date().toISOString(),
      }),
    });

    record(
      "API: Student cannot create assignment (HTTP 403)",
      resStudentCreate.status === 403,
      `Expected 403, got ${resStudentCreate.status}`
    );

    // -----------------------------------------------------------------
    // TEST 13: Reject file upload with invalid magic bytes / signature (HTTP 400)
    // -----------------------------------------------------------------
    const fakePdfBuffer = Buffer.from("NOT_A_REAL_PDF_CONTENT");
    const fakePdfBlob = new Blob([fakePdfBuffer], { type: "application/pdf" });
    const fakeFormData = new FormData();
    fakeFormData.append("title", "Tugas dengan Berkas Palsu");
    fakeFormData.append("classId", class1.id);
    fakeFormData.append("subjectId", subjectA.id);
    fakeFormData.append("dueDate", new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());
    fakeFormData.append("file", fakePdfBlob, "palsu.pdf");

    const resFakeUpload = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: inst1Cookies },
      body: fakeFormData,
    });

    record(
      "API: Reject file upload with invalid magic bytes / signature (HTTP 400)",
      resFakeUpload.status === 400,
      `Expected 400, got ${resFakeUpload.status}`
    );

    // -----------------------------------------------------------------
    // TEST 14: Reject upload exceeding 10MB limit (HTTP 400)
    // -----------------------------------------------------------------
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024); // 10MB + 1KB
    const oversizedBlob = new Blob([oversizedBuffer], { type: "application/pdf" });
    const oversizedFormData = new FormData();
    oversizedFormData.append("title", "Tugas Terlalu Besar");
    oversizedFormData.append("classId", class1.id);
    oversizedFormData.append("subjectId", subjectA.id);
    oversizedFormData.append("dueDate", new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());
    oversizedFormData.append("file", oversizedBlob, "large.pdf");

    const resOversized = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: inst1Cookies },
      body: oversizedFormData,
    });

    record(
      "API: Reject file upload exceeding 10 MB limit (HTTP 400)",
      resOversized.status === 400,
      `Expected 400, got ${resOversized.status}`
    );
  } finally {
    console.log("\nCleaning up test database records...");
    for (const aId of cleanupAssignmentIds) {
      await prisma.assignment.deleteMany({ where: { id: aId } });
    }
    for (const cId of cleanupClassIds) {
      await prisma.schedule.deleteMany({ where: { classId: cId } });
      await prisma.class.deleteMany({ where: { id: cId } });
    }
    for (const uId of cleanupUserIds) {
      await prisma.enrollment.deleteMany({ where: { student: { userId: uId } } });
      await prisma.student.deleteMany({ where: { userId: uId } });
      await prisma.instructor.deleteMany({ where: { userId: uId } });
      await prisma.auditLog.deleteMany({ where: { userId: uId } });
      await prisma.user.deleteMany({ where: { id: uId } });
    }
    for (const bId of cleanupBatchIds) {
      await prisma.batch.deleteMany({ where: { id: bId } });
    }
    for (const sId of cleanupSubjectIds) {
      await prisma.programSubject.deleteMany({ where: { subjectId: sId } });
      await prisma.subject.deleteMany({ where: { id: sId } });
    }
    for (const pId of cleanupProgramIds) {
      await prisma.program.deleteMany({ where: { id: pId } });
    }
    await prisma.$disconnect();
    console.log("Cleanup completed.");
  }

  console.log(`\n==================================================`);
  console.log(`ALL ASSIGNMENT API TESTS: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
