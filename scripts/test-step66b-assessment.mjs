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
  console.log("=== STEP 66B ASSESSMENT & SCORE MODULE VERIFICATION ===\n");

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

    const superAdminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("Logging in as demo users...");
    const superAdminCookies = await login("admin.demo@ghs.local", superAdminPassword);
    const studentCookies = await login("student.demo@ghs.local", studentPassword);

    console.log("Creating temporary test users for RBAC testing...");
    const adminUser = await createTempUser("ADMIN", "test.admin@ghs.test");
    const academicUser = await createTempUser("ACADEMIC_STAFF", "test.academic@ghs.test");
    const managementUser = await createTempUser("MANAGEMENT", "test.management@ghs.test");
    const placementUser = await createTempUser("PLACEMENT_STAFF", "test.placement@ghs.test");

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);

    // Link demo student to first student in GHI-07 for ownership tests
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });
    const sampleStudents = await prisma.student.findMany({ take: 2 });
    const studentA = sampleStudents[0];
    const studentB = sampleStudents[1];

    await prisma.student.update({
      where: { id: studentA.id },
      data: { userId: demoStudentUser.id },
    });
    linkedStudentId = studentA.id;

    const sampleClass = await prisma.class.findFirst();
    const sampleSubject = await prisma.subject.findFirst();

    if (!sampleClass || !sampleSubject) {
      throw new Error("Missing sample class or subject in database.");
    }

    console.log("\n--- RUNNING 42 REQUIRED TESTS ---\n");

    // ==========================================
    // AUTHORIZATION
    // ==========================================

    // 1. GET unauthenticated → 401
    const res1 = await request("/api/assessments");
    record("1. GET unauthenticated returns 401", 401, res1.status);

    // 2. GET authorized SUPER_ADMIN → 200
    const res2 = await request("/api/assessments", { headers: { Cookie: superAdminCookies } });
    record("2. GET authorized SUPER_ADMIN returns 200", 200, res2.status);

    // 3. GET ADMIN → 200
    const res3 = await request("/api/assessments", { headers: { Cookie: adminCookies } });
    record("3. GET ADMIN returns 200", 200, res3.status);

    // 4. GET ACADEMIC_STAFF → 200
    const res4 = await request("/api/assessments", { headers: { Cookie: academicCookies } });
    record("4. GET ACADEMIC_STAFF returns 200", 200, res4.status);

    // 5. GET MANAGEMENT → 200
    const res5 = await request("/api/assessments", { headers: { Cookie: managementCookies } });
    record("5. GET MANAGEMENT returns 200", 200, res5.status);

    // 6. GET STUDENT → 200
    const res6 = await request("/api/assessments", { headers: { Cookie: studentCookies } });
    record("6. GET STUDENT returns 200", 200, res6.status);

    // 7. GET PLACEMENT_STAFF → 403
    const res7 = await request("/api/assessments", { headers: { Cookie: placementCookies } });
    record("7. GET PLACEMENT_STAFF returns 403", 403, res7.status);

    // ==========================================
    // ASSESSMENT CREATE
    // ==========================================

    // 8. POST SUPER_ADMIN → 201
    const res8 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-SUPERADMIN",
        description: "Created by Super Admin",
        type: "EXAM",
        maxScore: 100,
        status: "OPEN",
      }),
    });
    record("8. POST SUPER_ADMIN returns 201", 201, res8.status);
    const createdAsm8 = await res8.json();
    createdAssessmentIds.push(createdAsm8.id);

    // 9. POST ADMIN → 201
    const res9 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-ADMIN",
        description: "Created by Admin",
        type: "ASSIGNMENT",
        maxScore: 50,
        status: "OPEN",
      }),
    });
    record("9. POST ADMIN returns 201", 201, res9.status);
    const createdAsm9 = await res9.json();
    createdAssessmentIds.push(createdAsm9.id);

    // 10. POST ACADEMIC_STAFF → 403
    const res10 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: academicCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-ACADEMIC",
        type: "PRACTICAL",
        maxScore: 100,
      }),
    });
    record("10. POST ACADEMIC_STAFF returns 403", 403, res10.status);

    // 11. POST MANAGEMENT → 403
    const res11 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-MGMT",
        type: "PRACTICAL",
        maxScore: 100,
      }),
    });
    record("11. POST MANAGEMENT returns 403", 403, res11.status);

    // 12. POST STUDENT → 403
    const res12 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-STUDENT",
        type: "PRACTICAL",
        maxScore: 100,
      }),
    });
    record("12. POST STUDENT returns 403", 403, res12.status);

    // 13. POST PLACEMENT_STAFF → 403
    const res13 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-PLACEMENT",
        type: "PRACTICAL",
        maxScore: 100,
      }),
    });
    record("13. POST PLACEMENT_STAFF returns 403", 403, res13.status);

    // ==========================================
    // ASSESSMENT VALIDATION
    // ==========================================

    // 14. missing classId → 400
    const res14 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        subjectId: sampleSubject.id,
        name: "TEST-ASM-NOCLASS",
        type: "EXAM",
        maxScore: 100,
      }),
    });
    record("14. missing classId returns 400", 400, res14.status);

    // 15. missing subjectId → 400
    const res15 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        name: "TEST-ASM-NOSUBJECT",
        type: "EXAM",
        maxScore: 100,
      }),
    });
    record("15. missing subjectId returns 400", 400, res15.status);

    // 16. empty name → 400
    const res16 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "   ",
        type: "EXAM",
        maxScore: 100,
      }),
    });
    record("16. empty name returns 400", 400, res16.status);

    // 17. invalid type → 400
    const res17 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-INVALIDTYPE",
        type: "INVALID_EXAM_TYPE",
        maxScore: 100,
      }),
    });
    record("17. invalid type returns 400", 400, res17.status);

    // 18. invalid maxScore (<= 0) → 400
    const res18 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: sampleSubject.id,
        name: "TEST-ASM-INVALIDMAXSCORE",
        type: "EXAM",
        maxScore: 0,
      }),
    });
    record("18. invalid maxScore returns 400", 400, res18.status);

    // 19. nonexistent class → 404
    const res19 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: "nonexistent-class-id-xyz",
        subjectId: sampleSubject.id,
        name: "TEST-ASM-NONEXISTENTCLASS",
        type: "EXAM",
        maxScore: 100,
      }),
    });
    record("19. nonexistent class returns 404", 404, res19.status);

    // 20. nonexistent subject → 404
    const res20 = await request("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        classId: sampleClass.id,
        subjectId: "nonexistent-subject-id-xyz",
        name: "TEST-ASM-NONEXISTENTSUBJECT",
        type: "EXAM",
        maxScore: 100,
      }),
    });
    record("20. nonexistent subject returns 404", 404, res20.status);

    // ==========================================
    // SCORE
    // ==========================================

    // Use createdAsm9 which has maxScore = 50
    // 21. valid score → 201
    const res21 = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentA.id,
        score: 45,
        feedback: "Bagus sekali",
      }),
    });
    record("21. valid score returns 201", 201, res21.status);
    const createdScore21 = await res21.json();

    // 22. score < 0 → 400
    const res22 = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        score: -5,
        feedback: "Invalid score",
      }),
    });
    record("22. score < 0 returns 400", 400, res22.status);

    // 23. score > maxScore (50) → 400
    const res23 = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        score: 55, // maxScore is 50
        feedback: "Exceeds max score",
      }),
    });
    record("23. score > maxScore returns 400", 400, res23.status);

    // 24. duplicate score → 409
    const res24 = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentA.id, // already scored in test 21
        score: 40,
        feedback: "Duplicate attempt",
      }),
    });
    record("24. duplicate score returns 409", 409, res24.status);

    // 25. nonexistent student → 404
    const res25 = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: "nonexistent-student-xyz",
        score: 30,
      }),
    });
    record("25. nonexistent student returns 404", 404, res25.status);

    // 26. nonexistent assessment → 404
    const res26 = await request(`/api/assessments/nonexistent-assessment-xyz/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        score: 30,
      }),
    });
    record("26. nonexistent assessment returns 404", 404, res26.status);

    // ==========================================
    // STUDENT OWNERSHIP
    // ==========================================

    // Also add score for studentB on createdAsm9 so we can test student isolation
    const resAddB = await request(`/api/assessments/${createdAsm9.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        score: 48,
        feedback: "Feedback for Student B",
      }),
    });
    record("Setup: add score for studentB", 201, resAddB.status);

    // 27. Student sees own score → 200
    const res27 = await request(`/api/assessments/${createdAsm9.id}`, {
      headers: { Cookie: studentCookies },
    });
    record("27. Student sees own assessment detail returns 200", 200, res27.status);
    const studentAsmView = await res27.json();
    record(
      "27. Student view only contains own score",
      true,
      studentAsmView.scores.length === 1 && studentAsmView.scores[0].studentId === studentA.id
    );

    // 28. Student cannot see other student's score via /scores?studentId=... → 403
    const res28 = await request(`/api/assessments/${createdAsm9.id}/scores?studentId=${studentB.id}`, {
      headers: { Cookie: studentCookies },
    });
    record("28. Student accessing other student's score returns 403 Forbidden", 403, res28.status);

    // 29. Student cannot create score → 403
    const res29 = await request(`/api/assessments/${createdAsm8.id}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookies },
      body: JSON.stringify({
        studentId: studentA.id,
        score: 90,
      }),
    });
    record("29. Student cannot create score returns 403", 403, res29.status);

    // 30. Student cannot update score → 403
    const res30 = await request(`/api/assessments/${createdAsm9.id}/scores/${createdScore21.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentCookies },
      body: JSON.stringify({
        score: 50,
      }),
    });
    record("30. Student cannot update score returns 403", 403, res30.status);

    // ==========================================
    // UPDATE
    // ==========================================

    // 31. ADMIN update score → 200
    const res31 = await request(`/api/assessments/${createdAsm9.id}/scores/${createdScore21.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        score: 49,
        feedback: "Koreksi nilai setelah review",
      }),
    });
    record("31. ADMIN update score returns 200", 200, res31.status);
    const updatedScore31 = await res31.json();
    record("31. Updated score value matches", 49, updatedScore31.score);

    // 32. ADMIN update assessment → 200
    const res32 = await request(`/api/assessments/${createdAsm9.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        name: "TEST-ASM-ADMIN-UPDATED",
        status: "COMPLETED",
      }),
    });
    record("32. ADMIN update assessment returns 200", 200, res32.status);
    const updatedAsm32 = await res32.json();
    record("32. Assessment status is updated to COMPLETED", "COMPLETED", updatedAsm32.status);

    // 33. invalid updated score (score > maxScore 50) → 400
    const res33 = await request(`/api/assessments/${createdAsm9.id}/scores/${createdScore21.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        score: 60, // exceeds maxScore 50
      }),
    });
    record("33. invalid updated score returns 400", 400, res33.status);

    // 34. score from another assessment via wrong URL → rejected (400)
    // createdScore21 belongs to createdAsm9, but requested via createdAsm8 URL
    const res34 = await request(`/api/assessments/${createdAsm8.id}/scores/${createdScore21.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        score: 40,
      }),
    });
    record("34. score from another assessment via wrong URL rejected", 400, res34.status);

    // ==========================================
    // DELETE
    // ==========================================

    // 35. DELETE assessment → 405
    const res35 = await request(`/api/assessments/${createdAsm9.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("35. DELETE assessment returns 405", 405, res35.status);

    // 36. DELETE score → 405
    const res36 = await request(`/api/assessments/${createdAsm9.id}/scores/${createdScore21.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("36. DELETE score returns 405", 405, res36.status);

    // ==========================================
    // SECURITY
    // ==========================================

    // 37. Response contains no passwordHash
    const resGetDetail = await request(`/api/assessments/${createdAsm9.id}`, {
      headers: { Cookie: adminCookies },
    });
    const detailBody = await resGetDetail.text();
    record("37. Response contains no passwordHash", false, detailBody.includes("passwordHash"));

    // 38. Response contains no credentials
    record("38. Response contains no credentials / password", false, detailBody.includes("secret") || detailBody.includes("password"));

    // ==========================================
    // AUDIT LOG
    // ==========================================

    // 39. Assessment CREATE creates audit log
    const auditAsmCreate = await prisma.auditLog.findFirst({
      where: {
        entity: "Assessment",
        action: "CREATE",
        entityId: createdAsm8.id,
      },
    });
    record("39. Assessment CREATE creates audit log", true, Boolean(auditAsmCreate));

    // 40. Assessment UPDATE creates audit log
    const auditAsmUpdate = await prisma.auditLog.findFirst({
      where: {
        entity: "Assessment",
        action: "UPDATE",
        entityId: createdAsm9.id,
      },
    });
    record("40. Assessment UPDATE creates audit log", true, Boolean(auditAsmUpdate));

    // 41. Score CREATE creates audit log
    const auditScoreCreate = await prisma.auditLog.findFirst({
      where: {
        entity: "AssessmentScore",
        action: "CREATE",
        entityId: createdScore21.id,
      },
    });
    record("41. Score CREATE creates audit log", true, Boolean(auditScoreCreate));

    // 42. Score UPDATE creates audit log with before/after
    const auditScoreUpdate = await prisma.auditLog.findFirst({
      where: {
        entity: "AssessmentScore",
        action: "UPDATE",
        entityId: createdScore21.id,
      },
    });
    record(
      "42. Score UPDATE creates audit log with before/after",
      true,
      Boolean(
        auditScoreUpdate &&
          auditScoreUpdate.changes?.before &&
          auditScoreUpdate.changes?.after
      )
    );

    console.log("\nALL 42 TESTS PASSED SUCCESSFULLY!\n");
  } finally {
    console.log("--- CLEANUP TEMPORARY TEST DATA ---");

    // Clean up test scores and assessments
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

    // Reset linked student
    if (linkedStudentId) {
      await prisma.student.update({
        where: { id: linkedStudentId },
        data: { userId: null },
      });
      console.log("Reset linked student userId to null.");
    }

    // Clean up test users
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
