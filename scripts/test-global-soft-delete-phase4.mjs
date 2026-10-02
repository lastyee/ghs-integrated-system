import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

nextEnv.loadEnvConfig(process.cwd());

const databaseName = "ghs_soft_delete_phase4_test_full";
const baseUrl = process.env.TEST_BASE_URL;
assertSafeMutationTarget({
  mutationFlag: "TEST_GLOBAL_SOFT_DELETE_PHASE4_ALLOW_MUTATIONS",
  expectedDatabase: databaseName,
  baseUrl,
  confirmationFlag: "TEST_GLOBAL_SOFT_DELETE_PHASE4_CONFIRM_DATABASE",
});
if (process.env.TEST_APP_DATABASE_CONFIRM !== databaseName) {
  throw new Error(`Set TEST_APP_DATABASE_CONFIRM=${databaseName} after verifying the isolated application database.`);
}

const prisma = new PrismaClient();
const password = "Phase4-Disposable-Password-2026!";
let fixtureTag = `PHASE4-${Date.now()}`;
const results = [];

function check(name, condition, details = "") {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) {
    throw new Error(`FAIL ${name}${details ? `: ${details}` : ""}`);
  }
  console.log(`PASS ${name}`);
}

function assertResponse(name, response, expectedStatus) {
  check(`${name}: HTTP ${expectedStatus}`, response.status === expectedStatus, `received ${response.status}`);
}

function containsId(value, id) {
  if (Array.isArray(value)) return value.some((item) => containsId(item, id));
  if (!value || typeof value !== "object") return false;
  if (value.id === id) return true;
  return Object.values(value).some((item) => containsId(item, id));
}

