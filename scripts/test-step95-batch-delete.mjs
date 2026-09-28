import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "");
const password = `Step95-${randomUUID()}!`;
const created = {
  users: [],
  students: [],
  enrollments: [],
  classes: [],
  schedules: [],
  certificates: [],
  batches: [],
  instructors: [],
  subjects: [],
  programs: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, passed, details = "") {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
  if (!passed) throw new Error(`Test failed: ${name}`);
}

function assertSafeTarget() {
  assertSafeMutationTarget({
    mutationFlag: "STEP95_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated",
    confirmationFlag: "STEP95_TEST_CONFIRM_DATABASE",
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
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${baseUrl}/`, json: "true" }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  assert([302, 303].includes(response.status), `Login failed for test fixture ${email} (HTTP ${response.status}).`);
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

async function ensurePermissionAndUsers() {
  const permission = await prisma.permission.findUnique({
    where: { name: "batch:delete" },
    select: { id: true, action: true, subject: true },
  });
  assert(
    permission?.action === "delete" && permission.subject === "batch",
    "batch:delete must be synchronized from the permission source before testing.",
  );

  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "INSTRUCTOR", "PLACEMENT_STAFF", "MANAGEMENT", "STUDENT"] } },
    select: { id: true, name: true },
  });
  assert(roles.length === 7, "All required test roles must exist.");
  const allowed = new Set(["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"]);
  const assignments = await prisma.rolePermission.findMany({
    where: { permissionId: permission.id },
    select: { role: { select: { name: true } } },
  });
  const assignedRoles = assignments.map(({ role }) => role.name).sort();
  const expectedRoles = [...allowed].sort();
  assert(
    JSON.stringify(assignedRoles) === JSON.stringify(expectedRoles),
    "batch:delete role assignments must match the source policy before testing.",
  );

  return Object.fromEntries(await Promise.all(roles.map(async ({ id, name }) => {
    const user = await prisma.user.create({
      data: {
        email: `step95-${name.toLowerCase()}-${suffix}@ghs.test`,
        name: `STEP 95 ${name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: id,
      },
      select: { id: true, email: true },
    });
    created.users.push(user.id);
    return [name, user];
  })));
}

async function createAcademicFixtures() {
  const program = track("programs", await prisma.program.create({
    data: { code: `95${suffix.slice(0, 8)}`, name: `STEP 95 Program ${suffix}` },
  }));
  const student = track("students", await prisma.student.create({
    data: { nim: `95${suffix.slice(0, 9)}`, name: `STEP 95 Student ${suffix}` },
  }));
  const instructor = track("instructors", await prisma.instructor.create({
    data: { name: `STEP 95 Instructor ${suffix}` },
  }));
  const subject = track("subjects", await prisma.subject.create({
    data: { code: `95${suffix.slice(0, 8)}`, name: `STEP 95 Subject ${suffix}` },
  }));
  const batch = async (label) => track("batches", await prisma.batch.create({
    data: {
      name: `STEP95-${label}-${suffix}`,
      programId: program.id,
      startDate: new Date("2030-01-01T00:00:00.000Z"),
    },
  }));
  const addEnrollment = async (parentBatch) => {
    const enrollment = await prisma.enrollment.create({
      data: { studentId: student.id, batchId: parentBatch.id, notes: `STEP 95 ${suffix}` },
    });
    created.enrollments.push(enrollment.id);
    return enrollment;
  };
  const addClass = async (parentBatch, name = "CLASS") => {
    const classRecord = await prisma.class.create({
      data: {
        name: `STEP95-${name}-${suffix}`,
        batchId: parentBatch.id,
        instructorId: instructor.id,
      },
    });
    created.classes.push(classRecord.id);
    return classRecord;
  };

  return {
    program,
    student,
    instructor,
    subject,
    safeBatches: [await batch("SAFE-SA"), await batch("SAFE-ADMIN"), await batch("SAFE-ACADEMIC")],
    enrollmentBatch: await batch("ENROLLMENT"),
    classBatch: await batch("CLASS"),
    combinedBatch: await batch("COMBINED"),
    certificateBatch: await batch("CERTIFICATE"),
    raceBatch: await batch("RACE"),
    batch,
    addEnrollment,
    addClass,
  };
}

