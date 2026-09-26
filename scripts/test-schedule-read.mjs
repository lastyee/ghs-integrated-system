import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const runId = randomUUID().slice(0, 8);
const prefix = `STEP41-${runId}`;
const password = `step41-${randomUUID()}`;
const created = {
  scheduleIds: [],
  classId: null,
  batchId: null,
  programId: null,
  subjectId: null,
  userIds: [],
};
const results = [];

function record(name, expected, actual) {
  const pass = expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
}

function getCookies(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies.map((cookie) => cookie.split(";")[0]);
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

function mergeCookies(existing, response) {
  const values = new Map();
  for (const cookie of [...existing.split("; "), ...getCookies(response)]) {
    const separator = cookie.indexOf("=");
    if (separator > 0) values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...values.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email) {
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
    throw new Error(`Login failed: HTTP ${response.status}`);
  }
  return cookies;
}

async function api(path, cookies = "") {
  const response = await request(path, {
    headers: cookies ? { Cookie: cookies } : {},
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Status assertions remain valid for responses without JSON.
  }
  return { response, payload };
}

async function getCounts() {
  const [
    programs,
    subjects,
    batches,
    classes,
    schedules,
    enrollments,
    students,
    attendances,
    assessments,
    assessmentScores,
    auditLogs,
    users,
  ] = await Promise.all([
    prisma.program.count(),
    prisma.subject.count(),
    prisma.batch.count(),
    prisma.class.count(),
    prisma.schedule.count(),
    prisma.enrollment.count(),
    prisma.student.count(),
    prisma.attendance.count(),
    prisma.assessment.count(),
    prisma.assessmentScore.count(),
    prisma.auditLog.count(),
    prisma.user.count(),
  ]);
  return {
    programs,
    subjects,
    batches,
    classes,
    schedules,
    enrollments,
    students,
    attendances,
    assessments,
    assessmentScores,
    auditLogs,
    users,
  };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "STUDENT", "INSTRUCTOR"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 3) {
    throw new Error("Required roles are missing; run the development seed first.");
  }

  const users = {};
  for (const role of roles) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix.toLowerCase()}.${role.name.toLowerCase()}@ghs.test`,
        name: `${prefix} ${role.name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: role.id,
      },
      select: { id: true, email: true },
    });
    created.userIds.push(user.id);
    users[role.name] = user;
  }

  const program = await prisma.program.create({
    data: { code: `${prefix}-PROGRAM`, name: `${prefix} Program` },
    select: { id: true },
  });
  created.programId = program.id;

  const batch = await prisma.batch.create({
    data: {
      name: `${prefix} Batch`,
      programId: program.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    },
    select: { id: true },
  });
  created.batchId = batch.id;

  const classRecord = await prisma.class.create({
    data: {
      name: `${prefix} Class`,
      batchId: batch.id,
      instructorId: users.INSTRUCTOR.id,
    },
    select: { id: true },
  });
  created.classId = classRecord.id;

  const subject = await prisma.subject.create({
    data: { code: `${prefix}-SUBJECT`, name: `${prefix} Subject` },
    select: { id: true },
  });
  created.subjectId = subject.id;

  const schedules = await prisma.schedule.createManyAndReturn({
    data: [
      {
        classId: classRecord.id,
        subjectId: subject.id,
        instructorId: users.INSTRUCTOR.id,
        date: new Date("2026-09-24T00:00:00.000Z"),
        startTime: new Date("2026-09-24T08:00:00.000Z"),
        endTime: new Date("2026-09-24T10:00:00.000Z"),
      },
      {
        classId: classRecord.id,
        subjectId: subject.id,
        instructorId: users.INSTRUCTOR.id,
        date: new Date("2026-09-23T00:00:00.000Z"),
        startTime: new Date("2026-09-23T13:00:00.000Z"),
        endTime: new Date("2026-09-23T15:00:00.000Z"),
      },
    ],
    select: { id: true },
  });
  created.scheduleIds.push(...schedules.map((schedule) => schedule.id));

  return { users, schedules };
}

