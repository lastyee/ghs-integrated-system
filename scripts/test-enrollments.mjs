import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const password = `step15-${randomUUID()}`;
const runId = randomUUID().slice(0, 8);
const fixturePrefix = `STEP15-${runId}`;
const created = {
  enrollmentIds: [],
  userIds: [],
  studentIds: [],
  batchIds: [],
  programIds: [],
};

const results = [];
const users = new Map();

function record(name, expected, actual, details = "") {
  const pass = expected === actual;
  results.push({ name, expected, actual, pass, details });
  if (!pass) {
    throw new Error(`${name}: expected ${expected}, received ${actual}${details ? ` (${details})` : ""}`);
  }
}

function getCookies(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    return setCookies.map((cookie) => cookie.split(";")[0]);
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
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/`,
    json: "true",
  });
  const response = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body,
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function api(method, path, cookies = "", body) {
  const headers = {};
  if (cookies) {
    headers.Cookie = cookies;
  }
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
    payload = null;
  }
  return { response, payload };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: {
      name: {
        in: [
          "SUPER_ADMIN",
          "ADMIN",
          "ACADEMIC_STAFF",
          "MANAGEMENT",
          "INSTRUCTOR",
          "PLACEMENT_STAFF",
          "STUDENT",
        ],
      },
    },
    select: { id: true, name: true },
  });
  if (roles.length !== 7) {
    throw new Error("Required existing roles are missing; run the development seed first.");
  }

  const roleIds = new Map(roles.map((role) => [role.name, role.id]));
  for (const roleName of roleIds.keys()) {
    const user = await prisma.user.create({
      data: {
        email: `${fixturePrefix.toLowerCase()}.${roleName.toLowerCase()}@ghs.test`,
        name: `${fixturePrefix} ${roleName}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: roleIds.get(roleName),
      },
      select: { id: true, email: true },
    });
    created.userIds.push(user.id);
    users.set(roleName, user.email);
  }

  const existingStudent = await prisma.student.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, nik: true, name: true, phone: true, address: true, userId: true },
  });
  if (!existingStudent) {
    throw new Error("An existing Student is required for the integration test.");
  }

  const program = await prisma.program.create({
    data: {
      code: fixturePrefix,
      name: `${fixturePrefix} Program`,
      description: "Temporary Step 15 integration fixture",
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

  return { existingStudent };
}

async function runTests(existingStudent, beforeCounts) {
  const unauthenticatedList = await api("GET", "/api/enrollments");
  record("Unauthenticated GET list", 401, unauthenticatedList.response.status);

  const unauthenticatedDetail = await api("GET", "/api/enrollments/step15-missing");
  record("Unauthenticated GET detail", 401, unauthenticatedDetail.response.status);

  const unauthenticatedCreate = await api("POST", "/api/enrollments", "", {});
  record("Unauthenticated POST", 401, unauthenticatedCreate.response.status);

  for (const roleName of ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "MANAGEMENT", "INSTRUCTOR", "PLACEMENT_STAFF", "STUDENT"]) {
    const cookies = await login(users.get(roleName));
    const list = await api("GET", "/api/enrollments", cookies);
    const expected = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "MANAGEMENT"].includes(roleName) ? 200 : 403;
    record(`${roleName} GET`, expected, list.response.status);

    const post = await api("POST", "/api/enrollments", cookies, {
      studentId: existingStudent.id,
      batchId: created.batchIds[0],
      notes: `${fixturePrefix} ${roleName} create`,
    });
    const createExpected = ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"].includes(roleName) ? 201 : 403;
    record(`${roleName} POST`, createExpected, post.response.status);
    if (post.response.status === 201) {
      created.enrollmentIds.push(post.payload.data.id);
      record(`${roleName} created status`, "ACTIVE", post.payload.data.status);
      record(`${roleName} created student`, existingStudent.id, post.payload.data.studentId);
      record(`${roleName} created batch`, created.batchIds[0], post.payload.data.batchId);
      record(`${roleName} created notes`, `${fixturePrefix} ${roleName} create`, post.payload.data.notes);
      if (!post.payload.data.createdAt || !post.payload.data.updatedAt || !post.payload.data.id) {
        throw new Error(`${roleName} create did not return server-managed fields`);
      }
    }
  }

  const adminCookies = await login(users.get("ADMIN"));
  const invalidBodies = [
    [{ studentId: existingStudent.id }, "missing batchId"],
    [{ studentId: existingStudent.id, batchId: created.batchIds[0], unknown: true }, "unknown field"],
    [{ id: "client-id", studentId: existingStudent.id, batchId: created.batchIds[0] }, "client id"],
    [{ createdAt: "2026-01-01", studentId: existingStudent.id, batchId: created.batchIds[0] }, "createdAt"],
    [{ updatedAt: "2026-01-01", studentId: existingStudent.id, batchId: created.batchIds[0] }, "updatedAt"],
    [{ student: {}, studentId: existingStudent.id, batchId: created.batchIds[0] }, "relation object"],
    [{ status: "COMPLETED", studentId: existingStudent.id, batchId: created.batchIds[0] }, "client status"],
  ];
  for (const [body, label] of invalidBodies) {
    const result = await api("POST", "/api/enrollments", adminCookies, body);
    record(`Invalid body: ${label}`, 400, result.response.status);
  }

  const missingStudent = await api("POST", "/api/enrollments", adminCookies, {
    studentId: "step15-missing-student",
    batchId: created.batchIds[0],
  });
  record("Nonexistent Student", 404, missingStudent.response.status);

  const missingBatch = await api("POST", "/api/enrollments", adminCookies, {
    studentId: existingStudent.id,
    batchId: "step15-missing-batch",
  });
  record("Nonexistent Batch", 404, missingBatch.response.status);

  const firstEnrollmentId = created.enrollmentIds[0];
  const detail = await api("GET", `/api/enrollments/${firstEnrollmentId}`, adminCookies);
  record("Authorized GET created detail", 200, detail.response.status);
  const unauthorizedDetail = await api("GET", `/api/enrollments/${firstEnrollmentId}`, await login(users.get("INSTRUCTOR")));
  record("Unauthorized GET created detail", 403, unauthorizedDetail.response.status);
  const missingDetail = await api("GET", "/api/enrollments/step15-missing", adminCookies);
  record("Nonexistent detail", 404, missingDetail.response.status);

  const duplicateOne = await api("POST", "/api/enrollments", adminCookies, {
    studentId: existingStudent.id,
    batchId: created.batchIds[0],
    notes: `${fixturePrefix} duplicate one`,
  });
  const duplicateTwo = await api("POST", "/api/enrollments", adminCookies, {
    studentId: existingStudent.id,
    batchId: created.batchIds[0],
    notes: `${fixturePrefix} duplicate two`,
  });
  record("Duplicate create one", 201, duplicateOne.response.status);
  record("Duplicate create two", 201, duplicateTwo.response.status);
  created.enrollmentIds.push(duplicateOne.payload.data.id, duplicateTwo.payload.data.id);

  const afterCounts = await getCounts();
  if (
    afterCounts.students !== beforeCounts.students ||
    afterCounts.batches !== beforeCounts.batches + created.batchIds.length ||
    afterCounts.programs !== beforeCounts.programs + created.programIds.length
  ) {
    throw new Error("Student, Batch, or Program count changed unexpectedly during test");
  }
  const unchangedStudent = await prisma.student.findUnique({
    where: { id: existingStudent.id },
    select: { id: true, nik: true, name: true, phone: true, address: true, userId: true },
  });
  if (JSON.stringify(unchangedStudent) !== JSON.stringify(existingStudent)) {
    throw new Error("Existing Student changed during integration test");
  }

  return afterCounts;
}

async function getCounts() {
  const [enrollments, students, batches, programs] = await Promise.all([
    prisma.enrollment.count(),
    prisma.student.count(),
    prisma.batch.count(),
    prisma.program.count(),
  ]);
  return { enrollments, students, batches, programs };
}

async function cleanup() {
  if (created.enrollmentIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        entity: "Enrollment",
        entityId: { in: created.enrollmentIds },
      },
    });
  }
  if (created.enrollmentIds.length > 0) {
    await prisma.enrollment.deleteMany({ where: { id: { in: created.enrollmentIds } } });
  }
  if (created.batchIds.length > 0) {
    await prisma.batch.deleteMany({ where: { id: { in: created.batchIds } } });
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
  const { existingStudent } = await createFixtures();
  const duringCounts = await runTests(existingStudent, beforeCounts);
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
