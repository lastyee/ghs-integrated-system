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
  console.log("=== STEP 66C ASSESSMENT DATA INTEGRITY HARDENING VERIFICATION ===\n");

  const createdUserIds = [];
  const createdAssessmentIds = [];
  let linkedStudentId = null;

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

    console.log("Logging in users...");
    const studentCookies = await login("student.demo@ghs.local", studentPassword);

    const adminUser = await createTempUser("ADMIN", "test.admin66c@ghs.test");
    const adminCookies = await login(adminUser.email, tempPassword);

    // Link student 1 to demo student for ownership tests
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });
    const st1 = await prisma.student.findUnique({
      where: { userId: demoStudentUser.id },
    });
    if (!st1) {
      throw new Error("Student 1 linked to demo user not found.");
    }

    const st1Enrollment = await prisma.enrollment.findFirst({
      where: { studentId: st1.id },
    });
    const otherStudents = await prisma.student.findMany({
      where: {
        id: { not: st1.id },
        enrollments: { some: { batchId: st1Enrollment.batchId } },
      },
      take: 2,
    });
    const [st2, st3] = otherStudents;

    const sampleClass = await prisma.class.findFirst({
      where: { batchId: st1Enrollment.batchId },
    });
    const sampleSubject = await prisma.subject.findFirst();

    if (!sampleClass || !sampleSubject) {
      throw new Error("Missing sample class or subject in database.");
    }

    console.log("\n--- TEST 1: Assessment tanpa score: PATCH maxScore 100 -> 80 ---");
    // Create assessment A with maxScore 100, no scores
    const resAsmA = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-66C-ASMA-NOSCORES",
        type: "ASSIGNMENT",
        maxScore: 100,
        status: "OPEN",
      }),
    });
    record("Setup AsmA returns 201", 201, resAsmA.status);
    const asmA = await resAsmA.json();
    createdAssessmentIds.push(asmA.id);

    // PATCH maxScore 100 -> 80 (EXPECT 200)
    const resPatchAsmA = await request(`/api/assessments/${asmA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        maxScore: 80,
      }),
    });
    record("1. Assessment tanpa score: PATCH maxScore 100 -> 80 returns 200", 200, resPatchAsmA.status);
    const patchedAsmA = await resPatchAsmA.json();
    record("1. maxScore updated to 80", 80, patchedAsmA.maxScore);

    console.log("\n--- TEST 2: Assessment dengan existing score 70: PATCH maxScore 100 -> 80 ---");
    // Create assessment B with maxScore 100, score 70
    const resAsmB = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-66C-ASMB-SCORE70",
        type: "ASSIGNMENT",
        maxScore: 100,
        status: "OPEN",
      }),
    });
    record("Setup AsmB returns 201", 201, resAsmB.status);
    const asmB = await resAsmB.json();
    createdAssessmentIds.push(asmB.id);

    const resScore70 = await request(`/api/assessments/${asmB.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: st1.id,
        score: 70,
        feedback: "Score 70",
      }),
    });
    record("Setup score 70 on AsmB returns 201", 201, resScore70.status);

    // PATCH maxScore 100 -> 80 (EXPECT 200, since 80 >= 70)
    const resPatchAsmB = await request(`/api/assessments/${asmB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        maxScore: 80,
      }),
    });
    record("2. Assessment dengan existing score 70: PATCH maxScore 100 -> 80 returns 200", 200, resPatchAsmB.status);
    const patchedAsmB = await resPatchAsmB.json();
    record("2. maxScore updated to 80", 80, patchedAsmB.maxScore);

    console.log("\n--- TEST 3: Assessment dengan existing score 85: PATCH maxScore 100 -> 80 ---");
    // Create assessment C with maxScore 100, score 85
    const resAsmC = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-66C-ASMC-SCORE85",
        type: "ASSIGNMENT",
        maxScore: 100,
        status: "OPEN",
      }),
    });
    record("Setup AsmC returns 201", 201, resAsmC.status);
    const asmC = await resAsmC.json();
    createdAssessmentIds.push(asmC.id);

    const resScore85 = await request(`/api/assessments/${asmC.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: st1.id,
        score: 85,
        feedback: "Score 85",
      }),
    });
    record("Setup score 85 on AsmC returns 201", 201, resScore85.status);

    // Count audit logs before failed patch
    const auditCountBeforeFail = await prisma.auditLog.count({
      where: { entity: "Assessment", entityId: asmC.id, action: "UPDATE" },
    });

    // PATCH maxScore 100 -> 80 (EXPECT 400, since 80 < 85)
    const resPatchAsmC = await request(`/api/assessments/${asmC.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        maxScore: 80,
      }),
    });
    record("3. Assessment dengan existing score 85: PATCH maxScore 100 -> 80 returns 400", 400, resPatchAsmC.status);
    const errBodyC = await resPatchAsmC.json();
    record("3. Error message explains maxScore cannot be lower than existing score", true, errBodyC.message.includes("cannot be lower"));

    console.log("\n--- TEST 4 & 5: Assessment dengan existing scores 70, 85, 90 ---");
    // Create assessment D with maxScore 100, scores 70, 85, 90
    const resAsmD = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-66C-ASMD-SCORES-70-85-90",
        type: "EXAM",
        maxScore: 100,
        status: "OPEN",
      }),
    });
    record("Setup AsmD returns 201", 201, resAsmD.status);
    const asmD = await resAsmD.json();
    createdAssessmentIds.push(asmD.id);

    await request(`/api/assessments/${asmD.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ studentId: st1.id, score: 70 }),
    });
    await request(`/api/assessments/${asmD.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ studentId: st2.id, score: 85 }),
    });
    const resScore90 = await request(`/api/assessments/${asmD.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ studentId: st3.id, score: 90 }),
    });
    record("Setup scores 70, 85, 90 on AsmD complete", 201, resScore90.status);

    // 4. PATCH maxScore 100 -> 90 (EXPECT 200, since 90 >= highest score 90)
    const resPatchAsmD90 = await request(`/api/assessments/${asmD.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        maxScore: 90,
      }),
    });
    record("4. Assessment dengan scores 70, 85, 90: PATCH maxScore 100 -> 90 returns 200", 200, resPatchAsmD90.status);
    const patchedAsmD90 = await resPatchAsmD90.json();
    record("4. maxScore successfully updated to 90", 90, patchedAsmD90.maxScore);

    // 5. PATCH maxScore 90 -> 89 (EXPECT 400, since 89 < highest score 90)
    const resPatchAsmD89 = await request(`/api/assessments/${asmD.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        maxScore: 89,
      }),
    });
    record("5. Assessment dengan scores 70, 85, 90: PATCH maxScore 90 -> 89 returns 400", 400, resPatchAsmD89.status);

    console.log("\n--- TEST 6: Setelah PATCH ditolak, data tetap konsisten ---");
    // Verify AsmC in database: maxScore remains 100, score remains 85
    const dbAsmC = await prisma.assessment.findUnique({
      where: { id: asmC.id },
      include: { scores: true },
    });
    record("6. AsmC maxScore in database remains 100", 100, dbAsmC.maxScore);
    record("6. AsmC existing score in database remains 85", 85, dbAsmC.scores[0].score);

    // Verify AsmD in database: maxScore remains 90, score 90 remains
    const dbAsmD = await prisma.assessment.findUnique({
      where: { id: asmD.id },
      include: { scores: true },
    });
    record("6. AsmD maxScore in database remains 90 (not 89)", 90, dbAsmD.maxScore);
    record("6. AsmD 3 scores remain intact", 3, dbAsmD.scores.length);

    console.log("\n--- TEST 7: Assessment COMPLETED: score update tetap diperbolehkan ---");
    // Set AsmD status to COMPLETED
    await request(`/api/assessments/${asmD.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ status: "COMPLETED" }),
    });

    const score90Record = dbAsmD.scores.find((s) => s.score === 90);
    // Correct score from 90 to 88 on COMPLETED assessment (EXPECT 200, not 403)
    const resCorrectOnCompleted = await request(`/api/assessments/${asmD.id}/scores/${score90Record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        score: 88,
        feedback: "Koreksi pada sesi COMPLETED",
      }),
    });
    record("7. Score update on COMPLETED assessment returns 200 (not locked)", 200, resCorrectOnCompleted.status);
    const updatedScoreCompleted = await resCorrectOnCompleted.json();
    record("7. Score successfully updated to 88", 88, updatedScoreCompleted.score);

    console.log("\n--- TEST 8: Successful maxScore update creates audit log with before/after ---");
    const auditSuccess = await prisma.auditLog.findFirst({
      where: {
        entity: "Assessment",
        entityId: asmA.id,
        action: "UPDATE",
      },
    });
    record("8. Audit log for successful maxScore update exists", true, Boolean(auditSuccess));
    record("8. Audit before maxScore is 100", 100, auditSuccess.changes.before.maxScore);
    record("8. Audit after maxScore is 80", 80, auditSuccess.changes.after.maxScore);

    console.log("\n--- TEST 9: Failed maxScore update does NOT create UPDATE audit ---");
    const auditCountAfterFail = await prisma.auditLog.count({
      where: { entity: "Assessment", entityId: asmC.id, action: "UPDATE" },
    });
    record("9. Failed update did not create any new audit log", auditCountBeforeFail, auditCountAfterFail);

    console.log("\n--- SECURITY CHECKS ---");
    // Student cannot PATCH assessment maxScore (403)
    const resStudentPatchAsm = await request(`/api/assessments/${asmA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentCookies },
      body: JSON.stringify({ maxScore: 50 }),
    });
    record("Security: Student cannot PATCH assessment returns 403", 403, resStudentPatchAsm.status);

    // Student cannot PATCH score (403)
    const resStudentPatchScore = await request(`/api/assessments/${asmB.id}/scores/${asmB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentCookies },
      body: JSON.stringify({ score: 99 }),
    });
    record("Security: Student cannot PATCH score returns 403", 403, resStudentPatchScore.status);

    console.log("\nALL STEP 66C HARDENING TESTS PASSED SUCCESSFULLY!\n");
  } finally {
    console.log("--- CLEANUP TEMPORARY TEST DATA ---");

    if (createdAssessmentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entity: "Assessment", entityId: { in: createdAssessmentIds } },
            { entity: "AssessmentScore" },
          ],
        },
      });

      await prisma.assessmentScore.deleteMany({
        where: { assessmentId: { in: createdAssessmentIds } },
      });

      await prisma.assessment.deleteMany({
        where: { id: { in: createdAssessmentIds } },
      });
      console.log(`Cleaned up ${createdAssessmentIds.length} test assessments and related scores & audit logs.`);
    }

    if (linkedStudentId) {
      await prisma.student.update({
        where: { id: linkedStudentId },
        data: { userId: null },
      });
      console.log("Reset linked student userId to null.");
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      console.log(`Cleaned up ${createdUserIds.length} temporary test users.`);
    }
  }
}

run()
  .then(() => {
    console.log("TEST RUN COMPLETE.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nTEST SUITE FAILED WITH ERROR:", err);
    process.exit(1);
  });
