import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
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

function createMinimalPdfBuffer() {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF`;
  return Buffer.from(content, "utf-8");
}

async function runAdvancedAuditSuite() {
  console.log("=== RUNNING ADVANCED AUDIT TAHAP 4B (AUTHORIZATION & VALIDATION CONSISTENCY) ===\n");

  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const testPassword = `Pass#${runId}!Aa1`;
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const cleanupUserIds = [];
  const cleanupStudentIds = [];
  const cleanupInstructorIds = [];
  const cleanupClassIds = [];
  const cleanupBatchIds = [];
  const cleanupSubjectIds = [];
  const cleanupProgramIds = [];
  const cleanupAssignmentIds = [];
  const cleanupSubmissionIds = [];

  try {
    // Roles
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const instructorRole = await prisma.role.findUniqueOrThrow({ where: { name: "INSTRUCTOR" } });
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const placementRole = await prisma.role.findUniqueOrThrow({ where: { name: "PLACEMENT_STAFF" } });

    // Program & Subject
    const program = await prisma.program.create({
      data: { code: `PRG${runId}`, name: `Program Audit ${runId}` },
    });
    cleanupProgramIds.push(program.id);

    const subject = await prisma.subject.create({
      data: { code: `SUB${runId}`, name: `Subject Audit ${runId}` },
    });
    cleanupSubjectIds.push(subject.id);

    await prisma.programSubject.create({
      data: { programId: program.id, subjectId: subject.id },
    });

    // Users for each role
    const superAdminUser = await prisma.user.create({
      data: { email: `superadmin_${runId}@ghs.test`, name: "Audit Super Admin", passwordHash, roleId: superAdminRole.id },
    });
    cleanupUserIds.push(superAdminUser.id);

    const adminUser = await prisma.user.create({
      data: { email: `admin_${runId}@ghs.test`, name: "Audit Admin", passwordHash, roleId: adminRole.id },
    });
    cleanupUserIds.push(adminUser.id);

    const instructor1User = await prisma.user.create({
      data: { email: `inst1_${runId}@ghs.test`, name: "Audit Instruktur 1", passwordHash, roleId: instructorRole.id },
    });
    cleanupUserIds.push(instructor1User.id);

    const instructor1 = await prisma.instructor.create({
      data: { userId: instructor1User.id, name: "Audit Instruktur 1" },
    });
    cleanupInstructorIds.push(instructor1.id);

    const instructor2User = await prisma.user.create({
      data: { email: `inst2_${runId}@ghs.test`, name: "Audit Instruktur 2", passwordHash, roleId: instructorRole.id },
    });
    cleanupUserIds.push(instructor2User.id);

    const instructor2 = await prisma.instructor.create({
      data: { userId: instructor2User.id, name: "Audit Instruktur 2" },
    });
    cleanupInstructorIds.push(instructor2.id);

    const studentUser = await prisma.user.create({
      data: { email: `student_${runId}@ghs.test`, name: "Audit Mahasiswa", passwordHash, roleId: studentRole.id },
    });
    cleanupUserIds.push(studentUser.id);

    const student = await prisma.student.create({
      data: { userId: studentUser.id, nim: `NIM-${runId}`, name: "Audit Mahasiswa" },
    });
    cleanupStudentIds.push(student.id);

    const placementUser = await prisma.user.create({
      data: { email: `placement_${runId}@ghs.test`, name: "Audit Placement", passwordHash, roleId: placementRole.id },
    });
    cleanupUserIds.push(placementUser.id);

    // Batches & Classes
    const batch = await prisma.batch.create({
      data: { name: `Batch Audit ${runId}`, programId: program.id, startDate: new Date() },
    });
    cleanupBatchIds.push(batch.id);

    const class1 = await prisma.class.create({
      data: { name: `Class 1 ${runId}`, batchId: batch.id, instructorId: instructor1.id },
    });
    cleanupClassIds.push(class1.id);

    const class2 = await prisma.class.create({
      data: { name: `Class 2 ${runId}`, batchId: batch.id, instructorId: instructor2.id },
    });
    cleanupClassIds.push(class2.id);

    await prisma.enrollment.create({
      data: { studentId: student.id, batchId: batch.id, status: "ACTIVE" },
    });

    // Authenticate sessions
    console.log("Authenticating audit sessions...");
    const superAdminCookie = await login(superAdminUser.email, testPassword);
    const adminCookie = await login(adminUser.email, testPassword);
    const inst1Cookie = await login(instructor1User.email, testPassword);
    const inst2Cookie = await login(instructor2User.email, testPassword);
    const studentCookie = await login(studentUser.email, testPassword);
    const placementCookie = await login(placementUser.email, testPassword);

    console.log("\n--- SECTION 1: ROLE PERMISSION & ACCESS MATRIX ---");

    // 1.1 PLACEMENT_STAFF cannot access assignments API (HTTP 403)
    const placementRes = await request("/api/assignments", { headers: { Cookie: placementCookie } });
    record("PLACEMENT_STAFF cannot access /api/assignments (HTTP 403 Forbidden)", placementRes.status === 403);

    // 1.2 STUDENT cannot create assignment (HTTP 403)
    const studentCreateRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ title: "Tugas Mahasiswa", classId: class1.id, subjectId: subject.id, dueDate: new Date().toISOString() }),
    });
    record("STUDENT cannot create assignments (HTTP 403 Forbidden)", studentCreateRes.status === 403);

    // 1.3 SUPER_ADMIN can create assignment for any class (HTTP 201)
    const saCreateRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        title: `Tugas SA ${runId}`,
        classId: class1.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        maxScore: 100,
        status: "PUBLISHED",
      }),
    });
    const saCreateData = await saCreateRes.json();
    const saAssignmentId = saCreateData.data?.id || saCreateData.id;
    record("SUPER_ADMIN can create assignment for any class (HTTP 201)", saCreateRes.status === 201 && Boolean(saAssignmentId));
    cleanupAssignmentIds.push(saAssignmentId);

    // 1.4 ADMIN can create assignment for any class (HTTP 201)
    const adminCreateRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        title: `Tugas Admin ${runId}`,
        classId: class2.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        maxScore: 100,
        status: "PUBLISHED",
      }),
    });
    const adminCreateData = await adminCreateRes.json();
    const adminAssignmentId = adminCreateData.data?.id || adminCreateData.id;
    record("ADMIN can create assignment for any class (HTTP 201)", adminCreateRes.status === 201 && Boolean(adminAssignmentId));
    cleanupAssignmentIds.push(adminAssignmentId);

    // 1.5 INSTRUCTOR 1 creates assignment for Class 1 (HTTP 201)
    const inst1CreateRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({
        title: `Tugas Instruktur 1 ${runId}`,
        classId: class1.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        maxScore: 100,
        status: "PUBLISHED",
      }),
    });
    const inst1CreateData = await inst1CreateRes.json();
    const inst1AssignmentId = inst1CreateData.data?.id || inst1CreateData.id;
    record("INSTRUCTOR 1 can create assignment for their own Class 1 (HTTP 201)", inst1CreateRes.status === 201 && Boolean(inst1AssignmentId));
    cleanupAssignmentIds.push(inst1AssignmentId);

    // 1.6 INSTRUCTOR 1 cannot create assignment for Class 2 (HTTP 403)
    const inst1CrossCreateRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({
        title: `Tugas Ilegal ${runId}`,
        classId: class2.id, // Class 2 belongs to Instructor 2
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    record("INSTRUCTOR 1 cannot create assignment for Class 2 (HTTP 403 Forbidden)", inst1CrossCreateRes.status === 403);

    console.log("\n--- SECTION 2: CROSS-INSTRUCTOR ISOLATION & DATA LEAK CHECKS ---");

    // 2.1 INSTRUCTOR 2 cannot view details of Class 1 assignment (HTTP 403)
    const inst2DetailRes = await request(`/api/assignments/${inst1AssignmentId}`, { headers: { Cookie: inst2Cookie } });
    record("INSTRUCTOR 2 cannot view assignment details of Class 1 (HTTP 403 Forbidden)", inst2DetailRes.status === 403);

    // 2.2 INSTRUCTOR 2 cannot view submission recap of Class 1 assignment (HTTP 403)
    const inst2RecapRes = await request(`/api/assignments/${inst1AssignmentId}/submissions`, { headers: { Cookie: inst2Cookie } });
    record("INSTRUCTOR 2 cannot view class recap of Class 1 assignment (HTTP 403 Forbidden)", inst2RecapRes.status === 403);

    // 2.3 Student submits to Class 1 assignment
    const pdfBuf = createMinimalPdfBuffer();
    const subForm = new FormData();
    subForm.append("file", new Blob([pdfBuf], { type: "application/pdf" }), "audit-sub.pdf");
    subForm.append("content", "Laporan audit");
    const subRes = await request(`/api/assignments/${inst1AssignmentId}/submissions`, {
      method: "POST",
      headers: { Cookie: studentCookie },
      body: subForm,
    });
    const subData = await subRes.json();
    const submissionId = subData.data?.id || subData.id;
    record("Student submits work to Class 1 assignment (HTTP 201)", subRes.status === 201 && Boolean(submissionId));
    cleanupSubmissionIds.push(submissionId);

    // 2.4 INSTRUCTOR 2 cannot download submission file of Class 1 (HTTP 403)
    const inst2DownloadRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      headers: { Cookie: inst2Cookie },
    });
    record("INSTRUCTOR 2 cannot download submission file of Class 1 (HTTP 403 Forbidden)", inst2DownloadRes.status === 403);

    // 2.5 INSTRUCTOR 2 cannot grade submission of Class 1 (HTTP 403)
    const inst2GradeRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: inst2Cookie },
      body: JSON.stringify({ score: 90 }),
    });
    record("INSTRUCTOR 2 cannot grade submission of Class 1 (HTTP 403 Forbidden)", inst2GradeRes.status === 403);

    // 2.6 STUDENT cannot grade submission (HTTP 403)
    const studentGradeRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({ score: 100 }),
    });
    record("STUDENT cannot grade submission (HTTP 403 Forbidden)", studentGradeRes.status === 403);

    // 2.7 Verify GET /api/assignments/[id] does NOT leak internal storagePath
    const inst1DetailRes = await request(`/api/assignments/${inst1AssignmentId}`, { headers: { Cookie: inst1Cookie } });
    const inst1DetailData = await inst1DetailRes.json();
    record(
      "Assignment detail response omits raw attachmentPath/storagePath",
      inst1DetailRes.status === 200 && inst1DetailData.data?.attachmentPath === undefined
    );

    // 2.8 Verify GET /api/assignments/[id]/submissions/[submissionId] does NOT leak internal storagePath
    const inst1SubRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      headers: { Cookie: inst1Cookie },
    });
    const inst1SubData = await inst1SubRes.json();
    record(
      "Submission detail response omits raw storagePath and returns signed downloadUrl",
      inst1SubRes.status === 200 &&
        inst1SubData.data?.storagePath === undefined &&
        typeof inst1SubData.data?.downloadUrl === "string"
    );

    console.log("\n--- SECTION 3: MAX SCORE & VALIDATION CONSISTENCY TRACING ---");

    // 3.1 maxScore = 0 rejected (must be > 0)
    const zeroMaxScoreRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ title: "Bad 0", classId: class1.id, subjectId: subject.id, dueDate: new Date().toISOString(), maxScore: 0 }),
    });
    record("Zod & API rejects maxScore = 0 (HTTP 400)", zeroMaxScoreRes.status === 400);

    // 3.2 maxScore = -10 rejected
    const negMaxScoreRes = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ title: "Bad -10", classId: class1.id, subjectId: subject.id, dueDate: new Date().toISOString(), maxScore: -10 }),
    });
    record("Zod & API rejects negative maxScore (HTTP 400)", negMaxScoreRes.status === 400);

    // 3.3 maxScore = 1001 rejected (must be <= 1000)
    const over1000Res = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ title: "Bad 1001", classId: class1.id, subjectId: subject.id, dueDate: new Date().toISOString(), maxScore: 1001 }),
    });
    record("Zod & API rejects maxScore > 1000 (HTTP 400)", over1000Res.status === 400);

    // 3.4 maxScore = 1000 accepted
    const max1000Res = await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({
        title: `Tugas Skor 1000 ${runId}`,
        classId: class1.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        maxScore: 1000,
        status: "PUBLISHED",
      }),
    });
    const max1000Data = await max1000Res.json();
    const max1000Id = max1000Data.data?.id || max1000Data.id;
    record("Zod & API accepts boundary maxScore = 1000 (HTTP 201)", max1000Res.status === 201 && Boolean(max1000Id));
    cleanupAssignmentIds.push(max1000Id);

    // 3.5 Grading with score = -1 rejected
    const gradeNegRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ score: -1 }),
    });
    record("Grading rejects score < 0 (HTTP 400)", gradeNegRes.status === 400);

    // 3.6 Grading with score = 101 on 100 maxScore assignment rejected
    const gradeOverRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ score: 101 }),
    });
    record("Grading rejects score > maxScore (HTTP 400)", gradeOverRes.status === 400);

    // 3.7 Valid grading with score = 95 on 100 maxScore accepted
    const gradeValidRes = await request(`/api/assignments/${inst1AssignmentId}/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ score: 95, feedback: "Bagus sekali" }),
    });
    const gradeValidData = await gradeValidRes.json();
    record(
      "Grading accepts valid score (score: 95, gradedById: session user)",
      gradeValidRes.status === 200 &&
        gradeValidData.data?.score === 95 &&
        gradeValidData.data?.status === "GRADED" &&
        gradeValidData.data?.gradedById === instructor1User.id
    );

    console.log("\n--- SECTION 4: SERVER SESSION TRUTH & RETENTION ISOLATION ---");

    // 4.1 Client-spoofed studentId is ignored on submission (server binds to session)
    const spoofSubForm = new FormData();
    spoofSubForm.append("file", new Blob([pdfBuf], { type: "application/pdf" }), "audit-spoof.pdf");
    spoofSubForm.append("studentId", "spoofed_fake_student_id_123");
    const spoofSubRes = await request(`/api/assignments/${max1000Id}/submissions`, {
      method: "POST",
      headers: { Cookie: studentCookie },
      body: spoofSubForm,
    });
    const spoofSubData = await spoofSubRes.json();
    const spoofSubId = spoofSubData.data?.id || spoofSubData.id;
    cleanupSubmissionIds.push(spoofSubId);

    const actualSubRecord = await prisma.assignmentSubmission.findUnique({
      where: { id: spoofSubId },
      select: { studentId: true },
    });
    record(
      "Server ignores client-spoofed studentId and uses authenticated student session",
      actualSubRecord?.studentId === student.id
    );

    // 4.2 Client-spoofed gradedById is ignored on grading (server binds to session user)
    const spoofGradeRes = await request(`/api/assignments/${max1000Id}/submissions/${spoofSubId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: inst1Cookie },
      body: JSON.stringify({ score: 850, gradedById: "fake_admin_user_id" }),
    });
    const spoofGradeData = await spoofGradeRes.json();
    record(
      "Server ignores client-spoofed gradedById and uses authenticated instructor session",
      spoofGradeRes.status === 200 && spoofGradeData.data?.gradedById === instructor1User.id
    );

    // 4.3 AssessmentScore table remains 0 (strict isolation from Assignment grades)
    const assessmentScoresCount = await prisma.assessmentScore.count({ where: { studentId: student.id } });
    record("AssessmentScore table strictly isolated (count remains 0)", assessmentScoresCount === 0);

    console.log(`\n==================================================`);
    console.log(`ADVANCED AUDIT RESULTS: ${passed} / ${total} checks passed.`);
    console.log(`==================================================\n`);
  } finally {
    console.log("Cleaning up audit test records...");
    for (const id of cleanupSubmissionIds) {
      await prisma.assignmentSubmission.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupAssignmentIds) {
      await prisma.assignment.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupStudentIds) {
      await prisma.enrollment.deleteMany({ where: { studentId: id } }).catch(() => {});
      await prisma.student.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupClassIds) {
      await prisma.class.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupBatchIds) {
      await prisma.batch.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupInstructorIds) {
      await prisma.instructor.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupSubjectIds) {
      await prisma.programSubject.deleteMany({ where: { subjectId: id } }).catch(() => {});
      await prisma.subject.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupProgramIds) {
      await prisma.programSubject.deleteMany({ where: { programId: id } }).catch(() => {});
      await prisma.program.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log("Audit database cleanup complete.");
  }
}

runAdvancedAuditSuite().catch((err) => {
  console.error("Advanced audit suite failed:", err);
  process.exit(1);
});
