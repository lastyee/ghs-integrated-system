import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "");
const password = `Step94-${randomUUID()}!`;
const results = [];
const created = {
  users: [],
  students: [],
  enrollments: [],
  assessments: [],
  scores: [],
  classes: [],
  batches: [],
  instructors: [],
  subjects: [],
  programs: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, passed, details = "") {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
  if (!passed) throw new Error(`Test failed: ${name}`);
}

function assertSafeTarget() {
  assertSafeMutationTarget({
    mutationFlag: "STEP94_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated",
    confirmationFlag: "STEP94_TEST_CONFIRM_DATABASE",
    baseUrl,
  });
}

function mergeCookies(existing, response) {
  const headers = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();
  for (const pair of existing.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  for (const header of headers) {
    const pair = header.split(";")[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return [...cookieMap].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function login(email) {
  let cookies = "";
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  cookies = mergeCookies(cookies, csrfResponse);
  assert(csrfResponse.ok, `Unable to retrieve CSRF token (HTTP ${csrfResponse.status}).`);
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
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
  assert([302, 303].includes(response.status), `Login failed for fixture ${email} (HTTP ${response.status}).`);
  return cookies;
}

async function api(path, cookies, method = "GET", body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    ...(cookies ? { headers: { Cookie: cookies, ...(body ? { "Content-Type": "application/json" } : {}) } } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function track(table, row) {
  created[table].push(row.id);
  return row;
}

async function ensurePermission() {
  const permission = await prisma.permission.findUnique({
    where: { name: "assessment:delete" },
    select: { id: true, action: true, subject: true },
  });
  assert(
    permission?.action === "delete" && permission.subject === "assessment",
    "assessment:delete must be synchronized from the permission source before testing.",
  );

  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "INSTRUCTOR", "PLACEMENT_STAFF", "MANAGEMENT", "STUDENT"] } },
    select: { id: true, name: true },
  });
  assert(roles.length === 7, "All required fixture roles must exist.");
  const allowed = new Set(["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"]);
  const existingAssignments = await prisma.rolePermission.findMany({
    where: { permissionId: permission.id },
    select: { role: { select: { name: true } } },
  });
  const assignedRoles = existingAssignments.map(({ role }) => role.name).sort();
  const expectedRoles = [...allowed].sort();
  assert(
    JSON.stringify(assignedRoles) === JSON.stringify(expectedRoles),
    "assessment:delete role assignments must match the source policy before testing.",
  );
  return Object.fromEntries(await Promise.all(roles.map(async ({ id, name }) => [
    name,
    await prisma.user.create({
      data: {
        email: `step94-${name.toLowerCase()}-${suffix}@ghs.test`,
        name: `STEP 94 ${name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: id,
      },
      select: { id: true, email: true },
    }).then((user) => {
      created.users.push(user.id);
      return user;
    }),
  ])));
}

async function createAcademicFixtures(roleUsers) {
  const program = track("programs", await prisma.program.create({
    data: { code: `94${suffix.slice(0, 8)}`, name: `STEP 94 Program ${suffix}` },
  }));
  const subject = track("subjects", await prisma.subject.create({
    data: { code: `94${suffix.slice(0, 8)}`, name: `STEP 94 Subject ${suffix}` },
  }));
  const batch = track("batches", await prisma.batch.create({
    data: { name: `STEP94-BATCH-${suffix}`, programId: program.id, startDate: new Date("2030-01-01T00:00:00Z") },
  }));
  const instructor = track("instructors", await prisma.instructor.create({
    data: { name: `STEP 94 Instructor ${suffix}` },
  }));
  const classRecord = track("classes", await prisma.class.create({
    data: {
      name: `STEP94-CLASS-${suffix}`,
      batchId: batch.id,
      instructorId: instructor.id,
    },
  }));
  const student = track("students", await prisma.student.create({
    data: { nim: `94${suffix.slice(0, 8)}`, name: `STEP 94 Student ${suffix}` },
  }));
  const secondStudent = track("students", await prisma.student.create({
    data: { nim: `95${suffix.slice(0, 8)}`, name: `STEP 94 Race Student ${suffix}` },
  }));
  for (const fixtureStudent of [student, secondStudent]) {
    const enrollment = await prisma.enrollment.create({
      data: { studentId: fixtureStudent.id, batchId: batch.id },
    });
    created.enrollments.push(enrollment.id);
  }

  const makeAssessment = async (label, status, withScore = false, scoreStudent = student) => {
    const assessment = track("assessments", await prisma.assessment.create({
      data: {
        classId: classRecord.id,
        subjectId: subject.id,
        name: `STEP 94 ${label} ${suffix}`,
        type: "ASSIGNMENT",
        maxScore: 100,
        status,
      },
    }));
    if (withScore) {
      const score = await prisma.assessmentScore.create({
        data: { assessmentId: assessment.id, studentId: scoreStudent.id, score: 75, feedback: "STEP 94 fixture" },
      });
      created.scores.push(score.id);
    }
    return assessment;
  };

  return {
    student,
    secondStudent,
    openNoScore: await makeAssessment("OPEN EMPTY", "OPEN"),
    openWithScore: await makeAssessment("OPEN SCORED", "OPEN", true),
    completedNoScore: await makeAssessment("COMPLETED EMPTY", "COMPLETED"),
    completedWithScore: await makeAssessment("COMPLETED SCORED", "COMPLETED", true),
    academicCanDelete: await makeAssessment("ACADEMIC ROLE", "OPEN"),
    adminCanDelete: await makeAssessment("ADMIN ROLE", "OPEN"),
    superAdminCanDelete: await makeAssessment("SUPER ADMIN ROLE", "OPEN"),
    concurrency: await makeAssessment("RACE", "OPEN"),
    roleUsers,
  };
}

async function getCounts() {
  const models = [
    "user", "instructor", "program", "batch", "student", "enrollment",
    "subject", "class", "assessment", "assessmentScore", "auditLog",
  ];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
}

async function assertManualRowsExist() {
  const batch = await prisma.batch.findFirst({ where: { name: "GHI-09" }, select: { id: true } });
  const student = await prisma.student.findUnique({ where: { nim: "269067460" }, select: { id: true } });
  const employer = await prisma.employer.findFirst({
    where: { name: { equals: "bounty", mode: "insensitive" } },
    select: { id: true, vacancies: { select: { id: true, title: true } }, placements: { select: { id: true } } },
  });
  const vacancy = employer?.vacancies.find(({ title }) => title === "KITCHEN");
  const document = await prisma.document.findFirst({ where: { type: "KTP" }, select: { id: true } });
  assert(batch && student && employer && vacancy && employer.placements.length > 0 && document, "Required manual records are missing; test stopped before fixtures.");
  return {
    batchId: batch.id,
    studentId: student.id,
    employerId: employer.id,
    vacancyId: vacancy.id,
    placementIds: employer.placements.map(({ id }) => id).sort(),
    documentId: document.id,
  };
}

async function cleanup() {
  const errors = [];
  const attempt = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push(`${label}: ${String(error)}`);
    }
  };
  const deleteByIds = async (model, ids) => {
    if (ids.length) await prisma[model].deleteMany({ where: { id: { in: ids } } });
  };

  await attempt("assessment score fixtures", () => deleteByIds("assessmentScore", created.scores));
  await attempt("remaining assessment fixtures", () => deleteByIds("assessment", created.assessments));
  await attempt("enrollment fixtures", () => deleteByIds("enrollment", created.enrollments));
  await attempt("student fixtures", () => deleteByIds("student", created.students));
  await attempt("class fixtures", () => deleteByIds("class", created.classes));
  await attempt("batch fixtures", () => deleteByIds("batch", created.batches));
  await attempt("instructor fixtures", () => deleteByIds("instructor", created.instructors));
  await attempt("subject fixtures", () => deleteByIds("subject", created.subjects));
  await attempt("program fixtures", () => deleteByIds("program", created.programs));
  await attempt("user fixtures", () => deleteByIds("user", created.users));
  if (errors.length) throw new Error(errors.join("\n"));
}

async function run() {
  assertSafeTarget();
  const manualBaseline = await assertManualRowsExist();
  const baseline = await getCounts();
  let cleanupError;
  const successfulDeleteIds = [];

  try {
    const users = await ensurePermission();
    const sessions = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([role, user]) => [role, await login(user.email)])));
    const fixtures = await createAcademicFixtures(users);
    const admin = sessions.ADMIN;

    record("Unauthenticated DELETE returns 401", (await api(`/api/assessments/${fixtures.openNoScore.id}`, undefined, "DELETE")).status === 401);
    for (const role of ["STUDENT", "INSTRUCTOR", "PLACEMENT_STAFF", "MANAGEMENT"]) {
      record(`${role} DELETE returns 403`, (await api(`/api/assessments/${fixtures.openNoScore.id}`, sessions[role], "DELETE")).status === 403);
    }
    record("Nonexistent assessment returns 404", (await api(`/api/assessments/step94-missing-${suffix}`, admin, "DELETE")).status === 404);

    const getAssessment = await api(`/api/assessments/${fixtures.openNoScore.id}`, admin);
    record("Assessment GET detail remains available", getAssessment.ok);
    const getScores = await api(`/api/assessments/${fixtures.openWithScore.id}/scores`, admin);
    record("AssessmentScore GET list remains available", getScores.ok);

    const assessmentPatch = await api(`/api/assessments/${fixtures.openNoScore.id}`, admin, "PATCH", { description: "Step 94 PATCH regression" });
    record("Existing Assessment PATCH remains functional", assessmentPatch.ok);
    const score = await prisma.assessmentScore.findFirst({ where: { assessmentId: fixtures.openWithScore.id }, select: { id: true } });
    const scorePatch = await api(`/api/assessments/${fixtures.openWithScore.id}/scores/${score.id}`, admin, "PATCH", { score: 76, feedback: "Step 94 corrected fixture" });
    record("Existing AssessmentScore PATCH remains functional", scorePatch.ok);
    const scoreGet = await api(`/api/assessments/${fixtures.openWithScore.id}/scores/${score.id}`, admin);
    record("AssessmentScore GET detail remains functional", scoreGet.ok);

    for (const role of ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"]) {
      const assessment = fixtures[role === "SUPER_ADMIN" ? "superAdminCanDelete" : role === "ADMIN" ? "adminCanDelete" : "academicCanDelete"];
      const response = await api(`/api/assessments/${assessment.id}`, sessions[role], "DELETE");
      record(`${role} may delete an eligible Assessment`, response.status === 200, `HTTP ${response.status}`);
      const deleted = await prisma.assessment.findUnique({ where: { id: assessment.id }, select: { id: true } });
      record(`${role} successful delete removes only the Assessment`, response.status === 200 && !deleted);
      if (response.status === 200) successfulDeleteIds.push(assessment.id);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "ASSESSMENT_DELETE", entity: "Assessment", entityId: assessment.id, userId: users[role].id },
        select: { id: true },
      });
      record(`${role} delete has actor-attributed ASSESSMENT_DELETE audit`, Boolean(audit) === (response.status === 200));
    }

    for (const [label, assessment] of [
      ["OPEN with score", fixtures.openWithScore],
      ["COMPLETED without score", fixtures.completedNoScore],
      ["COMPLETED with score", fixtures.completedWithScore],
    ]) {
      const auditBefore = await prisma.auditLog.count({
        where: { action: "ASSESSMENT_DELETE", entity: "Assessment", entityId: assessment.id },
      });
      const response = await api(`/api/assessments/${assessment.id}`, admin, "DELETE");
      record(`${label} is rejected with 409`, response.status === 409);
      const remains = await prisma.assessment.findUnique({ where: { id: assessment.id }, select: { id: true } });
      record(`${label} Assessment remains after rejection`, Boolean(remains));
      const auditAfter = await prisma.auditLog.count({
        where: { action: "ASSESSMENT_DELETE", entity: "Assessment", entityId: assessment.id },
      });
      record(`${label} rejection creates no success delete audit`, auditAfter === auditBefore);
    }

    const blockedScoreCount = await prisma.assessmentScore.count({ where: { assessmentId: fixtures.openWithScore.id } });
    record("Blocked Assessment retains its score", blockedScoreCount === 1);
    const preservedScoresBefore = await prisma.assessmentScore.count();
    const safeDelete = await api(`/api/assessments/${fixtures.openNoScore.id}`, admin, "DELETE");
    const preservedScoresAfter = await prisma.assessmentScore.count();
    record("OPEN Assessment with zero scores returns 200", safeDelete.status === 200);
    if (safeDelete.status === 200) successfulDeleteIds.push(fixtures.openNoScore.id);
    record("Successful Assessment is absent from GET detail", (await api(`/api/assessments/${fixtures.openNoScore.id}`, admin)).status === 404);
    record("Successful delete does not delete any AssessmentScore", preservedScoresAfter === preservedScoresBefore);
    const successAudit = await prisma.auditLog.findFirst({
      where: { action: "ASSESSMENT_DELETE", entity: "Assessment", entityId: fixtures.openNoScore.id, userId: users.ADMIN.id },
      select: { id: true },
    });
    record("Successful delete writes exactly one actor audit", (await prisma.auditLog.count({
      where: { action: "ASSESSMENT_DELETE", entity: "Assessment", entityId: fixtures.openNoScore.id },
    })) === 1 && Boolean(successAudit));

    const raceAssessment = fixtures.concurrency;
    const racingScore = prisma.assessmentScore.create({
      data: { assessmentId: raceAssessment.id, studentId: fixtures.secondStudent.id, score: 55 },
    }).then((createdScore) => {
      created.scores.push(createdScore.id);
      return { result: "created" };
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return { result: "blocked" };
      }
      throw error;
    });
    const [raceDeleteResponse, raceScoreResult] = await Promise.all([
      api(`/api/assessments/${raceAssessment.id}`, admin, "DELETE"),
      racingScore,
    ]);
    const raceStillExists = await prisma.assessment.findUnique({ where: { id: raceAssessment.id }, select: { id: true } });
    const raceScoreCount = await prisma.assessmentScore.count({ where: { assessmentId: raceAssessment.id } });
    const raceSafe = (raceDeleteResponse.status === 200 && raceScoreResult.result === "blocked" && !raceStillExists && raceScoreCount === 0)
      || (raceDeleteResponse.status === 409 && raceScoreResult.result === "created" && Boolean(raceStillExists) && raceScoreCount === 1);
    record("Concurrent score creation cannot create orphan or bypass dependency policy", raceSafe, `DELETE HTTP ${raceDeleteResponse.status}; score ${raceScoreResult.result}`);
    if (raceDeleteResponse.status === 200) successfulDeleteIds.push(raceAssessment.id);

    const manualAfter = await assertManualRowsExist();
    record("Required manual GHS records remain unchanged", JSON.stringify(manualAfter) === JSON.stringify(manualBaseline));
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw new Error(`Fixture cleanup failed; inspect only STEP 94 recorded fixture IDs. ${String(cleanupError)}`);

  const finalCounts = await getCounts();
  for (const model of Object.keys(baseline)) {
    const expected = baseline[model];
    if (model === "auditLog") {
      const auditCount = await prisma.auditLog.count({
        where: {
          action: "ASSESSMENT_DELETE",
          entity: "Assessment",
          entityId: { in: successfulDeleteIds },
        },
      });
      record("Successful delete AuditLogs are retained", auditCount === successfulDeleteIds.length);
      continue;
    }
    record(`Database baseline preserved for ${model}`, finalCounts[model] === expected, `${baseline[model]} → ${finalCounts[model]} (expected ${expected})`);
  }
  const fixtureAssessments = await prisma.assessment.count({ where: { name: { contains: suffix } } });
  const fixtureScores = await prisma.assessmentScore.count({
    where: { student: { nim: { in: [`94${suffix.slice(0, 8)}`, `95${suffix.slice(0, 8)}`] } } },
  });
  const fixtureStudents = await prisma.student.count({
    where: { nim: { in: [`94${suffix.slice(0, 8)}`, `95${suffix.slice(0, 8)}`] } },
  });
  record("No STEP 94 fixture Assessments, scores, or Students remain", fixtureAssessments === 0 && fixtureScores === 0 && fixtureStudents === 0);
}

run()
  .catch((error) => {
    console.error("STEP 94 test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
