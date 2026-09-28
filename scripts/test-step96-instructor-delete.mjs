import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "");
const password = `Step96-${randomUUID()}!`;
const created = {
  users: [],
  instructors: [],
  classes: [],
  schedules: [],
  programs: [],
  batches: [],
  students: [],
  subjects: [],
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
    mutationFlag: "STEP96_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated",
    confirmationFlag: "STEP96_TEST_CONFIRM_DATABASE",
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
    where: { name: "instructor:delete" },
    select: { id: true, action: true, subject: true },
  });
  assert(
    permission?.action === "delete" && permission.subject === "instructor",
    "instructor:delete must be synchronized from the permission source before testing.",
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
    "instructor:delete role assignments must match the source policy before testing.",
  );

  const users = Object.fromEntries(await Promise.all(roles.map(async ({ id, name }) => {
    const user = await prisma.user.create({
      data: {
        email: `step96-${name.toLowerCase()}-${suffix}@ghs.test`,
        name: `STEP 96 ${name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: id,
      },
      select: { id: true, email: true },
    });
    created.users.push(user.id);
    return [name, user];
  })));
  const linkedRole = roles.find(({ name }) => name === "STUDENT");
  const linkedUser = await prisma.user.create({
    data: {
      email: `step96-linked-${suffix}@ghs.test`,
      name: `STEP 96 Linked User ${suffix}`,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: linkedRole.id,
    },
    select: { id: true },
  });
  created.users.push(linkedUser.id);
  return { users, linkedUser };
}

async function assertManualRows() {
  const batch = await prisma.batch.findMany({ where: { name: "GHI-09" }, select: { id: true, name: true } });
  const student = await prisma.student.findUnique({ where: { nim: "269067460" }, select: { id: true, nim: true, name: true } });
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
    batch.length > 0 && student && employers.some((employer) => employer.vacancies.length > 0 && employer.placements.length > 0) && documents.length > 0,
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
    documents,
  });
}

async function getCounts() {
  const models = ["instructor", "user", "class", "schedule", "attendance", "assessment", "assessmentScore", "auditLog"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
}

async function createFixtures(linkedUser) {
  const program = track("programs", await prisma.program.create({
    data: { code: `96${suffix.slice(0, 8)}`, name: `STEP 96 Program ${suffix}` },
  }));
  const batch = track("batches", await prisma.batch.create({
    data: { name: `STEP96-BATCH-${suffix}`, programId: program.id, startDate: new Date("2030-01-01T00:00:00.000Z") },
  }));
  const student = track("students", await prisma.student.create({
    data: { nim: `96${suffix.slice(0, 9)}`, name: `STEP 96 Student ${suffix}` },
  }));
  const subject = track("subjects", await prisma.subject.create({
    data: { code: `96${suffix.slice(0, 8)}`, name: `STEP 96 Subject ${suffix}` },
  }));
  const newInstructor = async (name, userId = null) => track("instructors", await prisma.instructor.create({
    data: { name: `STEP 96 ${name} ${suffix}`, userId },
  }));
  const safeInstructors = [
    await newInstructor("SAFE SUPERADMIN"),
    await newInstructor("SAFE ADMIN"),
    await newInstructor("SAFE ACADEMIC"),
  ];
  const classInstructor = await newInstructor("CLASS BLOCKED");
  const scheduleInstructor = await newInstructor("SCHEDULE BLOCKED");
  const linkedInstructor = await newInstructor("USER BLOCKED", linkedUser.id);
  const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" }, select: { id: true } });
  const combinedUser = await prisma.user.create({
    data: {
      email: `step96-combined-${suffix}@ghs.test`,
      name: `STEP 96 Combined User ${suffix}`,
      passwordHash: "not-used-for-login",
      roleId: studentRole.id,
    },
    select: { id: true },
  });
  created.users.push(combinedUser.id);
  const combinedInstructor = await newInstructor("COMBINED BLOCKED", combinedUser.id);

  const classRecord = track("classes", await prisma.class.create({
    data: {
      name: `STEP96-CLASS-${suffix}`,
      batchId: batch.id,
      instructorId: classInstructor.id,
    },
  }));
  const helperInstructor = await newInstructor("SCHEDULE HELPER");
  const helperClass = track("classes", await prisma.class.create({
    data: {
      name: `STEP96-HELPER-CLASS-${suffix}`,
      batchId: batch.id,
      instructorId: helperInstructor.id,
    },
  }));
  const schedule = track("schedules", await prisma.schedule.create({
    data: {
      classId: helperClass.id,
      subjectId: subject.id,
      instructorId: scheduleInstructor.id,
      date: new Date("2030-01-02T00:00:00.000Z"),
      startTime: new Date("2030-01-02T09:00:00.000Z"),
      endTime: new Date("2030-01-02T10:00:00.000Z"),
    },
  }));
  const combinedClass = track("classes", await prisma.class.create({
    data: {
      name: `STEP96-COMBINED-CLASS-${suffix}`,
      batchId: batch.id,
      instructorId: combinedInstructor.id,
    },
  }));
  const combinedSchedule = track("schedules", await prisma.schedule.create({
    data: {
      classId: combinedClass.id,
      subjectId: subject.id,
      instructorId: combinedInstructor.id,
      date: new Date("2030-01-03T00:00:00.000Z"),
      startTime: new Date("2030-01-03T09:00:00.000Z"),
      endTime: new Date("2030-01-03T10:00:00.000Z"),
    },
  }));
  const raceInstructor = await newInstructor("RACE");

  return {
    program,
    batch,
    student,
    subject,
    safeInstructors,
    classInstructor,
    scheduleInstructor,
    linkedInstructor,
    combinedInstructor,
    classRecord,
    helperClass,
    schedule,
    combinedClass,
    combinedSchedule,
    raceInstructor,
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

  await attempt("fixture schedules", () => deleteByIds("schedule", created.schedules));
  await attempt("fixture classes", () => deleteByIds("class", created.classes));
  await attempt("fixture instructors", () => deleteByIds("instructor", created.instructors));
  await attempt("fixture students", () => deleteByIds("student", created.students));
  await attempt("fixture subjects", () => deleteByIds("subject", created.subjects));
  await attempt("fixture batches", () => deleteByIds("batch", created.batches));
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
    const { users, linkedUser } = await ensurePermissionAndUsers();
    const sessions = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([role, user]) => [role, await login(user.email)])));
    const fixtures = await createFixtures(linkedUser);
    const admin = sessions.ADMIN;

    record("Unauthenticated DELETE returns 401", (await api(`/api/instructors/${fixtures.safeInstructors[0].id}`, undefined, "DELETE")).status === 401);
    for (const [role, label] of [["STUDENT", "STUDENT"], ["INSTRUCTOR", "INSTRUCTOR"], ["PLACEMENT_STAFF", "PLACEMENT"], ["MANAGEMENT", "MANAGEMENT"]]) {
      record(`${label} DELETE returns 403`, (await api(`/api/instructors/${fixtures.safeInstructors[0].id}`, sessions[role], "DELETE")).status === 403);
    }
    record("Nonexistent Instructor returns 404", (await api(`/api/instructors/step96-missing-${suffix}`, admin, "DELETE")).status === 404);
    record("Existing Instructor GET list remains available", (await api("/api/instructors", admin)).ok);

    const classGet = await api(`/api/classes/${fixtures.classRecord.id}`, admin);
    record("Class GET remains available", classGet.ok);
    const classPatch = await api(`/api/classes/${fixtures.classRecord.id}`, admin, "PATCH", { name: `${fixtures.classRecord.name}-PATCHED` });
    record("Class PATCH remains functional", classPatch.ok);
    record("Schedule GET remains available", (await api(`/api/schedules/${fixtures.schedule.id}`, admin)).ok);
    record("Schedule PATCH remains unsupported and unchanged", (await api(`/api/schedules/${fixtures.schedule.id}`, admin, "PATCH", { topic: "STEP 96 regression" })).status === 405);

    for (const [role, index] of [["SUPER_ADMIN", 0], ["ADMIN", 1], ["ACADEMIC_STAFF", 2]]) {
      const instructor = fixtures.safeInstructors[index];
      const response = await api(`/api/instructors/${instructor.id}`, sessions[role], "DELETE");
      record(`${role} may delete a safe Instructor`, response.status === 200, `HTTP ${response.status}`);
      record(`${role} successful delete removes Instructor`, !await prisma.instructor.findUnique({ where: { id: instructor.id }, select: { id: true } }));
      record(`${role} delete has actor-attributed INSTRUCTOR_DELETE audit`, await prisma.auditLog.count({
        where: { action: "INSTRUCTOR_DELETE", entity: "Instructor", entityId: instructor.id, userId: users[role].id },
      }) === 1);
    }

    const classDelete = await api(`/api/instructors/${fixtures.classInstructor.id}`, admin, "DELETE");
    record("Instructor with Class returns 409", classDelete.status === 409);
    record("Class-blocked Instructor and Class remain", Boolean(
      await prisma.instructor.findUnique({ where: { id: fixtures.classInstructor.id }, select: { id: true } }) &&
      await prisma.class.findUnique({ where: { id: fixtures.classRecord.id }, select: { id: true } }),
    ));

    const scheduleDelete = await api(`/api/instructors/${fixtures.scheduleInstructor.id}`, admin, "DELETE");
    record("Instructor with Schedule returns 409", scheduleDelete.status === 409);
    record("Schedule-blocked Instructor and Schedule remain", Boolean(
      await prisma.instructor.findUnique({ where: { id: fixtures.scheduleInstructor.id }, select: { id: true } }) &&
      await prisma.schedule.findUnique({ where: { id: fixtures.schedule.id }, select: { id: true } }),
    ));

    const linkedDelete = await api(`/api/instructors/${fixtures.linkedInstructor.id}`, admin, "DELETE");
    const linkedStillExists = await prisma.instructor.findUnique({ where: { id: fixtures.linkedInstructor.id }, select: { id: true, userId: true } });
    record("Instructor with linked User returns 409", linkedDelete.status === 409);
    record("Linked Instructor remains with the same userId", linkedStillExists?.userId === linkedUser.id);
    record("Linked User remains unchanged", Boolean(await prisma.user.findUnique({ where: { id: linkedUser.id }, select: { id: true } })));

    const combinedDelete = await api(`/api/instructors/${fixtures.combinedInstructor.id}`, admin, "DELETE");
    const combinedStillExists = await prisma.instructor.findUnique({ where: { id: fixtures.combinedInstructor.id }, select: { id: true, userId: true } });
    record("Instructor with Class, Schedule, and User returns 409", combinedDelete.status === 409);
    record("Combined Instructor and all dependencies remain", Boolean(
      combinedStillExists?.userId &&
      await prisma.user.findUnique({ where: { id: combinedStillExists.userId }, select: { id: true } }) &&
      await prisma.class.findUnique({ where: { id: fixtures.combinedClass.id }, select: { id: true } }) &&
      await prisma.schedule.findUnique({ where: { id: fixtures.combinedSchedule.id }, select: { id: true } }),
    ));
    record("Blocked deletes produce no success audit", await prisma.auditLog.count({
      where: {
        action: "INSTRUCTOR_DELETE",
        entity: "Instructor",
        entityId: { in: [fixtures.classInstructor.id, fixtures.scheduleInstructor.id, fixtures.linkedInstructor.id, fixtures.combinedInstructor.id] },
      },
    }) === 0);

    const raceInstructor = fixtures.raceInstructor;
    const raceClass = prisma.class.create({
      data: {
        name: `STEP96-RACE-CLASS-${suffix}`,
        batchId: fixtures.batch.id,
        instructorId: raceInstructor.id,
      },
    }).then((row) => {
      created.classes.push(row.id);
      return "created";
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) return "blocked";
      throw error;
    });
    const [raceDeleteResponse, raceClassResult] = await Promise.all([
      api(`/api/instructors/${raceInstructor.id}`, admin, "DELETE"),
      raceClass,
    ]);
    const raceInstructorExists = await prisma.instructor.findUnique({ where: { id: raceInstructor.id }, select: { id: true } });
    const raceClassCount = await prisma.class.count({ where: { instructorId: raceInstructor.id } });
    const raceSafe =
      (raceDeleteResponse.status === 200 && raceClassResult === "blocked" && !raceInstructorExists && raceClassCount === 0) ||
      (raceDeleteResponse.status === 409 && raceClassResult === "created" && Boolean(raceInstructorExists) && raceClassCount === 1);
    record("Concurrent Class creation cannot orphan or bypass Instructor dependency policy", raceSafe, `DELETE HTTP ${raceDeleteResponse.status}; Class ${raceClassResult}`);

    record("Required manual GHS records remain unchanged", (await assertManualRows()) === manualBaseline);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw new Error(`Fixture cleanup failed; inspect only STEP 96 recorded fixture IDs. ${String(cleanupError)}`);

  const finalCounts = await getCounts();
  for (const [model, count] of Object.entries(baseline)) {
    if (model === "auditLog") {
      record("Delete audit records are retained", finalCounts.auditLog >= count + 3, `${count} → ${finalCounts.auditLog}`);
      continue;
    }
    record(`Database baseline preserved for ${model}`, finalCounts[model] === count, `${count} → ${finalCounts[model]}`);
  }
  const fixturesRemaining = {
    instructors: await prisma.instructor.count({ where: { name: { contains: "STEP 96" } } }),
    users: await prisma.user.count({ where: { email: { startsWith: "step96-" } } }),
    classes: await prisma.class.count({ where: { name: { startsWith: "STEP96-" } } }),
    schedules: await prisma.schedule.count({ where: { class: { name: { startsWith: "STEP96-" } } } }),
    batches: await prisma.batch.count({ where: { name: { startsWith: "STEP96-" } } }),
    students: await prisma.student.count({ where: { name: { contains: "STEP 96" } } }),
  };
  record("No STEP 96 fixtures remain", Object.values(fixturesRemaining).every((count) => count === 0), JSON.stringify(fixturesRemaining));

  const orphans = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM classes c LEFT JOIN instructors i ON i.id = c."instructorId" WHERE i.id IS NULL) AS "classes",
      (SELECT COUNT(*)::int FROM schedules s LEFT JOIN instructors i ON i.id = s."instructorId" LEFT JOIN classes c ON c.id = s."classId" WHERE i.id IS NULL OR c.id IS NULL) AS "schedules",
      (SELECT COUNT(*)::int FROM attendances a LEFT JOIN schedules s ON s.id = a."scheduleId" LEFT JOIN students st ON st.id = a."studentId" WHERE s.id IS NULL OR st.id IS NULL) AS "attendances",
      (SELECT COUNT(*)::int FROM assessment_scores a LEFT JOIN assessments s ON s.id = a."assessmentId" LEFT JOIN students st ON st.id = a."studentId" WHERE s.id IS NULL OR st.id IS NULL) AS "assessmentScores"
  `;
  record("No orphan Class, Schedule, Attendance, or AssessmentScore rows", Object.values(orphans[0]).every((count) => count === 0), JSON.stringify(orphans[0]));
}

run()
  .catch((error) => {
    console.error("STEP 96 test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
