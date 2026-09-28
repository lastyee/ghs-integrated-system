import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_PROGRAM_CREATE_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_PROGRAM_CREATE_CONFIRM_DATABASE",
});
const runId = randomUUID().slice(0, 8);
const code = `STEP31-PROGRAM-${runId}`;
const password = `step31-${randomUUID()}`;
const created = { programId: null, userIds: [] };
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
  const [programs, subjects, batches, enrollments, students, auditLogs, users] =
    await Promise.all([
      prisma.program.count(),
      prisma.subject.count(),
      prisma.batch.count(),
      prisma.enrollment.count(),
      prisma.student.count(),
      prisma.auditLog.count(),
      prisma.user.count(),
    ]);
  return { programs, subjects, batches, enrollments, students, auditLogs, users };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "INSTRUCTOR"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 2) {
    throw new Error("Required roles are missing; run the development seed first.");
  }

  const users = {};
  for (const role of roles) {
    const user = await prisma.user.create({
      data: {
        email: `step31-${runId}.${role.name.toLowerCase()}@ghs.test`,
        name: `STEP31 ${role.name}`,
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

  record(
    "Unauthenticated POST",
    401,
    (await api("POST", "/api/programs", "", {})).response.status,
  );
  record(
    "Unauthorized POST",
    403,
    (await api("POST", "/api/programs", unauthorized, { code, name: "Denied" })).response.status,
  );

  const valid = await api("POST", "/api/programs", authorized, {
    code,
    name: "Step 31 Program",
    description: null,
  });
  record("Valid Program CREATE", 201, valid.response.status);
  created.programId = valid.payload.data.id;
  for (const field of ["id", "createdAt", "updatedAt"]) {
    if (!valid.payload.data[field]) throw new Error(`Missing server field: ${field}`);
  }
  record("Created code", code, valid.payload.data.code);
  record("Created name", "Step 31 Program", valid.payload.data.name);
  record("Created description", null, valid.payload.data.description);

  const invalidBodies = [
    [{ id: "client-id", code: `${code}-ID`, name: "Invalid" }, "client id"],
    [{ createdAt: "2026-01-01", code: `${code}-CREATED`, name: "Invalid" }, "createdAt"],
    [{ updatedAt: "2026-01-01", code: `${code}-UPDATED`, name: "Invalid" }, "updatedAt"],
    [{ Batch: {}, code: `${code}-BATCH`, name: "Invalid" }, "relation"],
    [{ status: "ACTIVE", code: `${code}-STATUS`, name: "Invalid" }, "status"],
    [{ name: "Missing code" }, "missing code"],
    [{ code: `${code}-MISSING-NAME` }, "missing name"],
    [{ code: 123, name: "Invalid code" }, "invalid code type"],
    [{ code: `${code}-INVALID-NAME`, name: 123 }, "invalid name type"],
    [{ code: `${code}-UNKNOWN`, name: "Unknown", unknown: true }, "unknown field"],
  ];
  for (const [body, label] of invalidBodies) {
    record(`Invalid body: ${label}`, 400, (await api("POST", "/api/programs", authorized, body)).response.status);
  }

  record(
    "Duplicate code",
    409,
    (await api("POST", "/api/programs", authorized, { code, name: "Duplicate" })).response.status,
  );

  const detail = await api("GET", `/api/programs/${created.programId}`, authorized);
  record("Read-after-create", 200, detail.response.status);
  record(
    "Unauthorized GET",
    403,
    (await api("GET", `/api/programs/${created.programId}`, unauthorized)).response.status,
  );

  const duringCounts = await getCounts();
  if (duringCounts.programs !== beforeCounts.programs + 1) {
    throw new Error("Unexpected Program count during test");
  }
  if (duringCounts.auditLogs !== beforeCounts.auditLogs) {
    throw new Error("Program CREATE unexpectedly created an AuditLog");
  }
  return duringCounts;
}

async function cleanup() {
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