async function assertManualRows() {
  const batch = await prisma.batch.findFirst({ where: { name: "GHI-09" }, select: { id: true, name: true } });
  const student = await prisma.student.findUnique({ where: { nim: "269067460" }, select: { id: true, nim: true } });
  const employers = await prisma.employer.findMany({
    where: { name: { equals: "bounty", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      vacancies: { where: { title: "KITCHEN" }, select: { id: true, title: true } },
      placements: { select: { id: true } },
    },
  });
  const documents = await prisma.document.findMany({ where: { type: "KTP" }, select: { id: true, type: true } });
  assert(
    batch && student && employers.some((employer) => employer.vacancies.length > 0 && employer.placements.length > 0) && documents.length > 0,
    "Required manual GHS records are missing; test stopped before fixture creation.",
  );
  return JSON.stringify({
    batch,
    student,
    employers: employers.map(({ id, name, vacancies, placements }) => ({
      id,
      name,
      vacancies: vacancies.map(({ id: vacancyId, title }) => ({ id: vacancyId, title })),
      placements: placements.map(({ id }) => id).sort(),
    })),
    documents: documents.map(({ id, type }) => ({ id, type })),
  });
}

async function getCounts() {
  const models = ["batch", "enrollment", "class", "schedule", "certificate", "student", "instructor", "subject", "program"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
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

  await attempt("fixture schedules", () => deleteByIds("schedule", created.schedules));
  await attempt("fixture classes", () => deleteByIds("class", created.classes));
  await attempt("fixture enrollments", () => deleteByIds("enrollment", created.enrollments));
  await attempt("fixture certificates", () => deleteByIds("certificate", created.certificates));
  await attempt("fixture batches", () => deleteByIds("batch", created.batches));
  await attempt("fixture students", () => deleteByIds("student", created.students));
  await attempt("fixture instructors", () => deleteByIds("instructor", created.instructors));
  await attempt("fixture subjects", () => deleteByIds("subject", created.subjects));
  await attempt("fixture programs", () => deleteByIds("program", created.programs));
  await attempt("fixture users", () => deleteByIds("user", created.users));
  if (errors.length) throw new Error(errors.join("\n"));
}

async function run() {
  assertSafeTarget();
  const manualBaseline = await assertManualRows();
  const baseline = await getCounts();
  let cleanupError;

  try {
    const users = await ensurePermissionAndUsers();
    const sessions = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([role, user]) => [role, await login(user.email)])));
    const fixtures = await createAcademicFixtures();
    const admin = sessions.ADMIN;

    record("Unauthenticated DELETE returns 401", (await api(`/api/batches/${fixtures.safeBatches[0].id}`, undefined, "DELETE")).status === 401);
    for (const [role, label] of [["STUDENT", "STUDENT"], ["INSTRUCTOR", "INSTRUCTOR"], ["PLACEMENT_STAFF", "PLACEMENT"], ["MANAGEMENT", "MANAGEMENT"]]) {
      record(`${label} DELETE returns 403`, (await api(`/api/batches/${fixtures.safeBatches[0].id}`, sessions[role], "DELETE")).status === 403);
    }
    record("Nonexistent Batch returns 404", (await api(`/api/batches/step95-missing-${suffix}`, admin, "DELETE")).status === 404);

    const safeBatch = fixtures.safeBatches[0];
    record("Existing Batch GET remains available", (await api(`/api/batches/${safeBatch.id}`, admin)).ok);
    const batchPatch = await api(`/api/batches/${safeBatch.id}`, admin, "PATCH", { name: `${safeBatch.name}-PATCHED` });
    record("Existing Batch PATCH remains functional", batchPatch.ok);

    const enrollment = await fixtures.addEnrollment(fixtures.enrollmentBatch);
    record("Enrollment GET remains available", (await api(`/api/enrollments/${enrollment.id}`, admin)).ok);
    record("Enrollment PATCH remains functional", (await api(`/api/enrollments/${enrollment.id}`, admin, "PATCH", { notes: `STEP 95 PATCH ${suffix}` })).ok);

    const classRecord = await fixtures.addClass(fixtures.classBatch);
    record("Class GET remains available", (await api(`/api/classes/${classRecord.id}`, admin)).ok);
    record("Class PATCH remains functional", (await api(`/api/classes/${classRecord.id}`, admin, "PATCH", { name: `${classRecord.name}-PATCHED` })).ok);

    const classWithSchedule = await fixtures.addClass(fixtures.classBatch, "SCHEDULED-CLASS");
    const schedule = await prisma.schedule.create({
      data: {
        classId: classWithSchedule.id,
        subjectId: fixtures.subject.id,
        instructorId: fixtures.instructor.id,
        date: new Date("2030-01-02T00:00:00.000Z"),
        startTime: new Date("2030-01-02T09:00:00.000Z"),
        endTime: new Date("2030-01-02T10:00:00.000Z"),
      },
    });
    created.schedules.push(schedule.id);
    await fixtures.addEnrollment(fixtures.combinedBatch);
    await fixtures.addClass(fixtures.combinedBatch, "COMBINED-CLASS");
    const certificate = await prisma.certificate.create({
      data: {
        studentId: fixtures.student.id,
        programId: fixtures.program.id,
        batchId: fixtures.certificateBatch.id,
        certificateNumber: `STEP95-${suffix}`,
        issuedAt: new Date("2030-02-01T00:00:00.000Z"),
      },
    });
    created.certificates.push(certificate.id);

    for (const [role, index] of [["SUPER_ADMIN", 0], ["ADMIN", 1], ["ACADEMIC_STAFF", 2]]) {
      const batch = fixtures.safeBatches[index];
      const response = await api(`/api/batches/${batch.id}`, sessions[role], "DELETE");
      record(`${role} may delete an eligible Batch`, response.status === 200, `HTTP ${response.status}`);
      const deleted = await prisma.batch.findUnique({ where: { id: batch.id }, select: { id: true } });
      record(`${role} successful delete removes only the Batch`, response.status === 200 && !deleted);
      const auditCount = await prisma.auditLog.count({
        where: { action: "BATCH_DELETE", entity: "Batch", entityId: batch.id, userId: users[role].id },
      });
      record(`${role} delete writes actor-attributed BATCH_DELETE audit`, auditCount === (response.status === 200 ? 1 : 0));
    }

    const enrollmentDelete = await api(`/api/batches/${fixtures.enrollmentBatch.id}`, admin, "DELETE");
    record("Batch with Enrollment is rejected with 409", enrollmentDelete.status === 409);
    record("Batch with Enrollment remains", Boolean(await prisma.batch.findUnique({ where: { id: fixtures.enrollmentBatch.id }, select: { id: true } })));
    record("Blocked Enrollment remains", Boolean(await prisma.enrollment.findUnique({ where: { id: enrollment.id }, select: { id: true } })));
    record("Blocked Enrollment deletion writes no success audit", await prisma.auditLog.count({
      where: { action: "BATCH_DELETE", entity: "Batch", entityId: fixtures.enrollmentBatch.id },
    }) === 0);

    const classDelete = await api(`/api/batches/${fixtures.classBatch.id}`, admin, "DELETE");
    record("Batch with Class and Schedule is rejected with 409", classDelete.status === 409);
    record("Batch with Class remains", Boolean(await prisma.batch.findUnique({ where: { id: fixtures.classBatch.id }, select: { id: true } })));
    record("Blocked Classes and Schedule remain", Boolean(
      await prisma.class.findUnique({ where: { id: classRecord.id }, select: { id: true } }) &&
      await prisma.schedule.findUnique({ where: { id: schedule.id }, select: { id: true } }),
    ));
    record("Blocked Class deletion writes no success audit", await prisma.auditLog.count({
      where: { action: "BATCH_DELETE", entity: "Batch", entityId: fixtures.classBatch.id },
    }) === 0);

    const combinedDelete = await api(`/api/batches/${fixtures.combinedBatch.id}`, admin, "DELETE");
    record("Batch with Enrollment and Class is rejected with 409", combinedDelete.status === 409);
    record("Batch, Enrollment, and Class dependencies remain", Boolean(
      await prisma.batch.findUnique({ where: { id: fixtures.combinedBatch.id }, select: { id: true } }) &&
      await prisma.enrollment.findFirst({ where: { batchId: fixtures.combinedBatch.id }, select: { id: true } }) &&
      await prisma.class.findFirst({ where: { batchId: fixtures.combinedBatch.id }, select: { id: true } }),
    ));
    record("Blocked combined deletion writes no success audit", await prisma.auditLog.count({
      where: { action: "BATCH_DELETE", entity: "Batch", entityId: fixtures.combinedBatch.id },
    }) === 0);

    const certificateDelete = await api(`/api/batches/${fixtures.certificateBatch.id}`, admin, "DELETE");
    record("Batch with Certificate is rejected with 409", certificateDelete.status === 409);
    record("Batch and Certificate remain", Boolean(
      await prisma.batch.findUnique({ where: { id: fixtures.certificateBatch.id }, select: { id: true } }) &&
      await prisma.certificate.findUnique({ where: { id: certificate.id }, select: { id: true } }),
    ));
    record("Blocked Certificate deletion writes no success audit", await prisma.auditLog.count({
      where: { action: "BATCH_DELETE", entity: "Batch", entityId: fixtures.certificateBatch.id },
    }) === 0);

    const raceBatch = fixtures.raceBatch;
    const concurrentEnrollment = prisma.enrollment.create({
      data: { studentId: fixtures.student.id, batchId: raceBatch.id, notes: `STEP 95 RACE ${suffix}` },
    }).then((createdEnrollment) => {
      created.enrollments.push(createdEnrollment.id);
      return "created";
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) return "blocked";
      throw error;
    });
    const [raceDeleteResponse, raceEnrollmentResult] = await Promise.all([
      api(`/api/batches/${raceBatch.id}`, admin, "DELETE"),
      concurrentEnrollment,
    ]);
    const raceBatchExists = await prisma.batch.findUnique({ where: { id: raceBatch.id }, select: { id: true } });
    const raceEnrollmentCount = await prisma.enrollment.count({ where: { batchId: raceBatch.id } });
    const raceSafe =
      (raceDeleteResponse.status === 200 && raceEnrollmentResult === "blocked" && !raceBatchExists && raceEnrollmentCount === 0) ||
      (raceDeleteResponse.status === 409 && raceEnrollmentResult === "created" && Boolean(raceBatchExists) && raceEnrollmentCount === 1);
    record("Concurrent Enrollment creation cannot orphan or bypass the dependency policy", raceSafe, `DELETE HTTP ${raceDeleteResponse.status}; Enrollment ${raceEnrollmentResult}`);

    record("Required manual GHS records remain unchanged", (await assertManualRows()) === manualBaseline);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw new Error(`Fixture cleanup failed; inspect only STEP 95 recorded fixture IDs. ${String(cleanupError)}`);

  const finalCounts = await getCounts();
  for (const [model, count] of Object.entries(baseline)) {
    record(`Database baseline preserved for ${model}`, finalCounts[model] === count, `${count} → ${finalCounts[model]}`);
  }
  const fixtureCounts = {
    batches: await prisma.batch.count({ where: { name: { startsWith: "STEP95-" } } }),
    students: await prisma.student.count({ where: { nim: { startsWith: "95" }, name: { contains: "STEP 95" } } }),
    enrollments: await prisma.enrollment.count({ where: { notes: { contains: "STEP 95" } } }),
    classes: await prisma.class.count({ where: { name: { startsWith: "STEP95-" } } }),
    schedules: await prisma.schedule.count({ where: { class: { name: { startsWith: "STEP95-" } } } }),
    certificates: await prisma.certificate.count({ where: { certificateNumber: { startsWith: "STEP95-" } } }),
    users: await prisma.user.count({ where: { email: { startsWith: "step95-" } } }),
  };
  record("No STEP 95 test fixtures remain", Object.values(fixtureCounts).every((count) => count === 0), JSON.stringify(fixtureCounts));

  const orphans = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM enrollments e LEFT JOIN batches b ON b.id = e."batchId" WHERE b.id IS NULL) AS "enrollments",
      (SELECT COUNT(*)::int FROM classes c LEFT JOIN batches b ON b.id = c."batchId" WHERE b.id IS NULL) AS "classes",
      (SELECT COUNT(*)::int FROM schedules s LEFT JOIN classes c ON c.id = s."classId" WHERE c.id IS NULL) AS "schedules",
      (SELECT COUNT(*)::int FROM certificates c LEFT JOIN batches b ON b.id = c."batchId" WHERE b.id IS NULL) AS "certificates"
  `;
  record("No orphan Enrollment, Class, Schedule, or Certificate rows", Object.values(orphans[0]).every((count) => count === 0), JSON.stringify(orphans[0]));
}

run()
  .catch((error) => {
    console.error("STEP 95 test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
