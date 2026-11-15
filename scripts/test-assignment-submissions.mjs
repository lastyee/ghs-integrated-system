import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, AssignmentStatus, SubmissionStatus } from "@prisma/client";
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

// Sample valid PDF buffer (%PDF-1.4 header)
const samplePdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

function createSubmissionFormData(fileName, buffer, mimeType, content, studentId) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append("file", blob, fileName);
  if (content !== undefined && content !== null) {
    formData.append("content", content);
  }
  if (studentId) {
    formData.append("studentId", studentId);
  }
  return formData;
}

async function run() {
  console.log("=== RUNNING STUDENT ASSIGNMENT SUBMISSION & GRADING INTEGRATION SUITE ===\n");

  const runId = randomUUID().slice(0, 6);
  const testPassword = `Pass!${runId}`;
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const cleanupUserIds = [];
  const cleanupInstructorIds = [];
  const cleanupStudentIds = [];
  const cleanupClassIds = [];
  const cleanupSubjectIds = [];
  const cleanupBatchIds = [];
  const cleanupProgramIds = [];
  const cleanupAssignmentIds = [];

  try {
    // 1. Roles
    const [superAdminRole, instructorRole, studentRole] = await Promise.all([
      prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } }),
      prisma.role.findUnique({ where: { name: "INSTRUCTOR" } }),
      prisma.role.findUnique({ where: { name: "STUDENT" } }),
    ]);

    // 2. Program, Subject, Batch
    const programA = await prisma.program.create({
      data: { code: `PRG-SUB-${runId}`, name: `Program Sub ${runId}` },
    });
    cleanupProgramIds.push(programA.id);

    const subjectA = await prisma.subject.create({
      data: { code: `SUB-SUB-${runId}`, name: `Mata Kuliah Sub ${runId}` },
    });
    cleanupSubjectIds.push(subjectA.id);

    await prisma.programSubject.create({
      data: { programId: programA.id, subjectId: subjectA.id },
    });

    const batchA = await prisma.batch.create({
      data: { name: `Batch A ${runId}`, programId: programA.id, startDate: new Date() },
    });
    cleanupBatchIds.push(batchA.id);

    const batchB = await prisma.batch.create({
      data: { name: `Batch B ${runId}`, programId: programA.id, startDate: new Date() },
    });
    cleanupBatchIds.push(batchB.id);

    // 3. Instructor 1 & Instructor 2
    const inst1User = await prisma.user.create({
      data: { email: `inst1.${runId}@ghs.test`, passwordHash, name: `Instruktur 1 ${runId}`, roleId: instructorRole.id },
    });
    cleanupUserIds.push(inst1User.id);
    const instructor1 = await prisma.instructor.create({
      data: { userId: inst1User.id, name: `Instruktur 1 ${runId}` },
    });
    cleanupInstructorIds.push(instructor1.id);

    const inst2User = await prisma.user.create({
      data: { email: `inst2.${runId}@ghs.test`, passwordHash, name: `Instruktur 2 ${runId}`, roleId: instructorRole.id },
    });
    cleanupUserIds.push(inst2User.id);
    const instructor2 = await prisma.instructor.create({
      data: { userId: inst2User.id, name: `Instruktur 2 ${runId}` },
    });
    cleanupInstructorIds.push(instructor2.id);

    // Super Admin
    const adminUser = await prisma.user.create({
      data: { email: `admin.${runId}@ghs.test`, passwordHash, name: `Admin ${runId}`, roleId: superAdminRole.id },
    });
    cleanupUserIds.push(adminUser.id);

    // 4. Students
    // Student 1 (Enrolled in Batch A)
    const std1User = await prisma.user.create({
      data: { email: `std1.${runId}@ghs.test`, passwordHash, name: `Mahasiswa 1 ${runId}`, roleId: studentRole.id },
    });
    cleanupUserIds.push(std1User.id);
    const student1 = await prisma.student.create({
      data: { userId: std1User.id, nim: `NIM1${runId}`, name: `Mahasiswa 1 ${runId}` },
    });
    cleanupStudentIds.push(student1.id);
    await prisma.enrollment.create({
      data: { studentId: student1.id, batchId: batchA.id, status: "ACTIVE" },
    });

    // Student 2 (Also enrolled in Batch A - will remain unsubmitted for recap testing)
    const std2User = await prisma.user.create({
      data: { email: `std2.${runId}@ghs.test`, passwordHash, name: `Mahasiswa 2 ${runId}`, roleId: studentRole.id },
    });
    cleanupUserIds.push(std2User.id);
    const student2 = await prisma.student.create({
      data: { userId: std2User.id, nim: `NIM2${runId}`, name: `Mahasiswa 2 ${runId}` },
    });
    cleanupStudentIds.push(student2.id);
    await prisma.enrollment.create({
      data: { studentId: student2.id, batchId: batchA.id, status: "ACTIVE" },
    });

    // Student 3 (Enrolled ONLY in Batch B - foreign class student)
    const std3User = await prisma.user.create({
      data: { email: `std3.${runId}@ghs.test`, passwordHash, name: `Mahasiswa 3 ${runId}`, roleId: studentRole.id },
    });
    cleanupUserIds.push(std3User.id);
    const student3 = await prisma.student.create({
      data: { userId: std3User.id, nim: `NIM3${runId}`, name: `Mahasiswa 3 ${runId}` },
    });
    cleanupStudentIds.push(student3.id);
    await prisma.enrollment.create({
      data: { studentId: student3.id, batchId: batchB.id, status: "ACTIVE" },
    });

    // Student 4 (Enrolled in Batch A - strictly unsubmitted)
    const std4User = await prisma.user.create({
      data: { email: `std4.${runId}@ghs.test`, passwordHash, name: `Mahasiswa 4 ${runId}`, roleId: studentRole.id },
    });
    cleanupUserIds.push(std4User.id);
    const student4 = await prisma.student.create({
      data: { userId: std4User.id, nim: `NIM4${runId}`, name: `Mahasiswa 4 ${runId}` },
    });
    cleanupStudentIds.push(student4.id);
    await prisma.enrollment.create({
      data: { studentId: student4.id, batchId: batchA.id, status: "ACTIVE" },
    });

    // 5. Classes
    // Class 1 in Batch A (taught by Instructor 1)
    const class1 = await prisma.class.create({
      data: { name: `Kelas 1 ${runId}`, batchId: batchA.id, instructorId: instructor1.id },
    });
    cleanupClassIds.push(class1.id);

    // Class 2 in Batch B (taught by Instructor 2)
    const class2 = await prisma.class.create({
      data: { name: `Kelas 2 ${runId}`, batchId: batchB.id, instructorId: instructor2.id },
    });
    cleanupClassIds.push(class2.id);

    // 6. Assignments
    // Assignment 1: Active, PUBLISHED, future due date, late submissions allowed
    const asgnActiveFuture = await prisma.assignment.create({
      data: {
        title: `Tugas Aktif ${runId}`,
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), // 5 days in future
        allowLateSubmission: true,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
      },
    });
    cleanupAssignmentIds.push(asgnActiveFuture.id);

    // Assignment 2: Past due date, late submission NOT allowed
    const asgnPastNoLate = await prisma.assignment.create({
      data: {
        title: `Tugas Kadaluarsa Tolak Telat ${runId}`,
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        dueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000), // 2 days in past
        allowLateSubmission: false,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
      },
    });
    cleanupAssignmentIds.push(asgnPastNoLate.id);

    // Assignment 3: Past due date, late submission ALLOWED
    const asgnPastAllowLate = await prisma.assignment.create({
      data: {
        title: `Tugas Kadaluarsa Izinkan Telat ${runId}`,
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        dueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000), // 2 days in past
        allowLateSubmission: true,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
      },
    });
    cleanupAssignmentIds.push(asgnPastAllowLate.id);

    // Assignment 4: DRAFT status
    const asgnDraft = await prisma.assignment.create({
      data: {
        title: `Tugas DRAFT ${runId}`,
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        status: AssignmentStatus.DRAFT,
      },
    });
    cleanupAssignmentIds.push(asgnDraft.id);

    // Assignment 5: CLOSED status
    const asgnClosed = await prisma.assignment.create({
      data: {
        title: `Tugas CLOSED ${runId}`,
        classId: class1.id,
        subjectId: subjectA.id,
        instructorId: instructor1.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        status: AssignmentStatus.CLOSED,
      },
    });
    cleanupAssignmentIds.push(asgnClosed.id);

    // Assignment 6: In Class 2 (Batch B, Instructor 2)
    const asgnClass2 = await prisma.assignment.create({
      data: {
        title: `Tugas Kelas 2 ${runId}`,
        classId: class2.id,
        subjectId: subjectA.id,
        instructorId: instructor2.id,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        status: AssignmentStatus.PUBLISHED,
      },
    });
    cleanupAssignmentIds.push(asgnClass2.id);

    // Authenticate sessions
    console.log("Authenticating test user sessions...");
    const adminCookies = await login(adminUser.email, testPassword);
    const inst1Cookies = await login(inst1User.email, testPassword);
    const inst2Cookies = await login(inst2User.email, testPassword);
    const std1Cookies = await login(std1User.email, testPassword);
    const std2Cookies = await login(std2User.email, testPassword);
    const std3Cookies = await login(std3User.email, testPassword);
    console.log("All sessions authenticated successfully.\n");

    // -----------------------------------------------------------------
    // TEST 1: Student 1 submits assignment for their class (HTTP 201)
    // -----------------------------------------------------------------
    const formData1 = createSubmissionFormData(
      "jawaban_tugas1.pdf",
      samplePdfBuffer,
      "application/pdf",
      "Ini adalah jawaban saya untuk tugas 1."
    );

    const resSubmit1 = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: formData1,
    });
    const submit1Json = await resSubmit1.json();

    record(
      "1. Student can submit assignment for their class (HTTP 201)",
      resSubmit1.status === 201 &&
        submit1Json.status === SubmissionStatus.SUBMITTED &&
        submit1Json.attemptCount === 1 &&
        submit1Json.fileName === "jawaban_tugas1.pdf",
      `Expected 201, got ${resSubmit1.status}: ${JSON.stringify(submit1Json)}`
    );
    const submission1Id = submit1Json.id;

    // -----------------------------------------------------------------
    // TEST 2: Student identity cannot be spoofed via client form data
    // -----------------------------------------------------------------
    // Student 2 attempts to pass studentId of Student 1
    const formDataSpoof = createSubmissionFormData(
      "jawaban_spoof.pdf",
      samplePdfBuffer,
      "application/pdf",
      "Mencoba spoof studentId",
      student1.id // Spoofed studentId
    );

    const resSpoof = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std2Cookies },
      body: formDataSpoof,
    });
    const spoofJson = await resSpoof.json();

    record(
      "2. Server ignores spoofed studentId from client and binds to session student",
      resSpoof.status === 201 && spoofJson.studentId === student2.id,
      `Expected submission for student 2, got student ${spoofJson.studentId}`
    );

    // -----------------------------------------------------------------
    // TEST 3: Student cannot submit assignment to a class they are not enrolled in (HTTP 403)
    // -----------------------------------------------------------------
    // Student 3 is enrolled in Batch B (Class 2), attempts to submit to Assignment 1 (Class 1)
    const formDataForeign = createSubmissionFormData(
      "foreign.pdf",
      samplePdfBuffer,
      "application/pdf",
      "Tugas kelas lain"
    );

    const resForeign = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std3Cookies },
      body: formDataForeign,
    });

    record(
      "3. Student cannot submit to assignment of another class/batch (HTTP 403)",
      resForeign.status === 403,
      `Expected 403, got ${resForeign.status}`
    );

    // -----------------------------------------------------------------
    // TEST 4: Submissions to DRAFT, CLOSED, or deleted assignment rejected
    // -----------------------------------------------------------------
    const resDraft = await request(`/api/assignments/${asgnDraft.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: createSubmissionFormData("draft.pdf", samplePdfBuffer, "application/pdf"),
    });

    record(
      "4a. Reject submission to DRAFT assignment (HTTP 400)",
      resDraft.status === 400,
      `Expected 400, got ${resDraft.status}`
    );

    const resClosed = await request(`/api/assignments/${asgnClosed.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: createSubmissionFormData("closed.pdf", samplePdfBuffer, "application/pdf"),
    });

    record(
      "4b. Reject submission to CLOSED assignment (HTTP 400)",
      resClosed.status === 400,
      `Expected 400, got ${resClosed.status}`
    );

    // -----------------------------------------------------------------
    // TEST 5: Timely submission is marked SUBMITTED
    // -----------------------------------------------------------------
    record(
      "5. Timely submission is marked SUBMITTED",
      submit1Json.status === SubmissionStatus.SUBMITTED,
      `Status was ${submit1Json.status}`
    );

    // -----------------------------------------------------------------
    // TEST 6: Late submission rejected when allowLateSubmission is false (HTTP 400)
    // -----------------------------------------------------------------
    const resLateNoLate = await request(`/api/assignments/${asgnPastNoLate.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: createSubmissionFormData("telat_tolak.pdf", samplePdfBuffer, "application/pdf"),
    });

    record(
      "6. Late submission rejected when allowLateSubmission is false (HTTP 400)",
      resLateNoLate.status === 400,
      `Expected 400, got ${resLateNoLate.status}`
    );

    // -----------------------------------------------------------------
    // TEST 7: Late submission accepted and marked LATE when allowLateSubmission is true (HTTP 201)
    // -----------------------------------------------------------------
    const resLateAllow = await request(`/api/assignments/${asgnPastAllowLate.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: createSubmissionFormData("telat_terima.pdf", samplePdfBuffer, "application/pdf"),
    });
    const lateAllowJson = await resLateAllow.json();

    record(
      "7. Late submission accepted and marked LATE when allowLateSubmission is true (HTTP 201)",
      resLateAllow.status === 201 && lateAllowJson.status === SubmissionStatus.LATE,
      `Expected 201 LATE, got ${resLateAllow.status} ${lateAllowJson.status}`
    );

    // -----------------------------------------------------------------
    // TEST 8: Resubmission increases attemptCount correctly
    // -----------------------------------------------------------------
    const formDataResubmit = createSubmissionFormData(
      "jawaban_tugas1_revisi.pdf",
      samplePdfBuffer,
      "application/pdf",
      "Revisi tugas 1 setelah perbaikan."
    );

    const resResubmit = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: formDataResubmit,
    });
    const resubmitJson = await resResubmit.json();

    record(
      "8. Resubmission increases attemptCount and updates status to RESUBMITTED (HTTP 201)",
      resResubmit.status === 201 &&
        resubmitJson.id === submission1Id &&
        resubmitJson.attemptCount === 2 &&
        resubmitJson.status === SubmissionStatus.RESUBMITTED &&
        resubmitJson.fileName === "jawaban_tugas1_revisi.pdf",
      `Expected attemptCount 2 RESUBMITTED, got: ${JSON.stringify(resubmitJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 9: Submission that has been graded cannot be resubmitted
    // -----------------------------------------------------------------
    // First, Instructor 1 grades Student 1's submission
    const resGrade = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: inst1Cookies,
        },
        body: JSON.stringify({
          score: 95,
          feedback: "Bagus sekali, analisis tepat.",
        }),
      }
    );
    const gradeJson = await resGrade.json();

    record(
      "9a. Instructor 1 successfully grades submission (HTTP 200)",
      resGrade.status === 200 &&
        gradeJson.data.score === 95 &&
        gradeJson.data.status === SubmissionStatus.GRADED,
      `Grading failed: ${JSON.stringify(gradeJson)}`
    );

    // Now Student 1 tries to resubmit graded assignment
    const resResubmitGraded = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std1Cookies },
      body: createSubmissionFormData("resubmit_after_graded.pdf", samplePdfBuffer, "application/pdf"),
    });

    record(
      "9b. Submission that has been graded cannot be resubmitted (HTTP 400)",
      resResubmitGraded.status === 400,
      `Expected 400, got ${resResubmitGraded.status}`
    );

    // -----------------------------------------------------------------
    // TEST 10: Concurrency safety (no duplicate submissions on parallel requests)
    // -----------------------------------------------------------------
    // Student 3 submits to Assignment 6 in their class with 2 parallel requests
    const parallel1 = request(`/api/assignments/${asgnClass2.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std3Cookies },
      body: createSubmissionFormData("concurrent1.pdf", samplePdfBuffer, "application/pdf"),
    });
    const parallel2 = request(`/api/assignments/${asgnClass2.id}/submissions`, {
      method: "POST",
      headers: { Cookie: std3Cookies },
      body: createSubmissionFormData("concurrent2.pdf", samplePdfBuffer, "application/pdf"),
    });

    const [resP1, resP2] = await Promise.all([parallel1, parallel2]);
    const pStatuses = [resP1.status, resP2.status];

    const dbSubCount = await prisma.assignmentSubmission.count({
      where: { assignmentId: asgnClass2.id, studentId: student3.id, deletedAt: null },
    });

    record(
      "10. Concurrent requests maintain unique constraint and do not produce duplicate records",
      pStatuses.every((s) => s === 201 || s === 409 || s === 400) && dbSubCount === 1,
      `Parallel statuses: ${pStatuses.join(",")}, DB count: ${dbSubCount}`
    );

    // -----------------------------------------------------------------
    // TEST 11: Download submission and verify private signed URL
    // -----------------------------------------------------------------
    const resGetDetail = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      { headers: { Cookie: std1Cookies } }
    );
    const detailJson = await resGetDetail.json();

    record(
      "11. Student can view own submission with valid downloadUrl and no raw path leak",
      resGetDetail.status === 200 &&
        typeof detailJson.data.downloadUrl === "string" &&
        detailJson.data.downloadUrl.length > 0 &&
        detailJson.data.storagePath === undefined,
      `Detail response invalid: ${JSON.stringify(detailJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 12: Student cannot access other student's submission detail (HTTP 403)
    // -----------------------------------------------------------------
    // Student 2 attempts to access Student 1's submission
    const resForeignSubAccess = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      { headers: { Cookie: std2Cookies } }
    );

    record(
      "12. Student cannot access other student's submission detail (HTTP 403)",
      resForeignSubAccess.status === 403,
      `Expected 403, got ${resForeignSubAccess.status}`
    );

    // -----------------------------------------------------------------
    // TEST 13: Instructor 1 views submission recap for Class 1
    // -----------------------------------------------------------------
    const resRecap = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      headers: { Cookie: inst1Cookies },
    });
    const recapJson = await resRecap.json();

    record(
      "13. Instructor sees class submission recap containing submitted and unsubmitted students",
      resRecap.status === 200 &&
        recapJson.stats.totalEnrolled >= 3 &&
        recapJson.data.some((item) => item.student.id === student1.id && item.isSubmitted) &&
        recapJson.data.some((item) => item.student.id === student4.id && !item.isSubmitted),
      `Recap invalid: ${JSON.stringify(recapJson)}`
    );

    // -----------------------------------------------------------------
    // TEST 14: Instructor 2 cannot view recap of Class 1 assignment (HTTP 403)
    // -----------------------------------------------------------------
    const resForbiddenRecap = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      headers: { Cookie: inst2Cookies },
    });

    record(
      "14a. Instructor 2 cannot view recap of Class 1 assignment (HTTP 403)",
      resForbiddenRecap.status === 403,
      `Expected 403, got ${resForbiddenRecap.status}`
    );

    // Student cannot access class recap endpoint (HTTP 403)
    const resStudentRecap = await request(`/api/assignments/${asgnActiveFuture.id}/submissions`, {
      headers: { Cookie: std1Cookies },
    });

    record(
      "14b. Student cannot access class recap endpoint (HTTP 403)",
      resStudentRecap.status === 403,
      `Expected 403, got ${resStudentRecap.status}`
    );

    // -----------------------------------------------------------------
    // TEST 15: Grading validation (maxScore boundary, student rejected, role checks)
    // -----------------------------------------------------------------
    // Score exceeding maxScore (100)
    const resOverMaxScore = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: inst1Cookies },
        body: JSON.stringify({ score: 150 }),
      }
    );

    record(
      "15a. Grading rejects score exceeding maxScore (HTTP 400)",
      resOverMaxScore.status === 400,
      `Expected 400, got ${resOverMaxScore.status}`
    );

    // Student cannot grade
    const resStudentGrade = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: std1Cookies },
        body: JSON.stringify({ score: 100 }),
      }
    );

    record(
      "15b. Student cannot grade submissions (HTTP 403)",
      resStudentGrade.status === 403,
      `Expected 403, got ${resStudentGrade.status}`
    );

    // Instructor 2 cannot grade Class 1 submission
    const resInst2Grade = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: inst2Cookies },
        body: JSON.stringify({ score: 80 }),
      }
    );

    record(
      "15c. Instructor 2 cannot grade Class 1 submission (HTTP 403)",
      resInst2Grade.status === 403,
      `Expected 403, got ${resInst2Grade.status}`
    );

    // Super Admin can grade
    const resAdminGrade = await request(
      `/api/assignments/${asgnActiveFuture.id}/submissions/${submission1Id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookies },
        body: JSON.stringify({ score: 100, feedback: "Nilai sempurna dari Super Admin" }),
      }
    );
    const adminGradeJson = await resAdminGrade.json();

    record(
      "15d. Super Admin can grade submissions (HTTP 200)",
      resAdminGrade.status === 200 && adminGradeJson.data.score === 100,
      `Admin grading failed: ${JSON.stringify(adminGradeJson)}`
    );
  } finally {
    console.log("\nCleaning up test database records...");
    for (const aId of cleanupAssignmentIds) {
      await prisma.assignmentSubmission.deleteMany({ where: { assignmentId: aId } });
      await prisma.assignment.deleteMany({ where: { id: aId } });
    }
    for (const cId of cleanupClassIds) {
      await prisma.schedule.deleteMany({ where: { classId: cId } });
      await prisma.class.deleteMany({ where: { id: cId } });
    }
    for (const sId of cleanupStudentIds) {
      await prisma.enrollment.deleteMany({ where: { studentId: sId } });
      await prisma.student.deleteMany({ where: { id: sId } });
    }
    for (const uId of cleanupUserIds) {
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
  console.log(`ALL SUBMISSION & GRADING TESTS: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
