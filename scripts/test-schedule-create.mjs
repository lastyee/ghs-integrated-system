import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const runId = randomUUID().slice(0, 8);
const prefix = `STEP44-${runId}`;
const password = `step44-${randomUUID()}`;
const created = {
  scheduleIds: [],
  userIds: [],
  classId: null,
  batchId: null,
  programId: null,
  subjectId: null,
};
const results = [];

function record(name, expected, actual) {
  const pass = expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) throw new Error(`${name}: expected ${expected}, received ${actual}`);
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
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
    // Status assertions remain useful if an error response has no JSON body.
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
    auditLogs,
    users,
  ] = await Promise.all([
    prisma.program.count(),
    prisma.subject.count(),
    prisma.batch.count(),
    prisma.class.count(),
    prisma.schedule.count(),
    prisma.attendance.count(),
    prisma.assessment.count(),
    prisma.auditLog.count(),
    prisma.user.count(),
  ]);
  return { programs, subjects, batches, classes, schedules, attendances, assessments, auditLogs, users };
}

async function createFixtures() {
  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "STUDENT", "INSTRUCTOR"] } },
    select: { id: true, name: true },
  });
  if (roles.length !== 3) throw new Error("Required roles are missing; run the development seed first.");

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
    data: { name: `${prefix} Class`, batchId: batch.id, instructorId: users.INSTRUCTOR.id },
    select: { id: true },
  });
  created.classId = classRecord.id;

  const subject = await prisma.subject.create({
    data: { code: `${prefix}-SUBJECT`, name: `${prefix} Subject` },
    select: { id: true },
  });
  created.subjectId = subject.id;

  return users;
}

async function runTests(users, beforeCounts) {
  const authorized = await login(users.SUPER_ADMIN.email);
  const unauthorized = await login(users.STUDENT.email);
  const validBody = {
    classId: created.classId,
    subjectId: created.subjectId,
    instructorId: users.INSTRUCTOR.id,
    date: "2026-09-23T00:00:00.000Z",
    startTime: "2026-09-23T13:00:00.000Z",
    endTime: "2026-09-23T15:00:00.000Z",
  };

  record("Unauthenticated POST", 401, (await api("POST", "/api/schedules", "", validBody)).response.status);
  record("Unauthorized POST", 403, (await api("POST", "/api/schedules", unauthorized, validBody)).response.status);

  const valid = await api("POST", "/api/schedules", authorized, validBody);
  record("Valid Schedule CREATE", 201, valid.response.status);
  created.scheduleIds.push(valid.payload.data.id);
  for (const field of ["id", "createdAt", "updatedAt"]) {
    if (!valid.payload.data[field]) throw new Error(`Missing generated field: ${field}`);
  }
  for (const field of ["classId", "subjectId", "instructorId", "date", "startTime", "endTime"]) {
    record(`Created ${field}`, validBody[field], valid.payload.data[field]);
  }
  record("Default status", "SCHEDULED", valid.payload.data.status);
  record(
    "Explicit response fields",
    ["classId", "createdAt", "date", "endTime", "id", "instructorId", "startTime", "status", "subjectId", "updatedAt"].join(","),
    Object.keys(valid.payload.data).sort().join(","),
  );

  const invalidBodies = [
    [{ subjectId: created.subjectId, instructorId: validBody.instructorId, date: validBody.date, startTime: validBody.startTime, endTime: validBody.endTime }, "missing classId"],
    [{ classId: created.classId, instructorId: validBody.instructorId, date: validBody.date, startTime: validBody.startTime, endTime: validBody.endTime }, "missing subjectId"],
    [{ classId: created.classId, subjectId: created.subjectId, date: validBody.date, startTime: validBody.startTime, endTime: validBody.endTime }, "missing instructorId"],
    [{ ...validBody, date: undefined }, "missing date"],
    [{ ...validBody, startTime: undefined }, "missing startTime"],
    [{ ...validBody, endTime: undefined }, "missing endTime"],
    [{ ...validBody, classId: 123 }, "invalid classId type"],
    [{ ...validBody, date: 123 }, "invalid date type"],
    [{ ...validBody, date: "not-a-date" }, "invalid DateTime"],
    [{ ...validBody, room: "Room 01" }, "unknown room"],
    [{ ...validBody, status: "COMPLETED" }, "status injection"],
    [{ ...validBody, id: "client-id" }, "id injection"],
    [{ ...validBody, programSubject: true }, "ProgramSubject injection"],
  ];
  for (const [body, label] of invalidBodies) {
    record(`Invalid body: ${label}`, 400, (await api("POST", "/api/schedules", authorized, body)).response.status);
  }

  record("Nonexistent Class", 404, (await api("POST", "/api/schedules", authorized, { ...validBody, classId: "missing-class" })).response.status);
  record("Nonexistent Subject", 404, (await api("POST", "/api/schedules", authorized, { ...validBody, subjectId: "missing-subject" })).response.status);
  record("Nonexistent Instructor", 404, (await api("POST", "/api/schedules", authorized, { ...validBody, instructorId: "missing-instructor" })).response.status);

  const detail = await api("GET", `/api/schedules/${created.scheduleIds[0]}`, authorized);
  record("Read-after-create", 200, detail.response.status);
  record("Read-after-create ID", created.scheduleIds[0], detail.payload.data.id);

  for (const field of ["passwordHash", "email", "role", "credentials"]) {
    if (field in valid.payload.data || field in detail.payload.data) throw new Error(`Credential field exposed: ${field}`);
  }

  const duringCounts = await getCounts();
  const expectedCounts = {
    programs: beforeCounts.programs + 1,
    subjects: beforeCounts.subjects + 1,
    batches: beforeCounts.batches + 1,
    classes: beforeCounts.classes + 1,
    schedules: beforeCounts.schedules + 1,
    users: beforeCounts.users + 3,
    attendances: beforeCounts.attendances,
    assessments: beforeCounts.assessments,
    auditLogs: beforeCounts.auditLogs,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (duringCounts[key] !== expected) throw new Error(`Unexpected ${key} count: expected ${expected}, received ${duringCounts[key]}`);
  }
  return duringCounts;
}

async function cleanup() {
  if (created.scheduleIds.length > 0) {
    await prisma.schedule.deleteMany({ where: { id: { in: created.scheduleIds } } });
  }
  if (created.classId) await prisma.class.delete({ where: { id: created.classId } });
  if (created.subjectId) await prisma.subject.delete({ where: { id: created.subjectId } });
  if (created.batchId) await prisma.batch.delete({ where: { id: created.batchId } });
  if (created.programId) await prisma.program.delete({ where: { id: created.programId } });
  if (created.userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
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
