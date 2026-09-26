import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const results = [];

function record(name, expected, actual, passCondition) {
  const pass = passCondition !== undefined ? Boolean(passCondition) : expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) {
    throw new Error(`TEST FAILED: ${name}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function getCookies(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies.map((c) => c.split(";")[0]);
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

function mergeCookies(existing, response) {
  const values = new Map();
  for (const cookie of [...existing.split("; "), ...getCookies(response)]) {
    const separator = cookie.indexOf("=");
    if (separator > 0) values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
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
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 64E API & SECURITY VERIFICATION ===\n");

  // 1. Unauthenticated GET /api/schedules
  const unauthListRes = await request("/api/schedules");
  record(
    "Unauthenticated GET /api/schedules returns 401",
    401,
    unauthListRes.status
  );

  // 2. Unauthenticated GET /api/schedules/dummy-id
  const unauthDetailRes = await request("/api/schedules/dummy-id");
  record(
    "Unauthenticated GET /api/schedules/:id returns 401",
    401,
    unauthDetailRes.status
  );

  // 3. Authenticate as Student (student.demo@ghs.local)
  const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";
  const studentCookies = await login("student.demo@ghs.local", studentPassword);
  console.log("Logged in as student.demo@ghs.local");

  const studentListRes = await request("/api/schedules", {
    headers: { Cookie: studentCookies },
  });
  record(
    "Student GET /api/schedules returns 403 Forbidden (no schedule:read)",
    403,
    studentListRes.status
  );

  const studentDetailRes = await request("/api/schedules/dummy-id", {
    headers: { Cookie: studentCookies },
  });
  record(
    "Student GET /api/schedules/:id returns 403 Forbidden",
    403,
    studentDetailRes.status
  );

  // 4. Authenticate as Super Admin (admin.demo@ghs.local)
  const adminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
  const adminCookies = await login("admin.demo@ghs.local", adminPassword);
  console.log("Logged in as admin.demo@ghs.local");

  // 5. Authorized GET /api/schedules
  const adminListRes = await request("/api/schedules", {
    headers: { Cookie: adminCookies },
  });
  record("Admin GET /api/schedules returns 200 OK", 200, adminListRes.status);

  const listPayload = await adminListRes.json();
  const schedules = listPayload.data;
  record("Schedule array returned in data property", true, Array.isArray(schedules));
  record("Total schedules in API response is exactly 10", 10, schedules.length);

  const ghi07Schedules = schedules.filter((s) => s.class?.batch?.name === "GHI-07");
  const ghi08Schedules = schedules.filter((s) => s.class?.batch?.name === "GHI-08");

  record("GHI-07 count is exactly 4", 4, ghi07Schedules.length);
  record("GHI-08 count is exactly 6", 6, ghi08Schedules.length);

  // 6. Security Check on each item
  for (const s of schedules) {
    record(`Schedule ${s.id} status is SCHEDULED`, "SCHEDULED", s.status);
    record(`Schedule ${s.id} has class relation`, true, Boolean(s.class && s.class.name));
    record(`Schedule ${s.id} has batch relation`, true, Boolean(s.class.batch && s.class.batch.name));
    record(`Schedule ${s.id} has subject relation`, true, Boolean(s.subject && s.subject.name));
    record(`Schedule ${s.id} has instructor relation`, true, Boolean(s.instructor && s.instructor.name));

    // Forbidden credential check
    const serialized = JSON.stringify(s);
    for (const forbidden of ["passwordHash", "password", "credential", "secret", "sessionToken"]) {
      if (serialized.includes(forbidden)) {
        throw new Error(`SECURITY BREACH: ${forbidden} found in schedule API response!`);
      }
    }

    // Instructor shape check: only id and name
    const instructorKeys = Object.keys(s.instructor).sort();
    record(
      `Instructor on schedule ${s.id} has only safe fields [id, name]`,
      "id,name",
      instructorKeys.join(",")
    );
  }

  // 7. Test Detail Endpoint for each schedule
  for (const s of schedules) {
    const detailRes = await request(`/api/schedules/${s.id}`, {
      headers: { Cookie: adminCookies },
    });
    record(`Admin GET /api/schedules/${s.id} returns 200`, 200, detailRes.status);
    const detailPayload = await detailRes.json();
    const detail = detailPayload.data;

    record(`Detail matches ID for ${s.id}`, s.id, detail.id);
    record(`Detail room matches for ${s.id}`, s.room, detail.room);
    record(`Detail dressCode matches for ${s.id}`, s.dressCode, detail.dressCode);
    record(`Detail topic matches for ${s.id}`, s.topic, detail.topic);
    record(`Detail status matches for ${s.id}`, s.status, detail.status);
  }

  // 8. Specific Final Test Schedule Check
  const finalTestSchedule = schedules.find(
    (s) => s.class?.batch?.name === "GHI-07" && s.topic === "FINAL TEST"
  );
  record("Final Test schedule found in GHI-07", true, Boolean(finalTestSchedule));
  record(
    "Final Test schedule subject is 'General English Conversation'",
    "General English Conversation",
    finalTestSchedule.subject.name
  );
  record(
    "Final Test schedule topic is 'FINAL TEST'",
    "FINAL TEST",
    finalTestSchedule.topic
  );
  record(
    "Subject is NOT 'General English Conversation (FINAL TEST)'",
    true,
    finalTestSchedule.subject.name !== "General English Conversation (FINAL TEST)"
  );
  record(
    "Final Test schedule date is 2026-09-22",
    "2026-09-22",
    finalTestSchedule.date.substring(0, 10)
  );
  record(
    "Final Test schedule time is 10:15 - 11:45",
    "10:15 - 11:45",
    `${finalTestSchedule.startTime.split("T")[1].substring(0, 5)} - ${finalTestSchedule.endTime.split("T")[1].substring(0, 5)}`
  );

  // 9. Non-existent schedule returns 404
  const notFoundRes = await request("/api/schedules/non-existent-cuid-12345", {
    headers: { Cookie: adminCookies },
  });
  record("Non-existent schedule returns 404", 404, notFoundRes.status);

  // 10. Database Counts Verification
  const [
    users,
    instructors,
    programs,
    batches,
    students,
    enrollments,
    subjects,
    classes,
    dbSchedules,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.instructor.count(),
    prisma.program.count(),
    prisma.batch.count(),
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.subject.count(),
    prisma.class.count(),
    prisma.schedule.count(),
  ]);

  record("DB Users count = 2", 2, users);
  record("DB Instructors count = 6", 6, instructors);
  record("DB Programs count = 1", 1, programs);
  record("DB Batches count = 2", 2, batches);
  record("DB Students count = 21", 21, students);
  record("DB Enrollments count = 21", 21, enrollments);
  record("DB Subjects count = 6", 6, subjects);
  record("DB Classes count = 10", 10, classes);
  record("DB Schedules count = 10", 10, dbSchedules);

  console.log(`\nALL ${results.length} ASSERTIONS PASSED!`);
}

run()
  .catch((e) => {
    console.error("Test execution error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
