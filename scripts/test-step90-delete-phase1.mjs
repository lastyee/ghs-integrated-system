import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "");
const testPassword = `Step90-${randomUUID()}!`;
const results = [];
const created = {
  users: [],
  employers: [],
  vacancies: [],
  students: [],
  placements: [],
  applications: [],
  interviews: [],
  programs: [],
  batches: [],
  certificates: [],
  subjects: [],
  programSubjects: [],
  instructors: [],
  classes: [],
  schedules: [],
  assessments: [],
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
    mutationFlag: "STEP90_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated",
    confirmationFlag: "STEP90_TEST_CONFIRM_DATABASE",
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: testPassword,
      callbackUrl: `${baseUrl}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  assert([302, 303].includes(response.status), `Login failed for fixture ${email} (HTTP ${response.status}).`);
  return cookies;
}

async function api(path, cookies, method = "DELETE") {
  return fetch(`${baseUrl}${path}`, {
    method,
    ...(cookies ? { headers: { Cookie: cookies } } : {}),
  });
}

function track(table, row) {
  created[table].push(row.id);
  return row;
}

async function createEmployer(name) {
  return track("employers", await prisma.employer.create({ data: { name: `${name}-${suffix}` } }));
}

async function createVacancy(employerId, title) {
  return track("vacancies", await prisma.vacancy.create({
    data: {
      employerId,
      title: `${title}-${suffix}`,
      description: "STEP 90 isolated fixture",
      requirements: "STEP 90 isolated fixture",
    },
  }));
}

async function getCounts() {
  const models = [
    "user", "instructor", "program", "batch", "student", "enrollment",
    "subject", "class", "schedule", "employer", "vacancy", "application",
    "interview", "placement", "document", "certificate", "auditLog",
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
  const vacancy = employer?.vacancies.find((item) => item.title === "KITCHEN");
  const document = await prisma.document.findFirst({ where: { type: "KTP" }, select: { id: true } });
  assert(batch && student && employer && vacancy && employer.placements.length > 0 && document, "Required manual GHI-09 / bounty records are not present; test stopped before mutations.");
  return {
    batchId: batch.id,
    studentId: student.id,
    employerId: employer.id,
    vacancyId: vacancy.id,
    documentId: document.id,
    placementIds: employer.placements.map((item) => item.id).sort(),
  };
}

async function createFixtureUser(roleName) {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  assert(role, `Required role ${roleName} does not exist.`);
  const user = await prisma.user.create({
    data: {
      email: `step90-${roleName.toLowerCase()}-${suffix}@ghs.test`,
      name: `STEP 90 ${roleName}`,
      passwordHash: await bcrypt.hash(testPassword, 10),
      roleId: role.id,
    },
    select: { id: true, email: true },
  });
  created.users.push(user.id);
  return user;
}

async function ensureDeletePermissions() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, name: true },
  });
  assert(roles.length === 2, "SUPER_ADMIN and ADMIN roles are required for the endpoint tests.");

  for (const name of ["employer:delete", "vacancy:delete", "program:delete", "subject:delete"]) {
    const [subject, action] = name.split(":");
    const description = name === "employer:delete"
      ? "Delete an employer only when it has no vacancies or placements."
      : name === "vacancy:delete"
        ? "Delete a vacancy only when it has no applications or placements."
        : undefined;
    let permission = await prisma.permission.findUnique({
      where: { name },
      select: { id: true, action: true, subject: true, description: true },
    });
    if (!permission) {
      permission = await prisma.permission.create({
        data: { name, action, subject, ...(description ? { description } : {}) },
        select: { id: true },
      });
    } else if (
      permission.action !== action ||
      permission.subject !== subject ||
      (description && permission.description !== description)
    ) {
      permission = await prisma.permission.update({
        where: { name },
        data: { action, subject, ...(description ? { description } : {}) },
        select: { id: true },
      });
    }

    for (const role of roles) {
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        select: { roleId: true },
      });
      if (!existing) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }
    }

  }

  const assignments = await prisma.rolePermission.findMany({
    where: { permission: { name: { in: ["employer:delete", "vacancy:delete", "program:delete", "subject:delete"] } } },
    select: { role: { select: { name: true } }, permission: { select: { name: true } } },
  });
  for (const name of ["employer:delete", "vacancy:delete", "program:delete", "subject:delete"]) {
    const assignedRoles = assignments.filter((assignment) => assignment.permission.name === name).map((assignment) => assignment.role.name).sort();
    assert(JSON.stringify(assignedRoles) === JSON.stringify(["ADMIN", "SUPER_ADMIN"]), `${name} must be assigned only to ADMIN and SUPER_ADMIN.`);
  }
}

async function createCoreFixtures() {
  const student = track("students", await prisma.student.create({
    data: { nim: `90${suffix.slice(0, 8)}`, name: `STEP 90 Student ${suffix}` },
  }));
  const instructor = track("instructors", await prisma.instructor.create({ data: { name: `STEP 90 Instructor ${suffix}` } }));
  const employerWithPlacement = await createEmployer("STEP90-employer-placement");
  const employerWithVacancy = await createEmployer("STEP90-employer-vacancy");
  const employerClean = await createEmployer("STEP90-employer-clean");
  const employerForVacancies = await createEmployer("STEP90-vacancy-employer");

  const vacancyWithApplication = await createVacancy(employerForVacancies.id, "STEP90-application");
  const application = track("applications", await prisma.application.create({
    data: { vacancyId: vacancyWithApplication.id, studentId: student.id },
  }));
  track("interviews", await prisma.interview.create({
    data: { applicationId: application.id, scheduledAt: new Date("2030-01-01T09:00:00Z") },
  }));
  const vacancyWithPlacement = await createVacancy(employerForVacancies.id, "STEP90-placement");
  track("placements", await prisma.placement.create({
    data: {
      studentId: student.id,
      employerId: employerForVacancies.id,
      vacancyId: vacancyWithPlacement.id,
      position: "STEP 90 fixture",
    },
  }));
  const vacancyClean = await createVacancy(employerForVacancies.id, "STEP90-clean");

  const placement = track("placements", await prisma.placement.create({
    data: { studentId: student.id, employerId: employerWithPlacement.id, position: "STEP 90 fixture" },
  }));
  const employerWithVacancyChild = await createVacancy(employerWithVacancy.id, "STEP90-employer-child");

  const programWithBatch = track("programs", await prisma.program.create({
    data: { code: `90B${suffix.slice(0, 8)}`, name: `STEP 90 Program Batch ${suffix}` },
  }));
  const batch = track("batches", await prisma.batch.create({
    data: { name: `STEP90-BATCH-${suffix}`, programId: programWithBatch.id, startDate: new Date("2030-01-01T00:00:00Z") },
  }));
  const programWithCertificate = track("programs", await prisma.program.create({
    data: { code: `90C${suffix.slice(0, 8)}`, name: `STEP 90 Program Certificate ${suffix}` },
  }));
  track("certificates", await prisma.certificate.create({
    data: {
      studentId: student.id,
      programId: programWithCertificate.id,
      batchId: batch.id,
      certificateNumber: `STEP90-${suffix}`,
      issuedAt: new Date("2030-02-01T00:00:00Z"),
    },
  }));
  const programForSubjectLink = track("programs", await prisma.program.create({
    data: { code: `90P${suffix.slice(0, 8)}`, name: `STEP 90 Program Link ${suffix}` },
  }));
  const programClean = track("programs", await prisma.program.create({
    data: { code: `90E${suffix.slice(0, 8)}`, name: `STEP 90 Program Empty ${suffix}` },
  }));

  const subjectWithProgram = track("subjects", await prisma.subject.create({
    data: { code: `90P${suffix.slice(0, 8)}`, name: `STEP 90 Subject Program ${suffix}` },
  }));
  const subjectWithSchedule = track("subjects", await prisma.subject.create({
    data: { code: `90S${suffix.slice(0, 8)}`, name: `STEP 90 Subject Schedule ${suffix}` },
  }));
  const subjectWithAssessment = track("subjects", await prisma.subject.create({
    data: { code: `90A${suffix.slice(0, 8)}`, name: `STEP 90 Subject Assessment ${suffix}` },
  }));
  const subjectClean = track("subjects", await prisma.subject.create({
    data: { code: `90E${suffix.slice(0, 8)}`, name: `STEP 90 Subject Empty ${suffix}` },
  }));
  const programSubjectLink = await prisma.programSubject.create({
    data: { programId: programForSubjectLink.id, subjectId: subjectWithProgram.id },
  });
  created.programSubjects.push({ programId: programSubjectLink.programId, subjectId: programSubjectLink.subjectId });
  const fixtureClass = track("classes", await prisma.class.create({
    data: { name: `STEP90-Class-${suffix}`, batchId: batch.id, instructorId: instructor.id },
  }));
  const scheduleDate = new Date("2030-02-01T00:00:00Z");
  track("schedules", await prisma.schedule.create({
    data: {
      classId: fixtureClass.id,
      subjectId: subjectWithSchedule.id,
      instructorId: instructor.id,
      date: scheduleDate,
      startTime: new Date("2030-02-01T09:00:00Z"),
      endTime: new Date("2030-02-01T10:00:00Z"),
    },
  }));
  track("assessments", await prisma.assessment.create({
    data: {
      classId: fixtureClass.id,
      subjectId: subjectWithAssessment.id,
      name: `STEP90-Assessment-${suffix}`,
      type: "ASSIGNMENT",
      maxScore: 100,
    },
  }));
  const programSubjectClean = track("programs", await prisma.program.create({
    data: { code: `90L${suffix.slice(0, 8)}`, name: `STEP 90 Program Subject Clean ${suffix}` },
  }));
  return {
    student,
    employerWithPlacement,
    employerWithVacancy,
    employerClean,
    employerForVacancies,
    vacancyWithApplication,
    vacancyWithPlacement,
    vacancyClean,
    application,
    placement,
    employerWithVacancyChild,
    programWithBatch,
    batch,
    programWithCertificate,
    programForSubjectLink,
    programClean,
    programSubjectClean,
    subjectWithProgram,
    subjectWithSchedule,
    subjectWithAssessment,
    subjectClean,
    programForCleanSubjectLink: programSubjectClean,
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
  await attempt("interview fixtures", () => deleteByIds("interview", created.interviews));
  await attempt("placement fixtures", () => deleteByIds("placement", created.placements));
  await attempt("application fixtures", () => deleteByIds("application", created.applications));
  await attempt("certificate fixtures", () => deleteByIds("certificate", created.certificates));
  await attempt("schedule fixtures", () => deleteByIds("schedule", created.schedules));
  await attempt("assessment fixtures", () => deleteByIds("assessment", created.assessments));
  await attempt("class fixtures", () => deleteByIds("class", created.classes));
  await attempt("program-subject fixtures", async () => {
    if (created.programSubjects.length) {
      await prisma.programSubject.deleteMany({ where: { OR: created.programSubjects } });
    }
  });
  await attempt("vacancy fixtures", () => deleteByIds("vacancy", created.vacancies));
  await attempt("batch fixtures", () => deleteByIds("batch", created.batches));
  await attempt("employer fixtures", () => deleteByIds("employer", created.employers));
  await attempt("instructor fixtures", () => deleteByIds("instructor", created.instructors));
  await attempt("student fixtures", () => deleteByIds("student", created.students));
  await attempt("subject fixtures", () => deleteByIds("subject", created.subjects));
  await attempt("program fixtures", () => deleteByIds("program", created.programs));
  await attempt("temporary test users", () => deleteByIds("user", created.users));

  if (errors.length) throw new Error(errors.join("\n"));
}

async function run() {
  assertSafeTarget();
  const manualRows = await assertManualRowsExist();
  const baseline = await getCounts();
  const successfulDeleteIds = [];
  let cleanupError;

  try {
    await ensureDeletePermissions();
    const roleNames = ["SUPER_ADMIN", "ADMIN", "STUDENT", "INSTRUCTOR", "MANAGEMENT", "ACADEMIC_STAFF"];
    const fixtureUsers = await Promise.all(roleNames.map(createFixtureUser));
    const sessions = {};
    for (let index = 0; index < fixtureUsers.length; index++) {
      sessions[roleNames[index]] = await login(fixtureUsers[index].email);
    }
    const admin = sessions.ADMIN;
    const adminUserId = fixtureUsers[roleNames.indexOf("ADMIN")].id;
    const superAdmin = sessions.SUPER_ADMIN;
    const fixtures = await createCoreFixtures();

    const unauthorizedEmployer = await api(`/api/employers/${fixtures.employerClean.id}`);
    record("Employer unauthenticated request is rejected", unauthorizedEmployer.status === 401 || unauthorizedEmployer.status === 403, `HTTP ${unauthorizedEmployer.status}`);
    record("Employer nonexistent ID returns 404", (await api(`/api/employers/step90-missing-${suffix}`, admin)).status === 404);

    const employerVacancyConflict = await api(`/api/employers/${fixtures.employerWithVacancy.id}`, admin);
    const employerVacancyPayload = await employerVacancyConflict.json();
    record("Employer with Vacancy returns 409", employerVacancyConflict.status === 409 && employerVacancyPayload.dependencies?.vacancies === 1);
    const employerPlacementConflict = await api(`/api/employers/${fixtures.employerWithPlacement.id}`, admin);
    record("Employer with Placement returns 409", employerPlacementConflict.status === 409);
    const employerChildrenPreserved = await prisma.employer.findUnique({
      where: { id: fixtures.employerWithVacancy.id },
      select: { vacancies: { select: { id: true } } },
    });
    const employerPlacementPreserved = await prisma.placement.findUnique({
      where: { id: fixtures.placement.id },
      select: { id: true },
    });
    record("Rejected Employer deletes preserve Vacancy and Placement", Boolean(employerChildrenPreserved?.vacancies.length && employerPlacementPreserved));
    const employerDelete = await api(`/api/employers/${fixtures.employerClean.id}`, admin);
    record("Dependency-free Employer deletes successfully", employerDelete.status === 200);
    if (employerDelete.status === 200) successfulDeleteIds.push(fixtures.employerClean.id);
    record("Deleted Employer detail returns 404", (await api(`/api/employers/${fixtures.employerClean.id}`, admin, "GET")).status === 404);
    const employerList = await api("/api/employers", admin, "GET");
    const employerListRows = await employerList.json();
    record("Deleted Employer is absent from GET list", employerList.ok && !employerListRows.some((item) => item.id === fixtures.employerClean.id));
    const employerDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Employer", entityId: fixtures.employerClean.id, userId: adminUserId },
      select: { id: true },
    });
    record("Successful Employer deletion writes actor audit log", Boolean(employerDeleteAudit));
    const superAdminEmployer = await createEmployer("STEP90-super-admin");
    const superAdminDelete = await api(`/api/employers/${superAdminEmployer.id}`, superAdmin);
    record("SUPER_ADMIN can delete a dependency-free Employer", superAdminDelete.status === 200);
    if (superAdminDelete.status === 200) successfulDeleteIds.push(superAdminEmployer.id);
    const superAdminDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Employer", entityId: superAdminEmployer.id, userId: fixtureUsers[roleNames.indexOf("SUPER_ADMIN")].id },
      select: { id: true },
    });
    record("SUPER_ADMIN deletion records the authenticated actor", Boolean(superAdminDeleteAudit));

    const unauthorizedVacancy = await api(`/api/vacancies/${fixtures.vacancyClean.id}`);
    record("Vacancy unauthenticated request is rejected", unauthorizedVacancy.status === 401 || unauthorizedVacancy.status === 403, `HTTP ${unauthorizedVacancy.status}`);
    record("Vacancy nonexistent ID returns 404", (await api(`/api/vacancies/step90-missing-${suffix}`, admin)).status === 404);
    const unauthorizedProgram = await api(`/api/programs/${fixtures.programClean.id}`);
    record("Program unauthenticated request is rejected", unauthorizedProgram.status === 401 || unauthorizedProgram.status === 403, `HTTP ${unauthorizedProgram.status}`);
    const unauthorizedSubject = await api(`/api/subjects/${fixtures.subjectClean.id}`);
    record("Subject unauthenticated request is rejected", unauthorizedSubject.status === 401 || unauthorizedSubject.status === 403, `HTTP ${unauthorizedSubject.status}`);
    const vacancyApplicationConflict = await api(`/api/vacancies/${fixtures.vacancyWithApplication.id}`, admin);
    record("Vacancy with Application returns 409", vacancyApplicationConflict.status === 409);
    const vacancyPlacementConflict = await api(`/api/vacancies/${fixtures.vacancyWithPlacement.id}`, admin);
    record("Vacancy with Placement returns 409", vacancyPlacementConflict.status === 409);
    const vacancyDelete = await api(`/api/vacancies/${fixtures.vacancyClean.id}`, admin);
    record("Dependency-free Vacancy deletes successfully", vacancyDelete.status === 200);
    if (vacancyDelete.status === 200) successfulDeleteIds.push(fixtures.vacancyClean.id);
    record("Deleted Vacancy detail returns 404", (await api(`/api/vacancies/${fixtures.vacancyClean.id}`, admin, "GET")).status === 404);
    const vacancyList = await api("/api/vacancies", admin, "GET");
    const vacancyListRows = await vacancyList.json();
    record("Deleted Vacancy is absent from GET list", vacancyList.ok && !vacancyListRows.some((item) => item.id === fixtures.vacancyClean.id));
    const preservedApplication = await prisma.application.findUnique({ where: { id: fixtures.application.id }, select: { id: true } });
    const preservedInterview = await prisma.interview.findFirst({ where: { applicationId: fixtures.application.id }, select: { id: true } });
    const preservedPlacement = await prisma.placement.findUnique({ where: { id: fixtures.placement.id }, select: { id: true } });
    record("Rejected Vacancy delete preserves Application, Interview, and Placement", Boolean(preservedApplication && preservedInterview && preservedPlacement));
    const vacancyDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Vacancy", entityId: fixtures.vacancyClean.id, userId: adminUserId },
      select: { id: true },
    });
    record("Successful Vacancy deletion writes actor audit log", Boolean(vacancyDeleteAudit));

    record("Program with Batch returns 409", (await api(`/api/programs/${fixtures.programWithBatch.id}`, admin)).status === 409);
    const programCertificateDelete = await api(`/api/programs/${fixtures.programWithCertificate.id}`, admin);
    const programCertificatePayload = await programCertificateDelete.json();
    record("Program with Certificate returns 409", programCertificateDelete.status === 409 && programCertificatePayload.dependencies?.certificates === 1);
    const batchPreserved = await prisma.batch.findUnique({ where: { id: fixtures.batch.id }, select: { id: true } });
    const certificatePreserved = await prisma.certificate.findFirst({
      where: { programId: fixtures.programWithCertificate.id },
      select: { id: true },
    });
    record("Rejected Program deletes preserve Batch and Certificate", Boolean(batchPreserved && certificatePreserved));
    const programDelete = await api(`/api/programs/${fixtures.programClean.id}`, admin);
    record("Dependency-free Program deletes successfully", programDelete.status === 200);
    if (programDelete.status === 200) successfulDeleteIds.push(fixtures.programClean.id);
    record("Deleted Program detail returns 404", (await api(`/api/programs/${fixtures.programClean.id}`, admin, "GET")).status === 404);
    const programList = await api("/api/programs", admin, "GET");
    const programListRows = await programList.json();
    record("Deleted Program is absent from GET list", programList.ok && !programListRows.data.some((item) => item.id === fixtures.programClean.id));
    const programDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Program", entityId: fixtures.programClean.id, userId: adminUserId },
      select: { id: true },
    });
    record("Successful Program deletion writes actor audit log", Boolean(programDeleteAudit));
    record("Program with ProgramSubject link returns 409", (await api(`/api/programs/${fixtures.programForSubjectLink.id}`, admin)).status === 409);
    record("Nonexistent Program ID returns 404", (await api(`/api/programs/step90-missing-${suffix}`, admin)).status === 404);
    record("Rejected Program delete preserves ProgramSubject link", await prisma.programSubject.count({ where: { programId: fixtures.programForSubjectLink.id } }) === 1);

    record("Subject with ProgramSubject returns 409", (await api(`/api/subjects/${fixtures.subjectWithProgram.id}`, admin)).status === 409);
    record("Subject with Schedule returns 409", (await api(`/api/subjects/${fixtures.subjectWithSchedule.id}`, admin)).status === 409);
    record("Subject with Assessment returns 409", (await api(`/api/subjects/${fixtures.subjectWithAssessment.id}`, admin)).status === 409);
    record("Nonexistent Subject ID returns 404", (await api(`/api/subjects/step90-missing-${suffix}`, admin)).status === 404);
    const preservedSubjectDependencies = await Promise.all([
      prisma.programSubject.count({ where: { subjectId: fixtures.subjectWithProgram.id } }),
      prisma.schedule.count({ where: { subjectId: fixtures.subjectWithSchedule.id } }),
      prisma.assessment.count({ where: { subjectId: fixtures.subjectWithAssessment.id } }),
    ]);
    record("Rejected Subject deletes preserve all dependent records", preservedSubjectDependencies.every((count) => count === 1));
    const subjectDelete = await api(`/api/subjects/${fixtures.subjectClean.id}`, admin);
    record("Dependency-free Subject deletes successfully", subjectDelete.status === 200);
    if (subjectDelete.status === 200) successfulDeleteIds.push(fixtures.subjectClean.id);
    record("Deleted Subject detail returns 404", (await api(`/api/subjects/${fixtures.subjectClean.id}`, admin, "GET")).status === 404);
    const subjectList = await api("/api/subjects", admin, "GET");
    const subjectListRows = await subjectList.json();
    record("Deleted Subject is absent from GET list", subjectList.ok && !subjectListRows.data.some((item) => item.id === fixtures.subjectClean.id));
    const subjectDeleteAudit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Subject", entityId: fixtures.subjectClean.id, userId: adminUserId },
      select: { id: true },
    });
    record("Successful Subject deletion writes actor audit log", Boolean(subjectDeleteAudit));

    for (const [role, session] of Object.entries(sessions)) {
      if (role === "ADMIN" || role === "SUPER_ADMIN") continue;
      const denied = await Promise.all([
        api(`/api/employers/${fixtures.employerWithVacancy.id}`, session),
        api(`/api/vacancies/${fixtures.vacancyWithApplication.id}`, session),
        api(`/api/programs/${fixtures.programWithBatch.id}`, session),
        api(`/api/subjects/${fixtures.subjectWithProgram.id}`, session),
      ]);
      record(`${role} is denied direct DELETE API requests`, denied.every((response) => response.status === 403));
    }
    record("Student cannot bypass frontend with direct API DELETE", (await api(`/api/employers/${fixtures.employerWithVacancy.id}`, sessions.STUDENT)).status === 403);
    const manualEmployerAttempt = await api(`/api/employers/${manualRows.employerId}`, sessions.STUDENT);
    const manualEmployerStillExists = await prisma.employer.findUnique({ where: { id: manualRows.employerId }, select: { id: true } });
    record("Student cannot target another record through direct API (IDOR/RBAC)", manualEmployerAttempt.status === 403 && Boolean(manualEmployerStillExists));

    const concurrentEmployer = await createEmployer("STEP90-concurrent");
    const simultaneous = await Promise.all([
      api(`/api/employers/${concurrentEmployer.id}`, admin),
      api(`/api/employers/${concurrentEmployer.id}`, admin),
    ]);
    record("Concurrent duplicate delete has one success and no server error", simultaneous.filter((response) => response.status === 200).length === 1 && simultaneous.every((response) => [200, 404, 409].includes(response.status)));
    if (simultaneous.some((response) => response.status === 200)) successfulDeleteIds.push(concurrentEmployer.id);
    const concurrentAuditCount = await prisma.auditLog.count({
      where: { action: "DELETE", entity: "Employer", entityId: concurrentEmployer.id },
    });
    record("Concurrent duplicate delete writes exactly one audit event", concurrentAuditCount === 1);

    const raceEmployer = await createEmployer("STEP90-concurrent-vacancy");
    const childCreation = prisma.vacancy.create({
      data: {
        employerId: raceEmployer.id,
        title: `STEP90-racing-vacancy-${suffix}`,
        description: "STEP 90 isolated concurrency fixture",
        requirements: "STEP 90 isolated concurrency fixture",
      },
    }).then((vacancy) => {
      created.vacancies.push(vacancy.id);
      return { status: "created", id: vacancy.id };
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return { status: "blocked" };
      }
      throw error;
    });
    const [raceDeleteResponse, raceChildResult] = await Promise.all([
      api(`/api/employers/${raceEmployer.id}`, admin),
      childCreation,
    ]);
    const raceEmployerAfter = await prisma.employer.findUnique({
      where: { id: raceEmployer.id },
      select: { id: true, _count: { select: { vacancies: true } } },
    });
    const validDeleteRace =
      (raceDeleteResponse.status === 200 && raceChildResult.status === "blocked" && !raceEmployerAfter) ||
      (raceDeleteResponse.status === 409 && raceChildResult.status === "created" && raceEmployerAfter?._count.vacancies === 1);
    record("Concurrent Vacancy creation cannot race into an Employer orphan", validDeleteRace, `DELETE HTTP ${raceDeleteResponse.status}; child ${raceChildResult.status}`);
    if (raceDeleteResponse.status === 200) successfulDeleteIds.push(raceEmployer.id);

    const afterDeleteSnapshots = await assertManualRowsExist();
    record("Manual GHI-09, student, bounty, vacancy, placement, and document remain intact", JSON.stringify(afterDeleteSnapshots) === JSON.stringify(manualRows));

    console.log(`\nSTEP 90 tests passed: ${results.filter(({ passed }) => passed).length}/${results.length}`);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw new Error(`Fixture cleanup failed; inspect only STEP 90 tagged fixture IDs. ${String(cleanupError)}`);

  const finalCounts = await getCounts();
  for (const model of Object.keys(baseline)) {
    if (model === "auditLog") {
      const expectedDeleteAudits = successfulDeleteIds.length
        ? await prisma.auditLog.count({
            where: {
              action: "DELETE",
              entity: { in: ["Employer", "Vacancy", "Program", "Subject"] },
              entityId: { in: successfulDeleteIds },
            },
          })
        : 0;
      record(
        "Append-only DELETE audit events match successful fixture deletions",
        finalCounts.auditLog === baseline.auditLog + expectedDeleteAudits,
        `${baseline.auditLog} → ${finalCounts.auditLog} (${expectedDeleteAudits} new DELETE audit events)`,
      );
    } else {
      record(`Database baseline restored for ${model}`, finalCounts[model] === baseline[model], `${baseline[model]} → ${finalCounts[model]}`);
    }
  }
}

run()
  .catch((error) => {
    console.error("STEP 90 test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
