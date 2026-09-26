import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const runId = randomUUID().slice(0, 8);
const prefix = `STEP36-${runId}`;
const password = `step36-${randomUUID()}`;
const created = { classId: null, batchId: null, programId: null, userIds: [] };
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
    if (separator > 0) {
      values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
  return [...values.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
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
    enrollments,
    students,
    auditLogs,
    users,
    programSubjects,
  ] = await Promise.all([
    prisma.program.count(),
    prisma.subject.count(),
    prisma.batch.count(),
    prisma.class.count(),
    prisma.enrollment.count(),
    prisma.student.count(),
    prisma.auditLog.count(),
    prisma.user.count(),
    prisma.programSubject.count(),
  ]);
  return {
    programs,
    subjects,
    batches,
    classes,
    enrollments,
    students,
    auditLogs,
    users,
    programSubjects,
  };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "STUDENT"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 2) {
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
    data: {
      code: `${prefix}-PROGRAM`,
      name: `${prefix} Program`,
    },
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
      instructorId: users.SUPER_ADMIN.id,
      status: "SCHEDULED",
    },
    select: { id: true },
  });
  created.classId = classRecord.id;

  return { users, batch };
}

function assertExplicitClassFields(data, expected) {
  const expectedFields = [
    "id",
    "name",
    "batchId",
    "instructorId",
    "status",
    "createdAt",
    "updatedAt",
    "batch",
  ];
  const actualFields = Object.keys(data).sort();
  record("Explicit fields only", expectedFields.sort().join(","), actualFields.join(","));

  for (const forbidden of ["passwordHash", "email", "role", "capacity", "participantCount", "progress"]) {
    if (forbidden in data || (data.batch && forbidden in data.batch)) {
      throw new Error(`Forbidden field exposed: ${forbidden}`);
    }
  }

  record("Correct batchId", expected.batchId, data.batchId);
  record("Correct instructorId", expected.instructorId, data.instructorId);
  record("Raw status", "SCHEDULED", data.status);
  record("Correct nested Batch", expected.batchId, data.batch.id);
  record("Nested Batch programId", expected.programId, data.batch.programId);
}

async function runTests({ users, batch }, beforeCounts) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.STUDENT.email);

  record("Unauthenticated GET list", 401, (await api("/api/classes")).response.status);
  record("Unauthorized GET list", 403, (await api("/api/classes", unauthorized)).response.status);

  const list = await api("/api/classes", authorized);
  record("Authorized GET list", 200, list.response.status);
  const fixtureFromList = list.payload.data.find((item) => item.id === created.classId);
  if (!fixtureFromList) throw new Error("Fixture Class missing from list");
  assertExplicitClassFields(fixtureFromList, {
    batchId: batch.id,
    instructorId: users.SUPER_ADMIN.id,
    programId: created.programId,
  });

  const detail = await api(`/api/classes/${created.classId}`, authorized);
  record("Authorized GET detail", 200, detail.response.status);
  assertExplicitClassFields(detail.payload.data, {
    batchId: batch.id,
    instructorId: users.SUPER_ADMIN.id,
    programId: created.programId,
  });

  record(
    "Nonexistent detail",
    404,
    (await api("/api/classes/step36-missing", authorized)).response.status,
  );
  record(
    "Unauthorized GET detail",
    403,
    (await api(`/api/classes/${created.classId}`, unauthorized)).response.status,
  );
  record(
    "Unauthenticated GET detail",
    401,
    (await api(`/api/classes/${created.classId}`)).response.status,
  );

  const countsAfterReads = await getCounts();
  if (countsAfterReads.auditLogs !== beforeCounts.auditLogs) {
    throw new Error("Class READ unexpectedly created AuditLog records");
  }
  for (const key of ["programs", "subjects", "batches", "classes", "enrollments", "students", "programSubjects"]) {
    const expected = beforeCounts[key] + (key === "programs" || key === "batches" || key === "classes" ? 1 : 0);
    if (countsAfterReads[key] !== expected) {
      throw new Error(`Unexpected ${key} count during test`);
    }
  }
  if (countsAfterReads.users !== beforeCounts.users + 2) {
    throw new Error("Unexpected users count during test");
  }
  return countsAfterReads;
}

async function cleanup() {
  if (created.classId) {
    await prisma.class.delete({ where: { id: created.classId } });
  }
  if (created.batchId) {
    await prisma.batch.delete({ where: { id: created.batchId } });
  }
  if (created.programId) {
    await prisma.program.delete({ where: { id: created.programId } });
  }
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
