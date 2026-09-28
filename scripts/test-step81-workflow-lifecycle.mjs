import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = "http://localhost:3000";

const results = [];

function record(name, expected, actual, category = "GENERAL") {
  const passed = expected === actual;
  results.push({ name, expected, actual, passed, category });
  const statusMark = passed ? "✓" : "✗";
  console.log(`${statusMark} [${category}] ${name}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function mergeCookies(existingCookies, response) {
  const cookieMap = new Map();
  if (existingCookies) {
    existingCookies.split(";").forEach((c) => {
      const trimmed = c.trim();
      if (trimmed) {
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          cookieMap.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
        }
      }
    });
  }

  const setCookieHeaders =
    typeof response.headers?.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers?.get("set-cookie")].filter(Boolean);

  setCookieHeaders.forEach((headerVal) => {
    headerVal.split(",").forEach((cookieStr) => {
      const part = cookieStr.split(";")[0].trim();
      const idx = part.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
    });
  });

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function request(reqPath, options = {}) {
  const url = `${baseUrl}${reqPath}`;
  return fetch(url, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

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

async function api(method, apiPath, cookies = "", body = undefined, customHeaders = {}) {
  const headers = {
    "X-Forwarded-For": "198.51.100.81",
    ...customHeaders,
  };
  if (cookies) {
    headers.Cookie = cookies;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await request(apiPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, data: json, headers: res.headers };
}

async function main() {
  assertSafeMutationTarget({
    mutationFlag: "STEP81_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "STEP81_TEST_CONFIRM_DATABASE",
    baseUrl,
  });
  console.log("==================================================");
  console.log("STEP 81: WORKFLOW LIFECYCLE & CROSS-MODULE AUDIT");
  console.log("==================================================\n");

  const cleanup = {
    users: [],
    employers: [],
    vacancies: [],
    applications: [],
    interviews: [],
    placements: [],
    certificates: [],
    classes: [],
    schedules: [],
    attendances: [],
    assessments: [],
    scores: [],
    enrollments: [],
  };

  try {
    const adminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    const adminCookies = await login("admin.demo@ghs.local", adminPassword);
    const studentCookies = await login("student.demo@ghs.local", studentPassword);

    // Create temporary Management user for RBAC testing
    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    const salt = await bcrypt.genSalt(10);
    const mgmtPasswordHash = await bcrypt.hash("management123", salt);

    const testMgmtUser = await prisma.user.create({
      data: {
        email: "management.test81@ghs.local",
        passwordHash: mgmtPasswordHash,
        name: "Test Management Officer",
        roleId: mgmtRole.id,
      },
    });
    cleanup.users.push(testMgmtUser.id);
    const mgmtCookies = await login("management.test81@ghs.local", "management123");

    // Retrieve baseline entities
    const program = await prisma.program.findFirst();
    const batchGHI07 = await prisma.batch.findFirst({ where: { name: { contains: "GHI-07" } } });
    const batchGHI08 = await prisma.batch.findFirst({ where: { name: { contains: "GHI-08" } } });
    const instructor = await prisma.instructor.findFirst();
    const subject = await prisma.subject.findFirst();

    // Student demo record (Tiara Ismi Laila)
    const demoStudent = await prisma.student.findFirst({
      where: { user: { email: "student.demo@ghs.local" } },
    });

    // Other student (Rafli Aulia Rahman) for IDOR checks
    const otherStudent = await prisma.student.findFirst({
      where: { nim: "260405064" },
    });

    // ==========================================
    // 1. ENROLLMENT LIFECYCLE (A)
    // ==========================================
    console.log("\n--- PART 1: ENROLLMENT LIFECYCLE ---");

    const baselineEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: demoStudent.id, batchId: batchGHI07.id },
    });

    // A1. Valid enrollment fetch
    const resA1 = await api("GET", `/api/enrollments/${baselineEnrollment.id}`, adminCookies);
    record("A1. Enrollment read -> 200 OK with status ACTIVE", 200, resA1.status, "ENROLLMENT");
    record("A1b. Current status is ACTIVE", "ACTIVE", resA1.data?.data?.status, "ENROLLMENT");

    // A2. Academic staff / Admin updates enrollment notes and status
    const resA2 = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminCookies, {
      status: "COMPLETED",
      notes: "Audit Test Completed",
    });
    record("A2. Admin PATCH enrollment status -> 200 OK", 200, resA2.status, "ENROLLMENT");
    record("A2b. Updated status is COMPLETED", "COMPLETED", resA2.data?.data?.status, "ENROLLMENT");

    // A3. Backend allows arbitrary status transitions (confirms absence of restrictive transition matrix)
    const resA3 = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminCookies, {
      status: "ACTIVE",
      notes: "Restored to ACTIVE",
    });
    record("A3. Arbitrary status transition allowed in backend (TBD_GHS_DECISION) -> 200 OK", 200, resA3.status, "ENROLLMENT");

    // A4. Student cannot update enrollment -> 403 Forbidden
    const resA4 = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, studentCookies, {
      status: "DROPPED",
    });
    record("A4. Student PATCH /api/enrollments/:id -> 403 Forbidden", 403, resA4.status, "ENROLLMENT");

    // A5. Management cannot update enrollment -> 403 Forbidden
    const resA5 = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, mgmtCookies, {
      status: "DROPPED",
    });
    record("A5. Management PATCH /api/enrollments/:id -> 403 Forbidden", 403, resA5.status, "ENROLLMENT");

    // A6. DELETE enrollment -> 405 Method Not Allowed
    const resA6 = await api("DELETE", `/api/enrollments/${baselineEnrollment.id}`, adminCookies);
    record("A6. DELETE /api/enrollments/:id -> 405 Method Not Allowed", 405, resA6.status, "ENROLLMENT");

    // ==========================================
    // 2. ATTENDANCE LIFECYCLE (B)
    // ==========================================
    console.log("\n--- PART 2: ATTENDANCE LIFECYCLE ---");

    const testClass = await prisma.class.create({
      data: {
        name: "Step 81 Lifecycle Test Class",
        batchId: batchGHI07.id,
        instructorId: instructor.id,
      },
    });
    cleanup.classes.push(testClass.id);

    const testSchedule = await prisma.schedule.create({
      data: {
        classId: testClass.id,
        subjectId: subject.id,
        instructorId: instructor.id,
        date: new Date("2026-12-01T00:00:00.000Z"),
        startTime: new Date("2026-12-01T08:00:00.000Z"),
        endTime: new Date("2026-12-01T09:30:00.000Z"),
        topic: "Step 81 Attendance Lifecycle",
      },
    });
    cleanup.schedules.push(testSchedule.id);

    // B1. Valid PRESENT: absenceType=null, lateMinutes=null -> 201 Created
    const resB1 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testSchedule.id,
      studentId: demoStudent.id,
      status: "PRESENT",
    });
    record("B1. Valid PRESENT (absenceType=null, lateMinutes=null) -> 201 Created", 201, resB1.status, "ATTENDANCE");
    const testAttendanceId = resB1.data?.data?.id;
    if (testAttendanceId) cleanup.attendances.push(testAttendanceId);

    // B2. Invalid combination: PRESENT with absenceType -> 400 Bad Request
    const testScheduleB2 = await prisma.schedule.create({
      data: {
        classId: testClass.id,
        subjectId: subject.id,
        instructorId: instructor.id,
        date: new Date("2026-12-02T00:00:00.000Z"),
        startTime: new Date("2026-12-02T08:00:00.000Z"),
        endTime: new Date("2026-12-02T09:30:00.000Z"),
        topic: "Step 81 Schedule B2",
      },
    });
    cleanup.schedules.push(testScheduleB2.id);

    const resB2 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "PRESENT",
      absenceType: "SICK",
    });
    record("B2. Invalid combination: PRESENT with absenceType -> 400 Bad Request", 400, resB2.status, "ATTENDANCE");

    // B3. Invalid combination: PRESENT with lateMinutes -> 400 Bad Request
    const resB3 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "PRESENT",
      lateMinutes: 10,
    });
    record("B3. Invalid combination: PRESENT with lateMinutes -> 400 Bad Request", 400, resB3.status, "ATTENDANCE");

    // B4. Invalid combination: LATE without lateMinutes -> 400 Bad Request
    const resB4 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "LATE",
    });
    record("B4. Invalid combination: LATE without lateMinutes -> 400 Bad Request", 400, resB4.status, "ATTENDANCE");

    // B5. Invalid combination: LATE with lateMinutes <= 0 -> 400 Bad Request
    const resB5 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "LATE",
      lateMinutes: 0,
    });
    record("B5. Invalid combination: LATE with lateMinutes <= 0 -> 400 Bad Request", 400, resB5.status, "ATTENDANCE");

    // B6. Invalid combination: ABSENT without absenceType -> 400 Bad Request
    const resB6 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "ABSENT",
    });
    record("B6. Invalid combination: ABSENT without absenceType -> 400 Bad Request", 400, resB6.status, "ATTENDANCE");

    // B7. Valid LATE: lateMinutes=15, absenceType=null -> 201 Created
    const resB7 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "LATE",
      lateMinutes: 15,
    });
    record("B7. Valid LATE (lateMinutes=15, absenceType=null) -> 201 Created", 201, resB7.status, "ATTENDANCE");
    if (resB7.data?.data?.id) cleanup.attendances.push(resB7.data.data.id);

    // B8. Duplicate attendance on same schedule -> 409 Conflict
    const resB8 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testScheduleB2.id,
      studentId: demoStudent.id,
      status: "ABSENT",
      absenceType: "SICK",
    });
    record("B8. Duplicate attendance on same schedule -> 409 Conflict", 409, resB8.status, "ATTENDANCE");

    // B9. PATCH transition from PRESENT to LATE (with lateMinutes)
    const resB9 = await api("PATCH", `/api/attendances/${testAttendanceId}`, adminCookies, {
      status: "LATE",
      lateMinutes: 20,
    });
    record("B9. PATCH attendance status transition (PRESENT -> LATE) -> 200 OK", 200, resB9.status, "ATTENDANCE");

    // B10. Student attempting to PATCH attendance -> 403 Forbidden
    const resB10 = await api("PATCH", `/api/attendances/${testAttendanceId}`, studentCookies, {
      status: "PRESENT",
      lateMinutes: null,
    });
    record("B10. Student PATCH /api/attendances/:id -> 403 Forbidden", 403, resB10.status, "ATTENDANCE");

    // B11. DELETE attendance -> 405 Method Not Allowed
    const resB11 = await api("DELETE", `/api/attendances/${testAttendanceId}`, adminCookies);
    record("B11. DELETE /api/attendances/:id -> 405 Method Not Allowed", 405, resB11.status, "ATTENDANCE");

    // ==========================================
    // 3. ASSESSMENT LIFECYCLE (C)
    // ==========================================
    console.log("\n--- PART 3: ASSESSMENT LIFECYCLE ---");

    const resC1 = await api("POST", "/api/assessments", adminCookies, {
      classId: testClass.id,
      subjectId: subject.id,
      name: "Step 81 Midterm Exam",
      type: "EXAM",
      maxScore: 100,
    });
    record("C1. Assessment created with status OPEN -> 201 Created", 201, resC1.status, "ASSESSMENT");
    const testAssessmentId = resC1.data?.id;
    if (testAssessmentId) cleanup.assessments.push(testAssessmentId);

    // C2. Score created within bounds (0 <= score <= maxScore)
    const resC2 = await api("POST", `/api/assessments/${testAssessmentId}/scores`, adminCookies, {
      studentId: demoStudent.id,
      score: 85,
      feedback: "Well done",
    });
    record("C2. Assessment score created within bounds -> 201 Created", 201, resC2.status, "ASSESSMENT");
    const testScoreId = resC2.data?.id;
    if (testScoreId) cleanup.scores.push(testScoreId);

    // C3. Score above maxScore -> 400 Bad Request
    const resC3 = await api("POST", `/api/assessments/${testAssessmentId}/scores`, adminCookies, {
      studentId: otherStudent.id,
      score: 110,
    });
    record("C3. Score above maxScore -> 400 Bad Request", 400, resC3.status, "ASSESSMENT");

    // C4. Duplicate score for same student -> 409 Conflict
    const resC4 = await api("POST", `/api/assessments/${testAssessmentId}/scores`, adminCookies, {
      studentId: demoStudent.id,
      score: 90,
    });
    record("C4. Duplicate score on same assessment -> 409 Conflict", 409, resC4.status, "ASSESSMENT");

    // C5. Assessment PATCH transition OPEN -> COMPLETED
    const resC5 = await api("PATCH", `/api/assessments/${testAssessmentId}`, adminCookies, {
      status: "COMPLETED",
    });
    record("C5. Assessment status transition (OPEN -> COMPLETED) -> 200 OK", 200, resC5.status, "ASSESSMENT");

    // C6. Score can still be edited when Assessment is COMPLETED (confirmed TBD policy in Step 66C)
    const resC6 = await api("PATCH", `/api/assessments/${testAssessmentId}/scores/${testScoreId}`, adminCookies, {
      score: 88,
      feedback: "Recalibrated score",
    });
    record("C6. Score editable after assessment COMPLETED (confirmed TBD policy) -> 200 OK", 200, resC6.status, "ASSESSMENT");

    // C7. Lowering maxScore below existing score (88) is rejected
    const resC7 = await api("PATCH", `/api/assessments/${testAssessmentId}`, adminCookies, {
      maxScore: 80,
    });
    record("C7. Lowering maxScore below existing score -> 400 Bad Request", 400, resC7.status, "ASSESSMENT");

    // C8. Student attempting to PATCH assessment -> 403 Forbidden
    const resC8 = await api("PATCH", `/api/assessments/${testAssessmentId}`, studentCookies, {
      status: "OPEN",
    });
    record("C8. Student PATCH /api/assessments/:id -> 403 Forbidden", 403, resC8.status, "ASSESSMENT");

    // C9. DELETE assessment -> 405 Method Not Allowed
    const resC9 = await api("DELETE", `/api/assessments/${testAssessmentId}`, adminCookies);
    record("C9. DELETE /api/assessments/:id -> 405 Method Not Allowed", 405, resC9.status, "ASSESSMENT");

    // ==========================================
    // 4. APPLICATION LIFECYCLE (D)
    // ==========================================
    console.log("\n--- PART 4: APPLICATION LIFECYCLE ---");

    // Create test employer and vacancies
    const employer = await prisma.employer.create({
      data: {
        name: "Grand Hotel & Suites",
        address: "Jl. Sudirman No. 1",
        contactName: "HR Manager",
        contactEmail: "hr@grandhotel.local",
        contactPhone: "08123456789",
      },
    });
    cleanup.employers.push(employer.id);

    const openVacancy = await prisma.vacancy.create({
      data: {
        employerId: employer.id,
        title: "Front Desk Officer",
        description: "Front desk operations",
        requirements: "English fluency, hospitality degree",
        status: "OPEN",
      },
    });
    cleanup.vacancies.push(openVacancy.id);

    const closedVacancy = await prisma.vacancy.create({
      data: {
        employerId: employer.id,
        title: "Closed Concierge",
        description: "Closed role",
        requirements: "None",
        status: "CLOSED",
      },
    });
    cleanup.vacancies.push(closedVacancy.id);

    // D1. Application created with status APPLIED
    const resD1 = await api("POST", "/api/applications", studentCookies, {
      vacancyId: openVacancy.id,
      notes: "Student initial application",
    });
    record("D1. Student POST /api/applications -> 201 Created with status APPLIED", 201, resD1.status, "APPLICATION");
    record("D1b. Initial status is APPLIED", "APPLIED", resD1.data?.status, "APPLICATION");
    const testApp1Id = resD1.data?.id;
    if (testApp1Id) cleanup.applications.push(testApp1Id);

    // D2. Valid transition: APPLIED -> SCREENING
    const resD2 = await api("PATCH", `/api/applications/${testApp1Id}`, adminCookies, {
      status: "SCREENING",
    });
    record("D2. Valid transition (APPLIED -> SCREENING) -> 200 OK", 200, resD2.status, "APPLICATION");

    // D3. Valid transition: SCREENING -> INTERVIEW
    const resD3 = await api("PATCH", `/api/applications/${testApp1Id}`, adminCookies, {
      status: "INTERVIEW",
    });
    record("D3. Valid transition (SCREENING -> INTERVIEW) -> 200 OK", 200, resD3.status, "APPLICATION");

    // D4. Valid transition: INTERVIEW -> SELECTED
    const resD4 = await api("PATCH", `/api/applications/${testApp1Id}`, adminCookies, {
      status: "SELECTED",
    });
    record("D4. Valid transition (INTERVIEW -> SELECTED) -> 200 OK", 200, resD4.status, "APPLICATION");

    // D5. Terminal state SELECTED cannot transition to any status -> 409 Conflict
    const resD5 = await api("PATCH", `/api/applications/${testApp1Id}`, adminCookies, {
      status: "REJECTED",
    });
    record("D5. Terminal state SELECTED cannot transition -> 409 Conflict", 409, resD5.status, "APPLICATION");

    // D6. Invalid transition: fresh app APPLIED directly to SELECTED -> 409 Conflict
    const vacancyD6 = await prisma.vacancy.create({
      data: { employerId: employer.id, title: "F&B Server", description: "Serving", requirements: "Hospitality skills", status: "OPEN" },
    });
    cleanup.vacancies.push(vacancyD6.id);

    const appD6 = await prisma.application.create({
      data: { studentId: otherStudent.id, vacancyId: vacancyD6.id, status: "APPLIED" },
    });
    cleanup.applications.push(appD6.id);

    const resD6 = await api("PATCH", `/api/applications/${appD6.id}`, adminCookies, {
      status: "SELECTED",
    });
    record("D6. Invalid transition (APPLIED -> SELECTED) -> 409 Conflict", 409, resD6.status, "APPLICATION");

    // D7. Valid transition: SCREENING -> REJECTED
    await prisma.application.update({ where: { id: appD6.id }, data: { status: "SCREENING" } });
    const resD7 = await api("PATCH", `/api/applications/${appD6.id}`, adminCookies, {
      status: "REJECTED",
    });
    record("D7. Valid transition (SCREENING -> REJECTED) -> 200 OK", 200, resD7.status, "APPLICATION");

    // D8. Terminal state REJECTED cannot transition -> 409 Conflict
    const resD8 = await api("PATCH", `/api/applications/${appD6.id}`, adminCookies, {
      status: "INTERVIEW",
    });
    record("D8. Terminal state REJECTED cannot transition -> 409 Conflict", 409, resD8.status, "APPLICATION");

    // D9. Student can withdraw application when status is APPLIED -> 200 OK
    const vacancyD9 = await prisma.vacancy.create({
      data: { employerId: employer.id, title: "Housekeeper", description: "Cleaning", requirements: "Physical fitness", status: "OPEN" },
    });
    cleanup.vacancies.push(vacancyD9.id);

    const appD9 = await prisma.application.create({
      data: { studentId: demoStudent.id, vacancyId: vacancyD9.id, status: "APPLIED" },
    });
    cleanup.applications.push(appD9.id);

    const resD9 = await api("PATCH", `/api/applications/${appD9.id}`, studentCookies, {
      status: "WITHDRAWN",
    });
    record("D9. Student withdrawal (APPLIED -> WITHDRAWN) -> 200 OK", 200, resD9.status, "APPLICATION");

    // D10. Terminal state WITHDRAWN cannot transition -> 409 Conflict
    const resD10 = await api("PATCH", `/api/applications/${appD9.id}`, adminCookies, {
      status: "APPLIED",
    });
    record("D10. Terminal state WITHDRAWN cannot transition -> 409 Conflict", 409, resD10.status, "APPLICATION");

    // D11. Student cannot withdraw application when status is SCREENING -> 409 Conflict
    const vacancyD11 = await prisma.vacancy.create({
      data: { employerId: employer.id, title: "Barista", description: "Coffee making", requirements: "Experience", status: "OPEN" },
    });
    cleanup.vacancies.push(vacancyD11.id);

    const appD11 = await prisma.application.create({
      data: { studentId: demoStudent.id, vacancyId: vacancyD11.id, status: "SCREENING" },
    });
    cleanup.applications.push(appD11.id);

    const resD11 = await api("PATCH", `/api/applications/${appD11.id}`, studentCookies, {
      status: "WITHDRAWN",
    });
    record("D11. Student withdraw on SCREENING status -> 409 Conflict", 409, resD11.status, "APPLICATION");

    // D12. Student cannot set status to SCREENING or SELECTED -> 403 Forbidden
    const resD12 = await api("PATCH", `/api/applications/${appD11.id}`, studentCookies, {
      status: "SELECTED",
    });
    record("D12. Student setting status to SELECTED -> 403 Forbidden", 403, resD12.status, "APPLICATION");

    // D13. Student cannot edit application notes -> 403 Forbidden
    const resD13 = await api("PATCH", `/api/applications/${appD11.id}`, studentCookies, {
      notes: "Student editing notes",
    });
    record("D13. Student editing application notes -> 403 Forbidden", 403, resD13.status, "APPLICATION");

    // D14. DELETE application -> 405 Method Not Allowed
    const resD14 = await api("DELETE", `/api/applications/${appD11.id}`, adminCookies);
    record("D14. DELETE /api/applications/:id -> 405 Method Not Allowed", 405, resD14.status, "APPLICATION");

    // ==========================================
    // 5. INTERVIEW LIFECYCLE (E)
    // ==========================================
    console.log("\n--- PART 5: INTERVIEW LIFECYCLE ---");

    // Create fresh application in INTERVIEW status for interview lifecycle tests
    const vacancyE = await prisma.vacancy.create({
      data: { employerId: employer.id, title: "Sous Chef", description: "Culinary operations", requirements: "Culinary arts", status: "OPEN" },
    });
    cleanup.vacancies.push(vacancyE.id);

    const appE = await prisma.application.create({
      data: { studentId: demoStudent.id, vacancyId: vacancyE.id, status: "INTERVIEW" },
    });
    cleanup.applications.push(appE.id);

    // E1. Interview created with status PENDING
    const resE1 = await api("POST", "/api/interviews", adminCookies, {
      applicationId: appE.id,
      scheduledAt: new Date("2026-12-10T10:00:00.000Z").toISOString(),
      method: "In-Person",
      location: "GHS Interview Room A",
    });
    record("E1. Interview created with status PENDING -> 201 Created", 201, resE1.status, "INTERVIEW");
    record("E1b. Initial status is PENDING", "PENDING", resE1.data?.status, "INTERVIEW");
    const testInterview1Id = resE1.data?.id;
    if (testInterview1Id) cleanup.interviews.push(testInterview1Id);

    // E2. Valid transition: PENDING -> RESCHEDULED (updates in place)
    const newScheduledAt = new Date("2026-12-11T14:00:00.000Z").toISOString();
    const resE2 = await api("PATCH", `/api/interviews/${testInterview1Id}`, adminCookies, {
      status: "RESCHEDULED",
      scheduledAt: newScheduledAt,
      notes: "Candidate requested reschedule",
    });
    record("E2. Valid transition (PENDING -> RESCHEDULED in place) -> 200 OK", 200, resE2.status, "INTERVIEW");
    record("E2b. Status is RESCHEDULED", "RESCHEDULED", resE2.data?.status, "INTERVIEW");

    // E3. Valid transition: RESCHEDULED -> PASSED
    const resE3 = await api("PATCH", `/api/interviews/${testInterview1Id}`, adminCookies, {
      status: "PASSED",
      feedback: "Strong hospitality skills",
    });
    record("E3. Valid transition (RESCHEDULED -> PASSED) -> 200 OK", 200, resE3.status, "INTERVIEW");
    record("E3b. Status is PASSED", "PASSED", resE3.data?.status, "INTERVIEW");

    // E4. Terminal state PASSED cannot transition or be updated -> 409 Conflict
    const resE4 = await api("PATCH", `/api/interviews/${testInterview1Id}`, adminCookies, {
      status: "FAILED",
    });
    record("E4. Terminal state PASSED cannot transition -> 409 Conflict", 409, resE4.status, "INTERVIEW");

    // E5. Valid transition: fresh interview PENDING -> FAILED
    const interviewE5 = await prisma.interview.create({
      data: {
        applicationId: appE.id,
        scheduledAt: new Date("2026-12-12T10:00:00.000Z"),
        method: "Online",
        status: "PENDING",
      },
    });
    cleanup.interviews.push(interviewE5.id);

    const resE5 = await api("PATCH", `/api/interviews/${interviewE5.id}`, adminCookies, {
      status: "FAILED",
      feedback: "Did not meet language proficiency",
    });
    record("E5. Valid transition (PENDING -> FAILED) -> 200 OK", 200, resE5.status, "INTERVIEW");

    // E6. Terminal state FAILED cannot transition -> 409 Conflict
    const resE6 = await api("PATCH", `/api/interviews/${interviewE5.id}`, adminCookies, {
      status: "RESCHEDULED",
    });
    record("E6. Terminal state FAILED cannot transition -> 409 Conflict", 409, resE6.status, "INTERVIEW");

    // E7. Scheduling interview for REJECTED application -> 409 Conflict
    const resE7 = await api("POST", "/api/interviews", adminCookies, {
      applicationId: appD6.id, // Currently REJECTED from Part 4
      scheduledAt: new Date("2026-12-15T10:00:00.000Z").toISOString(),
    });
    record("E7. Scheduling interview for REJECTED application -> 409 Conflict", 409, resE7.status, "INTERVIEW");

    // E8. Scheduling interview for WITHDRAWN application -> 409 Conflict
    const resE8 = await api("POST", "/api/interviews", adminCookies, {
      applicationId: appD9.id, // Currently WITHDRAWN from Part 4
      scheduledAt: new Date("2026-12-15T10:00:00.000Z").toISOString(),
    });
    record("E8. Scheduling interview for WITHDRAWN application -> 409 Conflict", 409, resE8.status, "INTERVIEW");

    // E9. Student attempting to create or update interview -> 403 Forbidden
    const resE9a = await api("POST", "/api/interviews", studentCookies, {
      applicationId: appE.id,
      scheduledAt: new Date("2026-12-15T10:00:00.000Z").toISOString(),
    });
    record("E9a. Student POST /api/interviews -> 403 Forbidden", 403, resE9a.status, "INTERVIEW");

    const resE9b = await api("PATCH", `/api/interviews/${interviewE5.id}`, studentCookies, {
      feedback: "Attempted student feedback",
    });
    record("E9b. Student PATCH /api/interviews/:id -> 403 Forbidden", 403, resE9b.status, "INTERVIEW");

    // E10. DELETE interview -> 405 Method Not Allowed
    const resE10 = await api("DELETE", `/api/interviews/${interviewE5.id}`, adminCookies);
    record("E10. DELETE /api/interviews/:id -> 405 Method Not Allowed", 405, resE10.status, "INTERVIEW");

    // ==========================================
    // 6. PLACEMENT LIFECYCLE (F)
    // ==========================================
    console.log("\n--- PART 6: PLACEMENT LIFECYCLE ---");

    // F1. Placement created with status PREPARATION
    const resF1 = await api("POST", "/api/placements", adminCookies, {
      studentId: demoStudent.id,
      employerId: employer.id,
      vacancyId: openVacancy.id,
      applicationId: testApp1Id,
      position: "Front Desk Agent",
      startDate: new Date("2027-01-15T00:00:00.000Z").toISOString(),
    });
    record("F1. Placement created with status PREPARATION -> 201 Created", 201, resF1.status, "PLACEMENT");
    record("F1b. Initial status is PREPARATION", "PREPARATION", resF1.data?.data?.status, "PLACEMENT");
    const testPlacement1Id = resF1.data?.data?.id;
    if (testPlacement1Id) cleanup.placements.push(testPlacement1Id);

    // F2. Valid transition: PREPARATION -> READY
    const resF2 = await api("PATCH", `/api/placements/${testPlacement1Id}`, adminCookies, {
      status: "READY",
      notes: "Visa and documents verified",
    });
    record("F2. Valid transition (PREPARATION -> READY) -> 200 OK", 200, resF2.status, "PLACEMENT");

    // F3. Valid transition: READY -> DEPARTED
    const resF3 = await api("PATCH", `/api/placements/${testPlacement1Id}`, adminCookies, {
      status: "DEPARTED",
      notes: "Candidate departed to job location",
    });
    record("F3. Valid transition (READY -> DEPARTED) -> 200 OK", 200, resF3.status, "PLACEMENT");

    // F4. Valid transition: DEPARTED -> PLACED
    const resF4 = await api("PATCH", `/api/placements/${testPlacement1Id}`, adminCookies, {
      status: "PLACED",
      notes: "On-site reporting completed",
    });
    record("F4. Valid transition (DEPARTED -> PLACED) -> 200 OK", 200, resF4.status, "PLACEMENT");

    // F5. Terminal state PLACED cannot transition to any status -> 409 Conflict
    const resF5 = await api("PATCH", `/api/placements/${testPlacement1Id}`, adminCookies, {
      status: "CANCELLED",
    });
    record("F5. Terminal state PLACED cannot transition -> 409 Conflict", 409, resF5.status, "PLACEMENT");

    // F6. Valid cancellation: PREPARATION -> CANCELLED
    const placementF6 = await prisma.placement.create({
      data: {
        studentId: otherStudent.id,
        employerId: employer.id,
        position: "Pastry Assistant",
        status: "PREPARATION",
      },
    });
    cleanup.placements.push(placementF6.id);

    const resF6 = await api("PATCH", `/api/placements/${placementF6.id}`, adminCookies, {
      status: "CANCELLED",
      notes: "Candidate declined offer",
    });
    record("F6. Valid cancellation (PREPARATION -> CANCELLED) -> 200 OK", 200, resF6.status, "PLACEMENT");

    // F7. Terminal state CANCELLED cannot transition -> 409 Conflict
    const resF7 = await api("PATCH", `/api/placements/${placementF6.id}`, adminCookies, {
      status: "READY",
    });
    record("F7. Terminal state CANCELLED cannot transition -> 409 Conflict", 409, resF7.status, "PLACEMENT");

    // F8. Cross-student linkage: application.studentId != placement.studentId -> 400 Bad Request
    const resF8 = await api("POST", "/api/placements", adminCookies, {
      studentId: otherStudent.id,
      employerId: employer.id,
      applicationId: appE.id, // belongs to demoStudent
      position: "Cross Link Position",
    });
    record("F8. Cross-student linkage (application.studentId != placement.studentId) -> 400 Bad Request", 400, resF8.status, "PLACEMENT");

    // F9. Duplicate placement for same application -> 409 Conflict
    const resF9 = await api("POST", "/api/placements", adminCookies, {
      studentId: demoStudent.id,
      employerId: employer.id,
      applicationId: testApp1Id, // already has testPlacement1Id
      position: "Duplicate Placement Position",
    });
    record("F9. Duplicate placement for same application -> 409 Conflict", 409, resF9.status, "PLACEMENT");

    // F10. Student attempting to create or update placement -> 403 Forbidden
    const resF10a = await api("POST", "/api/placements", studentCookies, {
      studentId: demoStudent.id,
      employerId: employer.id,
      position: "Unauthorized Placement",
    });
    record("F10a. Student POST /api/placements -> 403 Forbidden", 403, resF10a.status, "PLACEMENT");

    const resF10b = await api("PATCH", `/api/placements/${placementF6.id}`, studentCookies, {
      status: "READY",
    });
    record("F10b. Student PATCH /api/placements/:id -> 403 Forbidden", 403, resF10b.status, "PLACEMENT");

    // F11. DELETE placement -> 405 Method Not Allowed
    const resF11 = await api("DELETE", `/api/placements/${placementF6.id}`, adminCookies);
    record("F11. DELETE /api/placements/:id -> 405 Method Not Allowed", 405, resF11.status, "PLACEMENT");

    // ==========================================
    // 7. CERTIFICATE LIFECYCLE (G)
    // ==========================================
    console.log("\n--- PART 7: CERTIFICATE LIFECYCLE ---");

    const certNumber1 = `CERT-81-${Date.now()}`;
    const resG1 = await api("POST", "/api/certificates", adminCookies, {
      studentId: demoStudent.id,
      programId: program.id,
      batchId: batchGHI07.id,
      certificateNumber: certNumber1,
      issuedAt: new Date("2026-11-01T00:00:00.000Z").toISOString(),
      path: "certificates/test-cert-81.pdf",
    });
    record("G1. Certificate created with status ACTIVE -> 201 Created", 201, resG1.status, "CERTIFICATE");
    record("G1b. Initial status is ACTIVE", "ACTIVE", resG1.data?.data?.status, "CERTIFICATE");
    const testCert1Id = resG1.data?.data?.id;
    if (testCert1Id) cleanup.certificates.push(testCert1Id);

    // G2. Duplicate certificateNumber -> 409 Conflict
    const resG2 = await api("POST", "/api/certificates", adminCookies, {
      studentId: otherStudent.id,
      programId: program.id,
      batchId: batchGHI07.id,
      certificateNumber: certNumber1,
      issuedAt: new Date("2026-11-01T00:00:00.000Z").toISOString(),
    });
    record("G2. Duplicate certificateNumber -> 409 Conflict", 409, resG2.status, "CERTIFICATE");

    // G3. Revocation: ACTIVE -> REVOKED
    const resG3 = await api("PATCH", `/api/certificates/${testCert1Id}/revoke`, adminCookies, {
      reason: "Audit Test Revocation",
    });
    record("G3. Certificate revocation (ACTIVE -> REVOKED) -> 200 OK", 200, resG3.status, "CERTIFICATE");
    record("G3b. Status is REVOKED", "REVOKED", resG3.data?.data?.status, "CERTIFICATE");

    // G4. Revocation is idempotent
    const resG4 = await api("PATCH", `/api/certificates/${testCert1Id}/revoke`, adminCookies, {
      reason: "Second Revoke Attempt",
    });
    record("G4. Certificate revocation idempotent on already REVOKED -> 200 OK", 200, resG4.status, "CERTIFICATE");

    // G5. Student attempting to create certificate -> 403 Forbidden
    const resG5 = await api("POST", "/api/certificates", studentCookies, {
      studentId: demoStudent.id,
      programId: program.id,
      batchId: batchGHI07.id,
      certificateNumber: `UNAUTH-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("G5. Student POST /api/certificates -> 403 Forbidden", 403, resG5.status, "CERTIFICATE");

    // G6. Student attempting to revoke certificate -> 403 Forbidden
    const resG6 = await api("PATCH", `/api/certificates/${testCert1Id}/revoke`, studentCookies, {
      reason: "Student unauthorized revoke",
    });
    record("G6. Student PATCH /api/certificates/:id/revoke -> 403 Forbidden", 403, resG6.status, "CERTIFICATE");

    // G7. DELETE certificate -> 405 Method Not Allowed
    const resG7 = await api("DELETE", `/api/certificates/${testCert1Id}`, adminCookies);
    record("G7. DELETE /api/certificates/:id -> 405 Method Not Allowed", 405, resG7.status, "CERTIFICATE");

    // ==========================================
    // 8. CROSS-MODULE REFERENCE INTEGRITY (H)
    // ==========================================
    console.log("\n--- PART 8: CROSS-MODULE REFERENCE INTEGRITY ---");

    const ghi08Student = await prisma.student.findFirst({
      where: { enrollments: { some: { batchId: batchGHI08.id } } },
    });

    // H1. Student attendance on schedule from un-enrolled batch -> 400 Bad Request
    const resH1 = await api("POST", "/api/attendances", adminCookies, {
      scheduleId: testSchedule.id,
      studentId: ghi08Student.id,
      status: "PRESENT",
    });
    record("H1. Attendance cross-batch validation -> 400 Bad Request", 400, resH1.status, "CROSS_MODULE");

    // H2. Score cross-batch validation -> 400 Bad Request
    const resH2 = await api("POST", `/api/assessments/${testAssessmentId}/scores`, adminCookies, {
      studentId: ghi08Student.id,
      score: 80,
    });
    record("H2. Assessment score cross-batch validation -> 400 Bad Request", 400, resH2.status, "CROSS_MODULE");

    // H3. Application referencing nonexistent vacancy -> 404 Not Found
    const resH3 = await api("POST", "/api/applications", studentCookies, {
      vacancyId: "c_nonexistent_vacancy_999",
    });
    record("H3. Application referencing nonexistent vacancy -> 404 Not Found", 404, resH3.status, "CROSS_MODULE");

    // H4. Application referencing CLOSED vacancy -> 409 Conflict
    const resH4 = await api("POST", "/api/applications", studentCookies, {
      vacancyId: closedVacancy.id,
    });
    record("H4. Application referencing CLOSED vacancy -> 409 Conflict", 409, resH4.status, "CROSS_MODULE");

    // H5. Interview referencing nonexistent application -> 404 Not Found
    const resH5 = await api("POST", "/api/interviews", adminCookies, {
      applicationId: "c_nonexistent_app_999",
      scheduledAt: new Date().toISOString(),
    });
    record("H5. Interview referencing nonexistent application -> 404 Not Found", 404, resH5.status, "CROSS_MODULE");

    // H6. Placement referencing nonexistent employer -> 404 Not Found
    const resH6 = await api("POST", "/api/placements", adminCookies, {
      studentId: demoStudent.id,
      employerId: "c_nonexistent_employer_999",
      position: "Position",
    });
    record("H6. Placement referencing nonexistent employer -> 404 Not Found", 404, resH6.status, "CROSS_MODULE");

    // H7. Certificate referencing nonexistent student -> 404 Not Found
    const resH7 = await api("POST", "/api/certificates", adminCookies, {
      studentId: "c_nonexistent_student_999",
      programId: program.id,
      batchId: batchGHI07.id,
      certificateNumber: `NONEXIST-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("H7. Certificate referencing nonexistent student -> 404 Not Found", 404, resH7.status, "CROSS_MODULE");

    // ==========================================
    // 9. IDOR & RBAC SECURITY (I)
    // ==========================================
    console.log("\n--- PART 9: IDOR & RBAC SECURITY ---");

    // Create an attendance, application, interview, placement, certificate for otherStudent (Rafli)
    const otherApp = await prisma.application.create({
      data: {
        studentId: otherStudent.id,
        vacancyId: openVacancy.id,
        status: "INTERVIEW",
      },
    });
    cleanup.applications.push(otherApp.id);

    const otherInterview = await prisma.interview.create({
      data: {
        applicationId: otherApp.id,
        scheduledAt: new Date("2026-12-20T10:00:00.000Z"),
        status: "PENDING",
      },
    });
    cleanup.interviews.push(otherInterview.id);

    const otherPlacement = await prisma.placement.create({
      data: {
        studentId: otherStudent.id,
        employerId: employer.id,
        position: "Private Placement",
        status: "PREPARATION",
      },
    });
    cleanup.placements.push(otherPlacement.id);

    const otherCert = await prisma.certificate.create({
      data: {
        studentId: otherStudent.id,
        programId: program.id,
        batchId: batchGHI07.id,
        certificateNumber: `OTHER-CERT-${Date.now()}`,
        issuedAt: new Date("2026-11-01T00:00:00.000Z"),
        path: "certificates/other-cert.pdf",
        status: "ACTIVE",
      },
    });
    cleanup.certificates.push(otherCert.id);

    // I1. Student reading other student's application -> 403 Forbidden
    const resI1 = await api("GET", `/api/applications/${otherApp.id}`, studentCookies);
    record("I1. Student reading other student's application -> 403 Forbidden", 403, resI1.status, "RBAC_IDOR");

    // I2. Student reading other student's interview -> 403 Forbidden
    const resI2 = await api("GET", `/api/interviews/${otherInterview.id}`, studentCookies);
    record("I2. Student reading other student's interview -> 403 Forbidden", 403, resI2.status, "RBAC_IDOR");

    // I3. Student reading other student's placement -> 403 Forbidden
    const resI3 = await api("GET", `/api/placements/${otherPlacement.id}`, studentCookies);
    record("I3. Student reading other student's placement -> 403 Forbidden", 403, resI3.status, "RBAC_IDOR");

    // I4. Student reading other student's certificate -> 403 Forbidden
    const resI4 = await api("GET", `/api/certificates/${otherCert.id}`, studentCookies);
    record("I4. Student reading other student's certificate -> 403 Forbidden", 403, resI4.status, "RBAC_IDOR");

    // I5. Student downloading other student's certificate -> 403 Forbidden
    const resI5 = await api("GET", `/api/certificates/${otherCert.id}/download`, studentCookies);
    record("I5. Student downloading other student's certificate -> 403 Forbidden", 403, resI5.status, "RBAC_IDOR");

    // I6. Management cannot create application -> 403 Forbidden
    const resI6 = await api("POST", "/api/applications", mgmtCookies, {
      vacancyId: openVacancy.id,
      studentId: demoStudent.id,
    });
    record("I6. Management POST /api/applications -> 403 Forbidden", 403, resI6.status, "RBAC_IDOR");

    // I7. Management cannot create interview -> 403 Forbidden
    const resI7 = await api("POST", "/api/interviews", mgmtCookies, {
      applicationId: otherApp.id,
      scheduledAt: new Date().toISOString(),
    });
    record("I7. Management POST /api/interviews -> 403 Forbidden", 403, resI7.status, "RBAC_IDOR");

    // I8. Management cannot create placement -> 403 Forbidden
    const resI8 = await api("POST", "/api/placements", mgmtCookies, {
      studentId: demoStudent.id,
      employerId: employer.id,
      position: "Unauthorized Mgmt Placement",
    });
    record("I8. Management POST /api/placements -> 403 Forbidden", 403, resI8.status, "RBAC_IDOR");

    // I9. Management cannot create certificate -> 403 Forbidden
    const resI9 = await api("POST", "/api/certificates", mgmtCookies, {
      studentId: demoStudent.id,
      programId: program.id,
      batchId: batchGHI07.id,
      certificateNumber: `MGMT-UNAUTH-${Date.now()}`,
      issuedAt: new Date().toISOString(),
    });
    record("I9. Management POST /api/certificates -> 403 Forbidden", 403, resI9.status, "RBAC_IDOR");

    // ==========================================
    // 10. ACCIDENTAL AUTOMATION CHECKS (L)
    // ==========================================
    console.log("\n--- PART 10: ACCIDENTAL AUTOMATION CHECKS ---");

    // L1. Interview marked PASSED does NOT mutate Application status
    const appFreshForL1 = await prisma.application.create({
      data: { studentId: demoStudent.id, vacancyId: openVacancy.id, status: "INTERVIEW" },
    });
    cleanup.applications.push(appFreshForL1.id);

    const interviewL1 = await prisma.interview.create({
      data: {
        applicationId: appFreshForL1.id,
        scheduledAt: new Date("2026-12-25T10:00:00.000Z"),
        status: "PENDING",
      },
    });
    cleanup.interviews.push(interviewL1.id);

    await api("PATCH", `/api/interviews/${interviewL1.id}`, adminCookies, {
      status: "PASSED",
      feedback: "L1 test feedback",
    });

    const refreshedAppL1 = await prisma.application.findUnique({
      where: { id: appFreshForL1.id },
      select: { status: true },
    });
    record("L1. Interview PASSED does NOT automatically mutate Application status (stays INTERVIEW)", "INTERVIEW", refreshedAppL1.status, "AUTOMATION");

    // L2. Creating Placement does NOT mutate Application status
    const appFreshForL2 = await prisma.application.create({
      data: { studentId: otherStudent.id, vacancyId: openVacancy.id, status: "SELECTED" },
    });
    cleanup.applications.push(appFreshForL2.id);

    const resL2 = await api("POST", "/api/placements", adminCookies, {
      studentId: otherStudent.id,
      employerId: employer.id,
      applicationId: appFreshForL2.id,
      position: "Automation Audit Position",
    });
    if (resL2.data?.data?.id) cleanup.placements.push(resL2.data.data.id);

    const refreshedAppL2 = await prisma.application.findUnique({
      where: { id: appFreshForL2.id },
      select: { status: true },
    });
    record("L2. Creating Placement does NOT automatically mutate Application status (stays SELECTED)", "SELECTED", refreshedAppL2.status, "AUTOMATION");

    // L3. Creating Attendance does NOT mutate Enrollment status
    const freshEnrollmentL3 = await prisma.enrollment.findUnique({
      where: { id: baselineEnrollment.id },
      select: { status: true },
    });
    record("L3. Creating Attendance does NOT mutate Enrollment status (stays ACTIVE)", "ACTIVE", freshEnrollmentL3.status, "AUTOMATION");

    // ==========================================
    // 11. AUDIT LOGGING VERIFICATION (K)
    // ==========================================
    console.log("\n--- PART 11: AUDIT LOGGING INTEGRITY ---");

    const appAudit = await prisma.auditLog.findFirst({
      where: { entity: "Application", entityId: testApp1Id, action: "UPDATE" },
    });
    record("K1. Application status update generates AuditLog", true, Boolean(appAudit), "AUDIT");

    const ivAudit = await prisma.auditLog.findFirst({
      where: { entity: "Interview", entityId: testInterview1Id, action: "UPDATE" },
    });
    record("K2. Interview status update generates AuditLog", true, Boolean(ivAudit), "AUDIT");

    const plAudit = await prisma.auditLog.findFirst({
      where: { entity: "Placement", entityId: testPlacement1Id, action: "STATUS_CHANGE" },
    });
    record("K3. Placement status change generates AuditLog", true, Boolean(plAudit), "AUDIT");

    const certAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: testCert1Id, action: "REVOKE" },
    });
    record("K4. Certificate revocation generates AuditLog", true, Boolean(certAudit), "AUDIT");

  } finally {
    // ==========================================
    // CLEANUP & BASELINE RESTORATION
    // ==========================================
    console.log("\n--- CLEANUP & BASELINE VERIFICATION ---");

    if (cleanup.placements.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Placement", entityId: { in: cleanup.placements } } });
      await prisma.placement.deleteMany({ where: { id: { in: cleanup.placements } } });
    }
    if (cleanup.interviews.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Interview", entityId: { in: cleanup.interviews } } });
      await prisma.interview.deleteMany({ where: { id: { in: cleanup.interviews } } });
    }
    if (cleanup.applications.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Application", entityId: { in: cleanup.applications } } });
      await prisma.application.deleteMany({ where: { id: { in: cleanup.applications } } });
    }
    if (cleanup.certificates.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Certificate", entityId: { in: cleanup.certificates } } });
      await prisma.certificate.deleteMany({ where: { id: { in: cleanup.certificates } } });
    }
    if (cleanup.vacancies.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Vacancy", entityId: { in: cleanup.vacancies } } });
      await prisma.vacancy.deleteMany({ where: { id: { in: cleanup.vacancies } } });
    }
    if (cleanup.employers.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Employer", entityId: { in: cleanup.employers } } });
      await prisma.employer.deleteMany({ where: { id: { in: cleanup.employers } } });
    }
    if (cleanup.scores.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "AssessmentScore", entityId: { in: cleanup.scores } } });
      await prisma.assessmentScore.deleteMany({ where: { id: { in: cleanup.scores } } });
    }
    if (cleanup.assessments.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Assessment", entityId: { in: cleanup.assessments } } });
      await prisma.assessment.deleteMany({ where: { id: { in: cleanup.assessments } } });
    }
    if (cleanup.attendances.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Attendance", entityId: { in: cleanup.attendances } } });
      await prisma.attendance.deleteMany({ where: { id: { in: cleanup.attendances } } });
    }
    if (cleanup.schedules.length > 0) {
      await prisma.attendance.deleteMany({ where: { scheduleId: { in: cleanup.schedules } } });
      await prisma.auditLog.deleteMany({ where: { entity: "Schedule", entityId: { in: cleanup.schedules } } });
      await prisma.schedule.deleteMany({ where: { id: { in: cleanup.schedules } } });
    }
    if (cleanup.classes.length > 0) {
      const classAssessments = await prisma.assessment.findMany({
        where: { classId: { in: cleanup.classes } },
        select: { id: true },
      });
      const aIds = classAssessments.map((a) => a.id);
      if (aIds.length > 0) {
        await prisma.assessmentScore.deleteMany({ where: { assessmentId: { in: aIds } } });
      }
      const classSchedules = await prisma.schedule.findMany({
        where: { classId: { in: cleanup.classes } },
        select: { id: true },
      });
      const sIds = classSchedules.map((s) => s.id);
      if (sIds.length > 0) {
        await prisma.attendance.deleteMany({ where: { scheduleId: { in: sIds } } });
      }
      await prisma.schedule.deleteMany({ where: { classId: { in: cleanup.classes } } });
      await prisma.assessment.deleteMany({ where: { classId: { in: cleanup.classes } } });
      await prisma.auditLog.deleteMany({ where: { entity: "Class", entityId: { in: cleanup.classes } } });
      await prisma.class.deleteMany({ where: { id: { in: cleanup.classes } } });
    }
    if (cleanup.enrollments.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entity: "Enrollment", entityId: { in: cleanup.enrollments } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: cleanup.enrollments } } });
    }
    if (cleanup.users.length > 0) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: cleanup.users } } });
      await prisma.user.deleteMany({ where: { id: { in: cleanup.users } } });
    }

    const [
      users, instructors, programs, batches, students, enrollments,
      subjects, classes, schedules, employers, vacancies, applications,
      interviews, placements, documents, certificates,
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
      prisma.employer.count(),
      prisma.vacancy.count(),
      prisma.application.count(),
      prisma.interview.count(),
      prisma.placement.count(),
      prisma.document.count(),
      prisma.certificate.count(),
    ]);

    record("Baseline Users = 3", 3, users, "BASELINE" /* Updated STEP 88 */);
    record("Baseline Instructors = 6", 6, instructors, "BASELINE");
    record("Baseline Programs = 1", 1, programs, "BASELINE");
    record("Baseline Batches = 2", 2, batches, "BASELINE");
    record("Baseline Students = 21", 21, students, "BASELINE");
    record("Baseline Enrollments = 21", 21, enrollments, "BASELINE");
    record("Baseline Subjects = 6", 6, subjects, "BASELINE");
    record("Baseline Classes = 10", 10, classes, "BASELINE");
    record("Baseline Schedules = 10", 10, schedules, "BASELINE");
    record("Baseline Employers = 0", 0, employers, "BASELINE");
    record("Baseline Vacancies = 0", 0, vacancies, "BASELINE");
    record("Baseline Applications = 0", 0, applications, "BASELINE");
    record("Baseline Interviews = 0", 0, interviews, "BASELINE");
    record("Baseline Placements = 0", 0, placements, "BASELINE");
    record("Baseline Documents = 0", 0, documents, "BASELINE");
    record("Baseline Certificates = 0", 0, certificates, "BASELINE");

    const failed = results.filter((r) => !r.passed);
    const passed = results.filter((r) => r.passed);

    console.log(`\n==================================================`);
    console.log(`STEP 81 TEST SUMMARY: ${passed.length}/${results.length} PASSED`);
    if (failed.length > 0) {
      console.error(`FAILED: ${failed.length} assertions`);
      process.exit(1);
    } else {
      console.log(`ALL ASSERTIONS PASSED!`);
    }
  }
}

main().finally(() => prisma.$disconnect());
