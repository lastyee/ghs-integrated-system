import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const runId = randomUUID().slice(0, 8);
const prefix = `STEP40-${runId}`;
const password = `step40-${randomUUID()}`;
const created = {
  classIds: [],
  batchId: null,
  programId: null,
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
    classes,
    schedules,
    attendances,
    assessments,
    assessmentScores,
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
    prisma.schedule.count(),
    prisma.attendance.count(),
    prisma.assessment.count(),
    prisma.assessmentScore.count(),
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
    schedules,
    attendances,
    assessments,
    assessmentScores,
    enrollments,
    students,
    auditLogs,
    users,
    programSubjects,
  };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "STUDENT", "INSTRUCTOR"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 3) {
    throw new Error(
      "Required roles are missing; run the development seed first.",
    );
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

  return users;
}

async function runTests(users, beforeCounts) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.STUDENT.email);
  const instructorId = users.INSTRUCTOR.id;
  const validBody = {
    name: `${prefix} Class`,
    batchId: created.batchId,
    instructorId,
  };

  record(
    "Unauthenticated POST",
    401,
    (await api("POST", "/api/classes", "", validBody)).response.status,
  );
  record(
    "Unauthorized POST",
    403,
    (await api("POST", "/api/classes", unauthorized, validBody)).response.status,
  );

  const valid = await api("POST", "/api/classes", authorized, validBody);
  record("Valid Class CREATE", 201, valid.response.status);
  created.classIds.push(valid.payload.data.id);

  for (const field of ["id", "createdAt", "updatedAt"]) {
    if (!valid.payload.data[field]) {
      throw new Error(`Missing generated field: ${field}`);
    }
  }
  record("Created name", validBody.name, valid.payload.data.name);
  record("Created batchId", created.batchId, valid.payload.data.batchId);
  record("Created instructorId", instructorId, valid.payload.data.instructorId);
  record("Default status", "SCHEDULED", valid.payload.data.status);

  const expectedFields = [
    "batchId",
    "createdAt",
    "id",
    "instructorId",
    "name",
    "status",
    "updatedAt",
  ].join(",");
  record(
    "Explicit response fields",
    expectedFields,
    Object.keys(valid.payload.data).sort().join(","),
  );

  const invalidBodies = [
    [{ batchId: created.batchId, instructorId }, "missing name"],
    [{ name: "Missing batch", instructorId }, "missing batchId"],
    [{ name: "Missing instructor", batchId: created.batchId }, "missing instructorId"],
    [{ name: 123, batchId: created.batchId, instructorId }, "invalid name type"],
    [{ name: "Invalid batch", batchId: 123, instructorId }, "invalid batchId type"],
    [{ name: "Invalid instructor", batchId: created.batchId, instructorId: 123 }, "invalid instructorId type"],
    [{}, "empty object"],
    [{ ...validBody, unknown: true, name: "Unknown" }, "unknown field"],
    [{ ...validBody, id: "client-id", name: "ID injection" }, "id injection"],
    [{ ...validBody, status: "COMPLETED", name: "status injection" }, "status injection"],
    [{ ...validBody, subjectId: "subject-id", name: "subject injection" }, "subjectId injection"],
    [{ ...validBody, schedule: {}, name: "schedule injection" }, "schedule injection"],
    [{ ...validBody, room: "Room 01", name: "room injection" }, "room injection"],
    [{ ...validBody, capacity: 20, name: "capacity injection" }, "capacity injection"],
    [{ ...validBody, participantCount: 10, name: "participant injection" }, "participantCount injection"],
    [{ ...validBody, progress: 50, name: "progress injection" }, "progress injection"],
  ];
  for (const [body, label] of invalidBodies) {
    record(
      `Invalid body: ${label}`,
      400,
      (await api("POST", "/api/classes", authorized, body)).response.status,
    );
  }

  record(
    "Nonexistent Batch",
    404,
    (
      await api("POST", "/api/classes", authorized, {
        ...validBody,
        name: "Missing batch",
        batchId: "cm40-missing-batch",
      })
    ).response.status,
  );
  record(
    "Nonexistent Instructor",
    404,
    (
      await api("POST", "/api/classes", authorized, {
        ...validBody,
        name: "Missing instructor",
        instructorId: "cm40-missing-instructor",
      })
    ).response.status,
  );

  const detail = await api("GET", `/api/classes/${created.classIds[0]}`, authorized);
  record("Read-after-create", 200, detail.response.status);
  record("Read-after-create ID", created.classIds[0], detail.payload.data.id);

  for (const field of ["passwordHash", "email", "role", "credentials"]) {
    if (field in valid.payload.data || field in detail.payload.data) {
      throw new Error(`Credential field exposed: ${field}`);
    }
  }

  const duringCounts = await getCounts();
  const expectedCounts = {
    programs: beforeCounts.programs + 1,
    batches: beforeCounts.batches + 1,
    classes: beforeCounts.classes + 1,
    users: beforeCounts.users + 3,
    subjects: beforeCounts.subjects,
    schedules: beforeCounts.schedules,
    attendances: beforeCounts.attendances,
    assessments: beforeCounts.assessments,
    assessmentScores: beforeCounts.assessmentScores,
    enrollments: beforeCounts.enrollments,
    students: beforeCounts.students,
    auditLogs: beforeCounts.auditLogs,
    programSubjects: beforeCounts.programSubjects,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (duringCounts[key] !== expected) {
      throw new Error(`Unexpected ${key} count: expected ${expected}, received ${duringCounts[key]}`);
    }
  }

  return duringCounts;
}

async function cleanup() {
  for (const classId of created.classIds) {
    await prisma.class.delete({ where: { id: classId } });
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
