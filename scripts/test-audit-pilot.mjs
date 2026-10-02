import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3100";
assertSafeMutationTarget({
  mutationFlag: "TEST_AUDIT_PILOT_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_AUDIT_PILOT_CONFIRM_DATABASE",
});
const runId = randomUUID().slice(0, 8);
const fixturePrefix = `STEP27A-${runId}`;
const password = `step27a-${randomUUID()}`;
const created = {
  auditLogIds: [],
  batchIds: [],
  enrollmentIds: [],
  programIds: [],
  studentIds: [],
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
  if (cookies.length > 0) {
    return cookies.map((cookie) => cookie.split(";")[0]);
  }

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

async function api(method, path, cookies = "", body) {
  const headers = cookies ? { Cookie: cookies } : {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The status is the assertion when the response has no JSON body.
  }
  return { response, payload };
}

async function getCounts() {
  const [students, enrollments, auditLogs, users] = await Promise.all([
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.auditLog.count(),
    prisma.user.count(),
  ]);
  return { students, enrollments, auditLogs, users };
}

async function createFixtures() {
  const role = await prisma.role.findUnique({
    where: { name: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!role) {
    throw new Error("SUPER_ADMIN role is required; run the development seed first.");
  }

  const user = await prisma.user.create({
    data: {
      email: `${fixturePrefix.toLowerCase()}@ghs.test`,
      name: `${fixturePrefix} User`,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: role.id,
    },
    select: { id: true, email: true },
  });
  created.userIds.push(user.id);

  const program = await prisma.program.create({
    data: {
      code: fixturePrefix,
      name: `${fixturePrefix} Program`,
      description: "Temporary Step 27A audit fixture",
    },
    select: { id: true },
  });
  created.programIds.push(program.id);

  const batch = await prisma.batch.create({
    data: {
      name: `${fixturePrefix} Batch`,
      programId: program.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    },
    select: { id: true },
  });
  created.batchIds.push(batch.id);

  return { batchId: batch.id, user };
}

async function readFixtureAudit(entityId) {
  return prisma.auditLog.findMany({
    where: { entityId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      action: true,
      entity: true,
      entityId: true,
      changes: true,
    },
  });
}

async function runTests({ batchId, user }, beforeCounts) {
  const cookies = await login(user.email);

  const unauthenticated = await api("POST", "/api/students", "", {
    nik: `${fixturePrefix}-unauth`,
    name: "Unauthenticated",
  });
  record("Unauthorized Student CREATE", 401, unauthenticated.response.status);

  const invalid = await api("POST", "/api/students", cookies, {
    nik: `${fixturePrefix}-invalid`,
  });
  record("Validation error", 400, invalid.response.status);

  const createdStudent = await api("POST", "/api/students", cookies, {
    nik: `${fixturePrefix}-NIK`,
    name: `${fixturePrefix} Student`,
    phone: "0800000000",
    address: "Fixture address",
  });
  record("Student CREATE", 201, createdStudent.response.status);
  const studentId = createdStudent.payload.data.id;
  created.studentIds.push(studentId);

  let auditLogs = await readFixtureAudit(studentId);
  record("Student CREATE audit count", 1, auditLogs.length);
  record("Student CREATE actor", user.id, auditLogs[0].userId);
  record("Student CREATE action", "CREATE", auditLogs[0].action);
  record("Student CREATE entity", "Student", auditLogs[0].entity);
  created.auditLogIds.push(auditLogs[0].id);

  const serializedCreateChanges = JSON.stringify(auditLogs[0].changes);
  if (/password|token|session|secret|database_url|document(binary|content)?/i.test(serializedCreateChanges)) {
    throw new Error("Sensitive data was found in Student CREATE changes");
  }

  const updated = await api("PATCH", `/api/students/${studentId}`, cookies, {
    name: `${fixturePrefix} Updated`,
    phone: null,
  });
  record("Student UPDATE", 200, updated.response.status);

  auditLogs = await readFixtureAudit(studentId);
  record("Student UPDATE audit count", 2, auditLogs.length);
  record("Student UPDATE actor", user.id, auditLogs[1].userId);
  record("Student UPDATE action", "UPDATE", auditLogs[1].action);
  created.auditLogIds.push(auditLogs[1].id);

  const duplicate = await api("POST", "/api/students", cookies, {
    nik: `${fixturePrefix}-NIK`,
    name: `${fixturePrefix} Duplicate`,
  });
  record("Duplicate Student NIK", 409, duplicate.response.status);
  record("Duplicate Student audit count", 2, (await readFixtureAudit(studentId)).length);

  const missingUpdate = await api("PATCH", "/api/students/step27a-missing", cookies, {
    name: "Missing",
  });
  record("Nonexistent Student UPDATE", 404, missingUpdate.response.status);

  const enrollment = await api("POST", "/api/enrollments", cookies, {
    studentId,
    batchId,
    notes: `${fixturePrefix} enrollment`,
  });
  record("Enrollment CREATE", 201, enrollment.response.status);
  const enrollmentId = enrollment.payload.data.id;
  created.enrollmentIds.push(enrollmentId);

  auditLogs = await readFixtureAudit(enrollmentId);
  record("Enrollment CREATE audit count", 1, auditLogs.length);
  record("Enrollment CREATE actor", user.id, auditLogs[0].userId);
  record("Enrollment CREATE action", "CREATE", auditLogs[0].action);
  record("Enrollment CREATE status", "ACTIVE", enrollment.payload.data.status);
  created.auditLogIds.push(auditLogs[0].id);

  const afterCounts = await getCounts();
  if (afterCounts.students !== beforeCounts.students + 1) {
    throw new Error("Unexpected Student count during audit pilot");
  }
  if (afterCounts.enrollments !== beforeCounts.enrollments + 1) {
    throw new Error("Unexpected Enrollment count during audit pilot");
  }
  if (afterCounts.auditLogs !== beforeCounts.auditLogs + 3) {
    throw new Error("Unexpected AuditLog count during audit pilot");
  }
  if (afterCounts.users !== beforeCounts.users + 1) {
    throw new Error("Unexpected User count during audit pilot");
  }

  return afterCounts;
}

async function cleanup() {
  if (created.enrollmentIds.length > 0) {
    await prisma.enrollment.deleteMany({
      where: { id: { in: created.enrollmentIds } },
    });
  }
  if (created.studentIds.length > 0) {
    await prisma.student.deleteMany({
      where: { id: { in: created.studentIds } },
    });
  }
  if (created.batchIds.length > 0) {
    await prisma.batch.deleteMany({
      where: { id: { in: created.batchIds } },
    });
  }
  if (created.programIds.length > 0) {
    await prisma.program.deleteMany({
      where: { id: { in: created.programIds } },
    });
  }
  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
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
  const afterCounts = await getCounts();
  console.log(JSON.stringify({ afterCounts, cleanup: "completed" }));
  await prisma.$disconnect();
}