function assertExplicitFields(data, expected) {
  const expectedFields = [
    "id",
    "classId",
    "subjectId",
    "instructorId",
    "date",
    "startTime",
    "endTime",
    "status",
    "createdAt",
    "updatedAt",
  ].sort();
  record(
    "Explicit fields only",
    expectedFields.join(","),
    Object.keys(data).sort().join(","),
  );
  for (const forbidden of [
    "passwordHash",
    "email",
    "role",
    "credentials",
    "secret",
    "duration",
    "room",
    "participantCount",
    "progress",
  ]) {
    if (forbidden in data) throw new Error(`Forbidden field exposed: ${forbidden}`);
  }
  record("Correct classId", expected.classId, data.classId);
  record("Correct subjectId", expected.subjectId, data.subjectId);
  record("Correct instructorId", expected.instructorId, data.instructorId);
  record("Correct date", expected.date, data.date);
  record("Correct startTime", expected.startTime, data.startTime);
  record("Correct endTime", expected.endTime, data.endTime);
  record("Raw status", "SCHEDULED", data.status);
}

async function runTests({ users, schedules }, beforeCounts) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.STUDENT.email);
  const expected = {
    classId: created.classId,
    subjectId: created.subjectId,
    instructorId: users.INSTRUCTOR.id,
    date: "2026-09-23T00:00:00.000Z",
    startTime: "2026-09-23T13:00:00.000Z",
    endTime: "2026-09-23T15:00:00.000Z",
  };

  record("Unauthenticated GET list", 401, (await api("/api/schedules")).response.status);
  record("Unauthorized GET list", 403, (await api("/api/schedules", unauthorized)).response.status);

  const list = await api("/api/schedules", authorized);
  record("Authorized GET list", 200, list.response.status);
  const fixtureRows = list.payload.data.filter((item) => created.scheduleIds.includes(item.id));
  record("Fixture schedule count", 2, fixtureRows.length);
  record("Deterministic ordering", schedules[1].id, fixtureRows[0].id);
  assertExplicitFields(fixtureRows[0], expected);

  const detail = await api(`/api/schedules/${schedules[1].id}`, authorized);
  record("Authorized GET detail", 200, detail.response.status);
  assertExplicitFields(detail.payload.data, expected);

  record(
    "Nonexistent detail",
    404,
    (await api("/api/schedules/step41-missing", authorized)).response.status,
  );
  record(
    "Unauthorized GET detail",
    403,
    (await api(`/api/schedules/${schedules[1].id}`, unauthorized)).response.status,
  );
  record(
    "Unauthenticated GET detail",
    401,
    (await api(`/api/schedules/${schedules[1].id}`)).response.status,
  );

  const duringCounts = await getCounts();
  const expectedCounts = {
    programs: beforeCounts.programs + 1,
    subjects: beforeCounts.subjects + 1,
    batches: beforeCounts.batches + 1,
    classes: beforeCounts.classes + 1,
    schedules: beforeCounts.schedules + 2,
    enrollments: beforeCounts.enrollments,
    students: beforeCounts.students,
    attendances: beforeCounts.attendances,
    assessments: beforeCounts.assessments,
    assessmentScores: beforeCounts.assessmentScores,
    auditLogs: beforeCounts.auditLogs,
    users: beforeCounts.users + 3,
  };
  for (const [key, expectedCount] of Object.entries(expectedCounts)) {
    if (duringCounts[key] !== expectedCount) {
      throw new Error(
        `Unexpected ${key} count: expected ${expectedCount}, received ${duringCounts[key]}`,
      );
    }
  }
  return duringCounts;
}

async function cleanup() {
  if (created.scheduleIds.length > 0) {
    await prisma.schedule.deleteMany({
      where: { id: { in: created.scheduleIds } },
    });
  }
  if (created.classId) await prisma.class.delete({ where: { id: created.classId } });
  if (created.subjectId) await prisma.subject.delete({ where: { id: created.subjectId } });
  if (created.batchId) await prisma.batch.delete({ where: { id: created.batchId } });
  if (created.programId) await prisma.program.delete({ where: { id: created.programId } });
  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
}

async function main() {
  const beforeCounts = await getCounts();
  const fixtures = await createFixtures();
  const duringCounts = await runTests(fixtures, beforeCounts);
  console.log(JSON.stringify({ beforeCounts, duringCounts, results }, null, 2));
}

try {
  await main();
} finally {
  await cleanup();
  console.log(JSON.stringify({ afterCounts: await getCounts(), cleanup: "completed" }));
  await prisma.$disconnect();
}
