import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_BATCH_CREATE_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_BATCH_CREATE_CONFIRM_DATABASE",
});
const runId = randomUUID().slice(0, 8);
const programCode = `STEP33-PROGRAM-${runId}`;
const password = `step33-${randomUUID()}`;
const created = { programId: null, batchId: null, userIds: [] };
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

async function api(method, path, cookies = "", body) {
  const headers = cookies ? { Cookie: cookies } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
    enrollments,
    students,
    auditLogs,
    users,
    programSubjects,
  ] = await Promise.all([
    prisma.program.count(),
    prisma.subject.count(),
    prisma.batch.count(),
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
    enrollments,
    students,
    auditLogs,
    users,
    programSubjects,
  };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "INSTRUCTOR"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 2) {
    throw new Error("Required roles are missing; run the development seed first.");
  }

  const program = await prisma.program.create({
    data: {
      code: programCode,
      name: "STEP33 Program",
    },
    select: { id: true },
  });
  created.programId = program.id;

  const users = {};
  for (const role of roles) {
    const user = await prisma.user.create({
      data: {
        email: `step33-${runId}.${role.name.toLowerCase()}@ghs.test`,
        name: `STEP33 ${role.name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: role.id,
      },
      select: { id: true, email: true },
    });
    created.userIds.push(user.id);
    users[role.name] = user;
  }

  return users;
}

async function runTests(users, beforeCounts) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.INSTRUCTOR.email);
  const startDate = "2026-09-23T00:00:00.000Z";

  record(
    "Unauthenticated POST",
    401,
    (await api("POST", "/api/batches", "", {})).response.status,
  );
  record(
    "Unauthorized POST",
    403,
    (
      await api("POST", "/api/batches", unauthorized, {
        name: "Denied",
        programId: created.programId,
        startDate,
      })
    ).response.status,
  );

  const valid = await api("POST", "/api/batches", authorized, {
    name: "Step 33 Batch",
    programId: created.programId,
    startDate,
    endDate: null,
  });
  record("Valid Batch CREATE", 201, valid.response.status);
  created.batchId = valid.payload.data.id;
  for (const field of ["id", "createdAt", "updatedAt"]) {
    if (!valid.payload.data[field]) throw new Error(`Missing server field: ${field}`);
  }
  record("Created name", "Step 33 Batch", valid.payload.data.name);
  record("Created programId", created.programId, valid.payload.data.programId);
  record("Created startDate", startDate, valid.payload.data.startDate);
  record("Created endDate", null, valid.payload.data.endDate);

  const invalidBodies = [
    [{ programId: created.programId, startDate }, "missing name"],
    [{ name: "Missing program", startDate }, "missing programId"],
    [{ name: "Missing start", programId: created.programId }, "missing startDate"],
    [{ name: 123, programId: created.programId, startDate }, "invalid name type"],
    [{ name: "Invalid program", programId: 123, startDate }, "invalid programId type"],
    [{ name: "Invalid date", programId: created.programId, startDate: "not-a-date" }, "invalid date"],
    [{ name: "Invalid date type", programId: created.programId, startDate: 123 }, "invalid date type"],
    [{}, "empty object"],
    [{ name: "Unknown", programId: created.programId, startDate, unknown: true }, "unknown field"],
    [{ id: "client-id", name: "Invalid", programId: created.programId, startDate }, "client id"],
    [{ createdAt: "2026-01-01", name: "Invalid", programId: created.programId, startDate }, "createdAt"],
    [{ updatedAt: "2026-01-01", name: "Invalid", programId: created.programId, startDate }, "updatedAt"],
    [{ status: "ACTIVE", name: "Invalid", programId: created.programId, startDate }, "status"],
    [{ capacity: 20, name: "Invalid", programId: created.programId, startDate }, "capacity"],
    [{ program: {}, name: "Invalid", programId: created.programId, startDate }, "relation"],
  ];
  for (const [body, label] of invalidBodies) {
    record(
      `Invalid body: ${label}`,
      400,
      (await api("POST", "/api/batches", authorized, body)).response.status,
    );
  }

  record(
    "Nonexistent Program",
    404,
    (
      await api("POST", "/api/batches", authorized, {
        name: "Missing Program",
        programId: "cm nonexistent program",
        startDate,
      })
    ).response.status,
  );

  const detail = await api("GET", `/api/batches/${created.batchId}`, authorized);
  record("Read-after-create", 200, detail.response.status);
  record("Read Program relation", created.programId, detail.payload.data.program.id);

  const enrollmentCount = await prisma.enrollment.count({
    where: { batchId: created.batchId },
  });
  const programSubjectCount = await prisma.programSubject.count({
    where: { programId: created.programId },
  });
  record("No automatic Enrollment", 0, enrollmentCount);
  record("No automatic ProgramSubject", 0, programSubjectCount);

  const duringCounts = await getCounts();
  if (duringCounts.programs !== beforeCounts.programs + 1) {
    throw new Error("Unexpected Program count during test");
  }
  if (duringCounts.batches !== beforeCounts.batches + 1) {
    throw new Error("Unexpected Batch count during test");
  }
  if (duringCounts.auditLogs !== beforeCounts.auditLogs) {
    throw new Error("Batch CREATE unexpectedly created an AuditLog");
  }
  if (duringCounts.enrollments !== beforeCounts.enrollments) {
    throw new Error("Batch CREATE unexpectedly created an Enrollment");
  }
  if (duringCounts.programSubjects !== beforeCounts.programSubjects) {
    throw new Error("Batch CREATE unexpectedly created a ProgramSubject relation");
  }
  return duringCounts;
}

async function cleanup() {
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
  const users = await createFixtures();
  const duringCounts = await runTests(users, beforeCounts);
  console.log(JSON.stringify({ beforeCounts, duringCounts, results }, null, 2));
}

try {
  await main();
} finally {
  await cleanup();
  console.log(JSON.stringify({ afterCounts: await getCounts(), cleanup: "completed" }));
  await prisma.$disconnect();
}