function mergeCookies(existing, response) {
  const cookieMap = new Map();
  for (const part of existing.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookieMap.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const cookieHeaders = response.headers.getSetCookie?.() ?? [];
  for (const header of cookieHeaders) {
    const pair = header.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) cookieMap.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return [...cookieMap].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(path, { cookie = "", method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

async function login(email, { expectedSuccess = true } = {}) {
  const csrfResponse = await request("/api/auth/csrf");
  assertResponse(`CSRF token for ${email}`, csrfResponse, 200);
  let cookie = mergeCookies("", csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(new URL("/api/auth/callback/credentials", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
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
  cookie = mergeCookies(cookie, response);
  const location = response.headers.get("location") ?? "";
  const succeeded = [302, 303].includes(response.status) && cookie.includes("authjs.session-token");
  const accepted = expectedSuccess
    ? succeeded
    : [302, 303].includes(response.status) && location.includes("CredentialsSignin");
  check(`${expectedSuccess ? "Login" : "Rejected login"} ${email}`, accepted, `HTTP ${response.status}, redirect ${location}`);
  return { cookie, location, status: response.status };
}

const permissionNames = [
  "user:delete",
  "student:read", "student:delete",
  "program:read", "program:delete",
  "subject:read", "subject:delete",
  "batch:read", "batch:delete",
  "enrollment:read", "enrollment:delete",
  "class:read", "class:delete",
  "schedule:read", "schedule:delete",
  "attendance:read", "attendance:delete",
  "assessment:read", "assessment:delete", "assessment-score:delete",
  "instructor:delete",
  "document:read", "document:delete",
  "employer:read", "employer:delete",
  "vacancy:read", "vacancy:delete",
  "application:read", "application:delete",
  "interview:read", "interview:delete",
  "placement:read", "placement:delete",
  "audit:read",
  "certificate:read", "certificate:revoke",
];

const roles = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACADEMIC_STAFF",
  "INSTRUCTOR",
  "PLACEMENT_STAFF",
  "MANAGEMENT",
  "STUDENT",
];

async function ensureFreshDatabase() {
  const expectedCounts = {
    user: 8, student: 1, instructor: 1, program: 1, subject: 1, batch: 1,
    enrollment: 1, class: 1, schedule: 1, attendance: 1, assessment: 1,
    assessmentScore: 1, document: 1, employer: 1, vacancy: 1, application: 1,
    interview: 1, placement: 1, certificate: 1, auditLog: 0, role: 7,
  };
  const modelNames = Object.keys(expectedCounts);
  const counts = {};
  for (const model of modelNames) counts[model] = await prisma[model].count();
  if (Object.values(counts).every((count) => count === 0)) {
    for (const model of modelNames) {
      check(`Disposable database starts empty: ${model}`, true);
    }
    return false;
  }

  const existingProgram = await prisma.program.findFirst({
    where: { code: { startsWith: "PHASE4-" } },
    select: { code: true },
  });
  const exactFixtureOnly = existingProgram &&
    Object.entries(expectedCounts).every(([model, count]) => counts[model] === count) &&
    await prisma.rolePermission.count() > 0;
  if (exactFixtureOnly) {
    fixtureTag = existingProgram.code.replace(/-PROGRAM$/, "");
    check("Resuming exact isolated Phase 4 fixture without successful delete logs", await prisma.auditLog.count() === 0);
    return true;
  }

  throw new Error("Disposable database is neither empty nor an exact resumable Phase 4 fixture; refusing mutation.");
}

async function loadFixtures() {
  const findUser = (label) => prisma.user.findFirst({
    where: { name: `${fixtureTag} ${label}` },
  });
  const [superAdmin, admin, studentUser, instructorUser, academicStaff, instructorAccount, placementStaff, management] =
    await Promise.all([
      findUser("SUPERADMIN"),
      findUser("ADMIN"),
      findUser("STUDENT"),
      findUser("INSTRUCTORLINK"),
      findUser("ACADEMIC"),
      findUser("INSTRUCTOR"),
      findUser("PLACEMENT"),
      findUser("MANAGEMENT"),
    ]);
  const [program, subject, instructor, student, employer] = await Promise.all([
    prisma.program.findUnique({ where: { code: `${fixtureTag}-PROGRAM` } }),
    prisma.subject.findUnique({ where: { code: `${fixtureTag}-SUBJECT` } }),
    prisma.instructor.findFirst({ where: { name: `${fixtureTag} Instructor` } }),
    prisma.student.findFirst({ where: { name: `${fixtureTag} Student` } }),
    prisma.employer.findFirst({ where: { name: `${fixtureTag} Employer` } }),
  ]);
  if ([superAdmin, admin, studentUser, instructorUser, academicStaff, instructorAccount, placementStaff, management, program, subject, instructor, student, employer].some((row) => !row)) {
    throw new Error("Exact Phase 4 fixture is incomplete; refusing to continue.");
  }
  const [
    batch, enrollment, classRecord, schedule, attendance, assessment,
    document, vacancy, application, interview, placement, certificate,
  ] = await Promise.all([
    prisma.batch.findFirst({ where: { name: `${fixtureTag} Batch` } }),
    prisma.enrollment.findFirst({ where: { studentId: student.id } }),
    prisma.class.findFirst({ where: { name: `${fixtureTag} Class` } }),
    prisma.schedule.findFirst({ where: { class: { name: `${fixtureTag} Class` } } }),
    prisma.attendance.findFirst({ where: { studentId: student.id } }),
    prisma.assessment.findFirst({ where: { name: `${fixtureTag} Assessment` } }),
    prisma.document.findFirst({ where: { fileName: `${fixtureTag}.pdf` } }),
    prisma.vacancy.findFirst({ where: { employerId: employer.id, title: `${fixtureTag} Vacancy` } }),
    prisma.application.findFirst({ where: { studentId: student.id } }),
    prisma.interview.findFirst({ where: { application: { studentId: student.id } } }),
    prisma.placement.findFirst({ where: { studentId: student.id } }),
    prisma.certificate.findUnique({ where: { certificateNumber: `${fixtureTag}-CERT` } }),
  ]);
  if ([batch, enrollment, classRecord, schedule, attendance, assessment, document, vacancy, application, interview, placement, certificate].some((row) => !row)) {
    throw new Error("Exact Phase 4 fixture relations are incomplete; refusing to continue.");
  }
  const score = await prisma.assessmentScore.findFirst({ where: { assessmentId: assessment.id } });
  if (!score) throw new Error("Exact Phase 4 score fixture is missing; refusing to continue.");

  return {
    users: { superAdmin, admin, studentUser, instructorUser, academicStaff, instructorAccount, placementStaff, management },
    records: {
      student, program, subject, batch, enrollment, classRecord, schedule,
      attendance, assessment, score, instructor, document, employer, vacancy,
      application, interview, placement, certificate,
    },
  };
}

async function createFixtures() {
  const roleRows = await Promise.all(
    roles.map((name) => prisma.role.create({ data: { name, description: `Phase 4 fixture ${name}` } })),
  );
  const roleByName = new Map(roleRows.map((role) => [role.name, role]));
  await prisma.permission.createMany({
    data: permissionNames.map((name) => ({
      name,
      action: name.split(":")[1],
      subject: name.split(":")[0],
    })),
    skipDuplicates: true,
  });
  const permissionRows = await prisma.permission.findMany({
    where: { name: { in: permissionNames } },
    select: { id: true, name: true },
  });
  const permissionByName = new Map(permissionRows.map((permission) => [permission.name, permission]));
  const grants = [];
  for (const role of ["SUPER_ADMIN", "ADMIN"]) {
    for (const permission of permissionRows) {
      grants.push({
        roleId: roleByName.get(role).id,
        permissionId: permission.id,
      });
    }
  }
  for (const permissionName of [
    "student:read", "document:read", "application:read", "placement:read",
    "attendance:read", "assessment:read", "certificate:read",
  ]) {
    grants.push({
      roleId: roleByName.get("STUDENT").id,
      permissionId: permissionByName.get(permissionName).id,
    });
  }
  await prisma.rolePermission.createMany({ data: grants });

  const passwordHash = await bcrypt.hash(password, 10);
  const createUser = (label, roleName) => prisma.user.create({
    data: {
      email: `${label.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@phase4.test`,
      passwordHash,
      name: `${fixtureTag} ${label}`,
      roleId: roleByName.get(roleName).id,
    },
  });
  const [superAdmin, admin, studentUser, instructorUser, academicStaff, instructorAccount, placementStaff, management] =
    await Promise.all([
      createUser("SUPERADMIN", "SUPER_ADMIN"),
      createUser("ADMIN", "ADMIN"),
      createUser("STUDENT", "STUDENT"),
      createUser("INSTRUCTORLINK", "INSTRUCTOR"),
      createUser("ACADEMIC", "ACADEMIC_STAFF"),
      createUser("INSTRUCTOR", "INSTRUCTOR"),
      createUser("PLACEMENT", "PLACEMENT_STAFF"),
      createUser("MANAGEMENT", "MANAGEMENT"),
    ]);

  const program = await prisma.program.create({
    data: { code: `${fixtureTag}-PROGRAM`, name: `${fixtureTag} Program` },
  });
  const subject = await prisma.subject.create({
    data: { code: `${fixtureTag}-SUBJECT`, name: `${fixtureTag} Subject` },
  });
  await prisma.programSubject.create({
    data: { programId: program.id, subjectId: subject.id },
  });
  const instructor = await prisma.instructor.create({
    data: { name: `${fixtureTag} Instructor`, userId: instructorUser.id },
  });
  const student = await prisma.student.create({
    data: {
      nim: `${Date.now()}`,
      name: `${fixtureTag} Student`,
      userId: studentUser.id,
    },
  });
  const batch = await prisma.batch.create({
    data: {
      name: `${fixtureTag} Batch`,
      programId: program.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, batchId: batch.id },
  });
  const classRecord = await prisma.class.create({
    data: {
      name: `${fixtureTag} Class`,
      batchId: batch.id,
      instructorId: instructor.id,
    },
  });
  const schedule = await prisma.schedule.create({
    data: {
      classId: classRecord.id,
      subjectId: subject.id,
      instructorId: instructor.id,
      date: new Date("2026-03-01T00:00:00.000Z"),
      startTime: new Date("2026-03-01T01:00:00.000Z"),
      endTime: new Date("2026-03-01T02:00:00.000Z"),
    },
  });
  const attendance = await prisma.attendance.create({
    data: { scheduleId: schedule.id, studentId: student.id, status: "PRESENT" },
  });
  const assessment = await prisma.assessment.create({
    data: {
      classId: classRecord.id,
      subjectId: subject.id,
      name: `${fixtureTag} Assessment`,
      type: "ASSIGNMENT",
      maxScore: 100,
    },
  });
  const score = await prisma.assessmentScore.create({
    data: { assessmentId: assessment.id, studentId: student.id, score: 90 },
  });
  const document = await prisma.document.create({
    data: {
      studentId: student.id,
      type: "TEST",
      storagePath: `students/${student.id}/${fixtureTag}.pdf`,
      fileName: `${fixtureTag}.pdf`,
      fileSize: 1,
      fileType: "application/pdf",
    },
  });
  const employer = await prisma.employer.create({
    data: { name: `${fixtureTag} Employer` },
  });
  const vacancy = await prisma.vacancy.create({
    data: {
      employerId: employer.id,
      title: `${fixtureTag} Vacancy`,
      description: "Disposable test fixture",
      requirements: "None",
    },
  });
  const application = await prisma.application.create({
    data: { vacancyId: vacancy.id, studentId: student.id },
  });
  const interview = await prisma.interview.create({
    data: {
      applicationId: application.id,
      scheduledAt: new Date("2026-04-01T00:00:00.000Z"),
    },
  });
  const placement = await prisma.placement.create({
    data: {
      applicationId: application.id,
      studentId: student.id,
      employerId: employer.id,
      vacancyId: vacancy.id,
      position: `${fixtureTag} Position`,
    },
  });
  const certificate = await prisma.certificate.create({
    data: {
      studentId: student.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: `${fixtureTag}-CERT`,
      issuedAt: new Date("2026-05-01T00:00:00.000Z"),
      path: `certificates/${fixtureTag}.pdf`,
    },
  });

  return {
    users: { superAdmin, admin, studentUser, instructorUser, academicStaff, instructorAccount, placementStaff, management },
    records: {
      student, program, subject, batch, enrollment, classRecord, schedule,
      attendance, assessment, score, instructor, document, employer, vacancy,
      application, interview, placement, certificate,
    },
  };
}

function apiMatrix(records, users) {
  return [
    { model: "student", entity: "Student", id: records.student.id, list: "/api/students", detail: `/api/students/${records.student.id}`, delete: `/api/students/${records.student.id}` },
    { model: "program", entity: "Program", id: records.program.id, list: "/api/programs", detail: `/api/programs/${records.program.id}`, delete: `/api/programs/${records.program.id}` },
    { model: "subject", entity: "Subject", id: records.subject.id, list: "/api/subjects", detail: `/api/subjects/${records.subject.id}`, delete: `/api/subjects/${records.subject.id}` },
    { model: "batch", entity: "Batch", id: records.batch.id, list: "/api/batches", detail: `/api/batches/${records.batch.id}`, delete: `/api/batches/${records.batch.id}` },
    { model: "enrollment", entity: "Enrollment", id: records.enrollment.id, list: "/api/enrollments", detail: `/api/enrollments/${records.enrollment.id}`, delete: `/api/enrollments/${records.enrollment.id}` },
    { model: "class", entity: "Class", id: records.classRecord.id, list: "/api/classes", detail: `/api/classes/${records.classRecord.id}`, delete: `/api/classes/${records.classRecord.id}` },
    { model: "schedule", entity: "Schedule", id: records.schedule.id, list: "/api/schedules", detail: `/api/schedules/${records.schedule.id}`, delete: `/api/schedules/${records.schedule.id}` },
    { model: "attendance", entity: "Attendance", id: records.attendance.id, list: "/api/attendances", detail: `/api/attendances/${records.attendance.id}`, delete: `/api/attendances/${records.attendance.id}` },
    { model: "assessment", entity: "Assessment", id: records.assessment.id, list: "/api/assessments", detail: `/api/assessments/${records.assessment.id}`, delete: `/api/assessments/${records.assessment.id}` },
    { model: "assessmentScore", entity: "AssessmentScore", id: records.score.id, list: `/api/assessments/${records.assessment.id}/scores`, detail: `/api/assessments/${records.assessment.id}/scores/${records.score.id}`, delete: `/api/assessments/${records.assessment.id}/scores/${records.score.id}` },
    { model: "instructor", entity: "Instructor", id: records.instructor.id, list: "/api/instructors", detail: null, delete: `/api/instructors/${records.instructor.id}` },
    { model: "document", entity: "Document", id: records.document.id, list: "/api/documents", detail: `/api/documents/${records.document.id}`, delete: `/api/documents/${records.document.id}` },
    { model: "employer", entity: "Employer", id: records.employer.id, list: "/api/employers", detail: `/api/employers/${records.employer.id}`, delete: `/api/employers/${records.employer.id}` },
    { model: "vacancy", entity: "Vacancy", id: records.vacancy.id, list: "/api/vacancies", detail: `/api/vacancies/${records.vacancy.id}`, delete: `/api/vacancies/${records.vacancy.id}` },
    { model: "application", entity: "Application", id: records.application.id, list: "/api/applications", detail: `/api/applications/${records.application.id}`, delete: `/api/applications/${records.application.id}` },
    { model: "interview", entity: "Interview", id: records.interview.id, list: "/api/interviews", detail: `/api/interviews/${records.interview.id}`, delete: `/api/interviews/${records.interview.id}` },
    { model: "placement", entity: "Placement", id: records.placement.id, list: "/api/placements", detail: `/api/placements/${records.placement.id}`, delete: `/api/placements/${records.placement.id}` },
    { model: "user", entity: "User", id: users.studentUser.id, list: "/api/users", detail: null, delete: `/api/users/${users.studentUser.id}` },
  ];
}

async function body(response) {
  return response.json().catch(() => null);
}

async function run() {
  const resume = await ensureFreshDatabase();
  const { users, records } = resume ? await loadFixtures() : await createFixtures();
  const adminSession = await login(users.admin.email);
  const superAdminSession = await login(users.superAdmin.email);
  const studentSession = await login(users.studentUser.email);
  const academicSession = await login(users.academicStaff.email);
  const instructorSession = await login(users.instructorAccount.email);
  const placementSession = await login(users.placementStaff.email);
  const managementSession = await login(users.management.email);

  const matrix = apiMatrix(records, users);
  const ordered = [
    "user", "attendance", "assessmentScore", "interview", "placement",
    "document", "enrollment", "schedule", "assessment", "application",
    "class", "vacancy", "instructor", "student", "batch", "subject",
    "employer", "program",
  ].map((model) => matrix.find((entry) => entry.model === model));

  for (const entry of matrix) {
    const response = await request(entry.delete, { method: "DELETE" });
    assertResponse(`Anonymous DELETE ${entry.entity}`, response, 401);
  }

  const deniedAttempts = [
    [academicSession, `/api/programs/${records.program.id}`, "ACADEMIC_STAFF"],
    [instructorSession, `/api/schedules/${records.schedule.id}`, "INSTRUCTOR"],
    [placementSession, `/api/employers/${records.employer.id}`, "PLACEMENT_STAFF"],
    [managementSession, `/api/batches/${records.batch.id}`, "MANAGEMENT"],
    [studentSession, `/api/students/${records.student.id}`, "STUDENT"],
  ];
  for (const [session, path, role] of deniedAttempts) {
    const response = await request(path, { method: "DELETE", cookie: session.cookie });
    assertResponse(`${role} unauthorized DELETE`, response, 403);
  }

  const missingId = "cm00000000000000000000000";
  for (const entry of matrix) {
    const missingPath = entry.model === "assessmentScore"
      ? entry.delete.replace(records.score.id, missingId)
      : entry.delete.replace(entry.id, missingId);
    const response = await request(missingPath, { method: "DELETE", cookie: adminSession.cookie });
    assertResponse(`Authorized DELETE nonexistent ${entry.entity}`, response, 404);
  }

  const certificateList = await request("/api/certificates", { cookie: adminSession.cookie });
  assertResponse("Certificate active list before parent deletion", certificateList, 200);
  check("Certificate remains active before parent deletion", containsId(await body(certificateList), records.certificate.id));
  const certificateDetail = await request(`/api/certificates/${records.certificate.id}`, { cookie: adminSession.cookie });
  assertResponse("Certificate detail before parent deletion", certificateDetail, 200);
  const certificateDelete = await request(`/api/certificates/${records.certificate.id}`, { method: "DELETE", cookie: adminSession.cookie });
  assertResponse("Certificate lifecycle-only DELETE returns 405", certificateDelete, 405);
  const revokeResponse = await request(`/api/certificates/${records.certificate.id}`, {
    method: "PATCH",
    cookie: adminSession.cookie,
    body: { reason: "Phase 4 disposable lifecycle verification" },
  });
  assertResponse("Certificate ACTIVE to REVOKED lifecycle transition", revokeResponse, 200);
  check("Certificate business status retained as REVOKED", (await prisma.certificate.findUnique({ where: { id: records.certificate.id } }))?.status === "REVOKED");
  check("Certificate REVOKE AuditLog created", Boolean(await prisma.auditLog.findFirst({
    where: { action: "REVOKE", entity: "Certificate", entityId: records.certificate.id },
  })));

  const deletedUserLoginSession = studentSession.cookie;
  const userEntry = matrix.find((entry) => entry.model === "user");
  const userBefore = await request(userEntry.list, { cookie: adminSession.cookie });
  assertResponse("User active list before delete", userBefore, 200);
  check("User target appears in active list", containsId(await body(userBefore), userEntry.id));
  const userDeleteResponse = await request(userEntry.delete, { method: "DELETE", cookie: superAdminSession.cookie });
  assertResponse("User authorized DELETE", userDeleteResponse, 200);
  const deletedUser = await prisma.user.findUnique({ where: { id: userEntry.id }, include: { student: true } });
  check("Deleted User row retained with timestamp", Boolean(deletedUser?.deletedAt));
  check("Linked Student remains active and linked", deletedUser?.student?.deletedAt === null && deletedUser.student.userId === deletedUser.id);
  const staleSessionResponse = await request("/api/profile", { cookie: deletedUserLoginSession });
  assertResponse("Deleted User existing session authorization", staleSessionResponse, 401);
  await login(users.studentUser.email, { expectedSuccess: false });
  const userAudit = await prisma.auditLog.findFirst({ where: { entity: "User", entityId: userEntry.id, action: "DELETE" } });
  check("User DELETE AuditLog created", Boolean(userAudit));
  const userDeleteAgain = await request(userEntry.delete, { method: "DELETE", cookie: adminSession.cookie });
  assertResponse("User second DELETE is safe", userDeleteAgain, 404);
  check("User still retained after repeated DELETE", Boolean(await prisma.user.findUnique({ where: { id: userEntry.id } })));
  const instructorUserBefore = await request(userEntry.list, { cookie: adminSession.cookie });
  assertResponse("Instructor-linked User appears before delete", instructorUserBefore, 200);
  check("Instructor-linked User appears in active list", containsId(await body(instructorUserBefore), users.instructorUser.id));
  const instructorUserDelete = await request(`/api/users/${users.instructorUser.id}`, {
    method: "DELETE",
    cookie: adminSession.cookie,
  });
  assertResponse("Instructor-linked User authorized DELETE", instructorUserDelete, 200);
  const deletedInstructorUser = await prisma.user.findUnique({
    where: { id: users.instructorUser.id },
    include: { instructor: true },
  });
  check("Instructor-linked User retains Instructor relation", Boolean(
    deletedInstructorUser?.deletedAt &&
    deletedInstructorUser.instructor?.deletedAt === null &&
    deletedInstructorUser.instructor.userId === deletedInstructorUser.id,
  ));

  for (const [index, entry] of ordered.slice(1).entries()) {
    const session = index % 2 === 0 ? adminSession : superAdminSession;
    const listBefore = await request(entry.list, { cookie: adminSession.cookie });
    assertResponse(`${entry.entity} active list before delete`, listBefore, 200);
    check(`${entry.entity} appears in active list`, containsId(await body(listBefore), entry.id));

    if (entry.detail) {
      const detailBefore = await request(entry.detail, { cookie: adminSession.cookie });
      assertResponse(`${entry.entity} active detail before delete`, detailBefore, 200);
      check(`${entry.entity} detail returns fixture`, containsId(await body(detailBefore), entry.id));
    }

    const beforeAuditCount = await prisma.auditLog.count();
    const deleteResponse = await request(entry.delete, { method: "DELETE", cookie: session.cookie });
    assertResponse(`${entry.entity} authorized DELETE`, deleteResponse, 200);
    const row = await prisma[entry.model].findUnique({ where: { id: entry.id } });
    check(`${entry.entity} database row retained`, Boolean(row));
    check(`${entry.entity} deletedAt set`, row?.deletedAt instanceof Date);
    check(`${entry.entity} AuditLog appended`, await prisma.auditLog.count() === beforeAuditCount + 1);
    check(`${entry.entity} AuditLog identifies record`, Boolean(await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: entry.entity, entityId: entry.id },
    })));

    const listAfter = await request(entry.list, { cookie: adminSession.cookie });
    assertResponse(`${entry.entity} active list after delete`, listAfter, 200);
    check(`${entry.entity} absent from active list`, !containsId(await body(listAfter), entry.id));
    if (entry.detail) {
      const detailAfter = await request(entry.detail, { cookie: adminSession.cookie });
      assertResponse(`${entry.entity} active detail after delete`, detailAfter, 404);
    }

    const secondDelete = await request(entry.delete, { method: "DELETE", cookie: adminSession.cookie });
    assertResponse(`${entry.entity} second DELETE is safe`, secondDelete, 404);
    check(`${entry.entity} remains after second DELETE`, Boolean(await prisma[entry.model].findUnique({ where: { id: entry.id } })));
  }

  const relationChecks = [
    ["Program to Batch", await prisma.batch.findUnique({ where: { id: records.batch.id } }), "programId", records.program.id],
    ["Program to Certificate", await prisma.certificate.findUnique({ where: { id: records.certificate.id } }), "programId", records.program.id],
    ["Subject to Schedule", await prisma.schedule.findUnique({ where: { id: records.schedule.id } }), "subjectId", records.subject.id],
    ["Subject to Assessment", await prisma.assessment.findUnique({ where: { id: records.assessment.id } }), "subjectId", records.subject.id],
    ["Batch to Enrollment", await prisma.enrollment.findUnique({ where: { id: records.enrollment.id } }), "batchId", records.batch.id],
    ["Batch to Class", await prisma.class.findUnique({ where: { id: records.classRecord.id } }), "batchId", records.batch.id],
    ["Batch to Certificate", await prisma.certificate.findUnique({ where: { id: records.certificate.id } }), "batchId", records.batch.id],
    ["Class to Schedule", await prisma.schedule.findUnique({ where: { id: records.schedule.id } }), "classId", records.classRecord.id],
    ["Class to Assessment", await prisma.assessment.findUnique({ where: { id: records.assessment.id } }), "classId", records.classRecord.id],
    ["Schedule to Attendance", await prisma.attendance.findUnique({ where: { id: records.attendance.id } }), "scheduleId", records.schedule.id],
    ["Assessment to AssessmentScore", await prisma.assessmentScore.findUnique({ where: { id: records.score.id } }), "assessmentId", records.assessment.id],
    ["Employer to Vacancy", await prisma.vacancy.findUnique({ where: { id: records.vacancy.id } }), "employerId", records.employer.id],
    ["Employer to Placement", await prisma.placement.findUnique({ where: { id: records.placement.id } }), "employerId", records.employer.id],
    ["Vacancy to Application", await prisma.application.findUnique({ where: { id: records.application.id } }), "vacancyId", records.vacancy.id],
    ["Vacancy to Placement", await prisma.placement.findUnique({ where: { id: records.placement.id } }), "vacancyId", records.vacancy.id],
    ["Application to Interview", await prisma.interview.findUnique({ where: { id: records.interview.id } }), "applicationId", records.application.id],
    ["Application to Placement", await prisma.placement.findUnique({ where: { id: records.placement.id } }), "applicationId", records.application.id],
    ["Student to Enrollment", await prisma.enrollment.findUnique({ where: { id: records.enrollment.id } }), "studentId", records.student.id],
    ["Student to Attendance", await prisma.attendance.findUnique({ where: { id: records.attendance.id } }), "studentId", records.student.id],
    ["Student to AssessmentScore", await prisma.assessmentScore.findUnique({ where: { id: records.score.id } }), "studentId", records.student.id],
    ["Student to Application", await prisma.application.findUnique({ where: { id: records.application.id } }), "studentId", records.student.id],
    ["Student to Placement", await prisma.placement.findUnique({ where: { id: records.placement.id } }), "studentId", records.student.id],
    ["Student to Document", await prisma.document.findUnique({ where: { id: records.document.id } }), "studentId", records.student.id],
    ["Student to Certificate", await prisma.certificate.findUnique({ where: { id: records.certificate.id } }), "studentId", records.student.id],
    ["Instructor to Class", await prisma.class.findUnique({ where: { id: records.classRecord.id } }), "instructorId", records.instructor.id],
    ["Instructor to Schedule", await prisma.schedule.findUnique({ where: { id: records.schedule.id } }), "instructorId", records.instructor.id],
  ];
  for (const [name, row, relationField, expectedId] of relationChecks) {
    check(`${name} relation preserved`, Boolean(row && row[relationField] === expectedId));
  }
  const student = await prisma.student.findUnique({ where: { id: records.student.id } });
  check("Student relation to deleted User preserved", student?.userId === users.studentUser.id);
  const instructor = await prisma.instructor.findUnique({ where: { id: records.instructor.id } });
  check("Instructor relation to User preserved", instructor?.userId === users.instructorUser.id);
  const junction = await prisma.programSubject.findUnique({
    where: { programId_subjectId: { programId: records.program.id, subjectId: records.subject.id } },
  });
  check("ProgramSubject junction retained", Boolean(junction));

  const certificateAfterArchive = await request("/api/certificates", { cookie: adminSession.cookie });
  assertResponse("Certificates list after related entities archived", certificateAfterArchive, 200);
  check("Certificate hidden from active list when linked Student/Program/Batch are deleted", !containsId(await body(certificateAfterArchive), records.certificate.id));
  const certificateDetailAfterArchive = await request(`/api/certificates/${records.certificate.id}`, { cookie: adminSession.cookie });
  assertResponse("Certificate detail hidden after related entities archived", certificateDetailAfterArchive, 404);
  const certificateDownloadAfterArchive = await request(`/api/certificates/${records.certificate.id}/download`, { cookie: adminSession.cookie });
  assertResponse("Certificate download hidden after related entities archived", certificateDownloadAfterArchive, 404);

  for (const path of ["/api/reports/academic", "/api/reports/attendance", "/api/reports/placement"]) {
    const response = await request(path, { cookie: adminSession.cookie });
    assertResponse(`${path} remains read-only and available`, response, 200);
    check(`${path} excludes archived fixture names`, !(await response.clone().text()).includes(fixtureTag));
  }
  const managementDashboard = await request("/dashboard/management", { cookie: superAdminSession.cookie });
  assertResponse("Management dashboard remains read-only and available", managementDashboard, 200);
  const managementDashboardHtml = await managementDashboard.text();
  check("Management dashboard excludes archived operational record names", ![
    `${fixtureTag} Student`,
    `${fixtureTag} Program`,
    `${fixtureTag} Batch`,
    `${fixtureTag} Instructor`,
    `${fixtureTag} Employer`,
    `${fixtureTag} Vacancy`,
  ].some((name) => managementDashboardHtml.includes(name)));

  const fkOrphans = await prisma.$queryRaw`
    SELECT count(*)::int AS count
    FROM students s LEFT JOIN users u ON u.id=s."userId"
    WHERE s."userId" IS NOT NULL AND u.id IS NULL
    UNION ALL SELECT count(*)::int FROM instructors i LEFT JOIN users u ON u.id=i."userId"
    WHERE i."userId" IS NOT NULL AND u.id IS NULL
    UNION ALL SELECT count(*)::int FROM batches b LEFT JOIN programs p ON p.id=b."programId" WHERE p.id IS NULL
    UNION ALL SELECT count(*)::int FROM enrollments e LEFT JOIN students s ON s.id=e."studentId" WHERE s.id IS NULL
    UNION ALL SELECT count(*)::int FROM enrollments e LEFT JOIN batches b ON b.id=e."batchId" WHERE b.id IS NULL
    UNION ALL SELECT count(*)::int FROM classes c LEFT JOIN batches b ON b.id=c."batchId" WHERE b.id IS NULL
    UNION ALL SELECT count(*)::int FROM schedules s LEFT JOIN classes c ON c.id=s."classId" WHERE c.id IS NULL
    UNION ALL SELECT count(*)::int FROM attendances a LEFT JOIN schedules s ON s.id=a."scheduleId" WHERE s.id IS NULL
    UNION ALL SELECT count(*)::int FROM assessment_scores s LEFT JOIN assessments a ON a.id=s."assessmentId" WHERE a.id IS NULL
    UNION ALL SELECT count(*)::int FROM certificates c LEFT JOIN programs p ON p.id=c."programId" WHERE p.id IS NULL
    UNION ALL SELECT count(*)::int FROM applications a LEFT JOIN vacancies v ON v.id=a."vacancyId" WHERE v.id IS NULL
    UNION ALL SELECT count(*)::int FROM interviews i LEFT JOIN applications a ON a.id=i."applicationId" WHERE a.id IS NULL
    UNION ALL SELECT count(*)::int FROM placements p LEFT JOIN applications a ON a.id=p."applicationId" WHERE p."applicationId" IS NOT NULL AND a.id IS NULL`;
  check("No orphaned test-fixture relations", fkOrphans.reduce((sum, row) => sum + row.count, 0) === 0);

  console.log(`\nPhase 4 API/database assertions passed: ${results.length}.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
