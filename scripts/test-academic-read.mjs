import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_ACADEMIC_READ_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_ACADEMIC_READ_CONFIRM_DATABASE",
});
const runId = randomUUID().slice(0, 8);
const prefix = `STEP29-${runId}`;
const password = `step29-${randomUUID()}`;
const created = {
  batchIds: [],
  programIds: [],
  subjectIds: [],
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
  const [programs, subjects, batches, enrollments, students, auditLogs] =
    await Promise.all([
      prisma.program.count(),
      prisma.subject.count(),
      prisma.batch.count(),
      prisma.enrollment.count(),
      prisma.student.count(),
      prisma.auditLog.count(),
    ]);
  return { programs, subjects, batches, enrollments, students, auditLogs };
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
      code: prefix,
      name: `${prefix} Program`,
      description: "Temporary Step 29 read fixture",
    },
    select: { id: true },
  });
  created.programIds.push(program.id);

  const subject = await prisma.subject.create({
    data: {
      code: `${prefix}-SUBJECT`,
      name: `${prefix} Subject`,
      description: "Temporary Step 29 read fixture",
    },
    select: { id: true },
  });
  created.subjectIds.push(subject.id);

  const batch = await prisma.batch.create({
    data: {
      name: `${prefix} Batch`,
      programId: program.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    },
    select: { id: true },
  });
  created.batchIds.push(batch.id);

  return { batch, program, subject, users };
}

async function runTests({ batch, program, subject, users }) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.INSTRUCTOR.email);

  for (const resource of [
    ["programs", "Program", program.id],
    ["subjects", "Subject", subject.id],
    ["batches", "Batch", batch.id],
  ]) {
    const [path, label, id] = resource;
    record(`${label} unauthenticated list`, 401, (await api(`/api/${path}`)).response.status);
    record(`${label} unauthenticated detail`, 401, (await api(`/api/${path}/${id}`)).response.status);
    const list = await api(`/api/${path}`, authorized);
    record(`${label} authorized list`, 200, list.response.status);
    const detail = await api(`/api/${path}/${id}`, authorized);
    record(`${label} authorized detail`, 200, detail.response.status);
    const missing = await api(`/api/${path}/step29-missing`, authorized);
    record(`${label} nonexistent detail`, 404, missing.response.status);
    const denied = await api(`/api/${path}`, unauthorized);
    record(`${label} unauthorized list`, 403, denied.response.status);
  }

  const batchDetail = await api(`/api/batches/${batch.id}`, authorized);
  if (
    batchDetail.payload.data.program.id !== program.id ||
    batchDetail.payload.data.program.code !== `${prefix}` ||
    "capacity" in batchDetail.payload.data ||
    "status" in batchDetail.payload.data
  ) {
    throw new Error("Batch response contains invalid relation or derived fields");
  }

  const afterCounts = await getCounts();
  return afterCounts;
}

async function cleanup() {
  if (created.batchIds.length > 0) {
    await prisma.batch.deleteMany({ where: { id: { in: created.batchIds } } });
  }
  if (created.subjectIds.length > 0) {
    await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } });
  }
  if (created.programIds.length > 0) {
    await prisma.program.deleteMany({ where: { id: { in: created.programIds } } });
  }
  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }
}

async function main() {
  const beforeCounts = await getCounts();
  const fixtures = await createFixtures();
  const duringCounts = await runTests(fixtures);
  if (duringCounts.auditLogs !== beforeCounts.auditLogs) {
    throw new Error("READ endpoints unexpectedly created AuditLog records");
  }
  console.log(JSON.stringify({ beforeCounts, duringCounts, results }, null, 2));
}

try {
  await main();
} finally {
  await cleanup();
  console.log(JSON.stringify({ afterCounts: await getCounts(), cleanup: "completed" }));
  await prisma.$disconnect();
}
