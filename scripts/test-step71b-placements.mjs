// scripts/test-step71b-placements.mjs
// Step 71B: Placement API & Business Logic Comprehensive Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function record(name, expected, actual) {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed });
  if (passed) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function mergeCookies(existingCookies, response) {
  const getSetCookie = response.headers.getSetCookie?.();
  const rawSetCookie =
    getSetCookie || [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();

  if (existingCookies) {
    existingCookies.split(";").forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(
          trimmed.slice(0, idx).trim(),
          trimmed.slice(idx + 1).trim()
        );
      }
    });
  }

  rawSetCookie.forEach((headerVal) => {
    headerVal.split(",").forEach((single) => {
      const part = single.split(";")[0].trim();
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

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
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

async function run() {
  console.log("=== STEP 71B PLACEMENT API & BUSINESS LOGIC TEST SUITE ===\n");

  // Pre-cleanup of any stale test artifacts
  await prisma.user.deleteMany({ where: { email: { contains: "71b" } } }).catch(() => {});
  await prisma.employer.deleteMany({ where: { contactEmail: { contains: "grandsukabumi.test" } } }).catch(() => {});

  const createdUserIds = [];
  const createdRoleIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];
  const createdApplicationIds = [];
  const createdPlacementIds = [];

  let studentA = null;
  let studentB = null;
  let originalStudentBUserId = null;

  try {
    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    async function createTempUser(roleName, email) {
      const roleId = roleMap.get(roleName);
      if (!roleId) throw new Error(`Role ${roleName} not found`);
      const user = await prisma.user.create({
        data: {
          email,
          name: `Temp ${roleName}`,
          passwordHash: tempPasswordHash,
          roleId,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    const superAdminPassword =
      process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("1. Checking Initial Database Baseline...");
    const initialCounts = {
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      instructors: await prisma.instructor.count(),
      users: await prisma.user.count(),
    };

    record("Baseline initial Employers == 0", 0, initialCounts.employers);
    record("Baseline initial Vacancies == 0", 0, initialCounts.vacancies);
    record("Baseline initial Applications == 0", 0, initialCounts.applications);
    record("Baseline initial Interviews == 0", 0, initialCounts.interviews);
    record("Baseline initial Placements == 0", 0, initialCounts.placements);
    record("Baseline initial Documents == 0", 0, initialCounts.documents);
    record("Baseline initial Students == 21", 21, initialCounts.students);
    record("Baseline initial Users == 2", 2, initialCounts.users);

    console.log("2. Authenticating demo users...");
    const superAdminCookies = await login(
      "admin.demo@ghs.local",
      superAdminPassword
    );
    const studentACookies = await login(
      "student.demo@ghs.local",
      studentPassword
    );

    console.log("3. Creating temporary RBAC test users...");
    const adminUser = await createTempUser("ADMIN", "test.admin71b@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic71b@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management71b@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement71b@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor71b@ghs.test"
    );
    const studentBUser = await createTempUser(
      "STUDENT",
      "test.studentb71b@ghs.test"
    );

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);
    const studentBCookies = await login(studentBUser.email, tempPassword);

    console.log("4. Setting up Student A and Student B records...");
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });

    studentA = await prisma.student.findUnique({
      where: { userId: demoStudentUser.id },
    });
    if (!studentA) {
      throw new Error("Student A linked to demo user not found in database.");
    }

    studentB = await prisma.student.findFirst({
      where: { id: { not: studentA.id } },
    });
    if (!studentB) {
      throw new Error("Student B not found in database.");
    }

    originalStudentBUserId = studentB.userId;

    await prisma.student.update({
      where: { id: studentB.id },
      data: { userId: studentBUser.id },
    });

    console.log("5. Creating test Employer, Vacancy, and Applications...");
    const testEmployer = await prisma.employer.create({
      data: {
        name: "Grand Sukabumi Resort & Spa",
        companyInfo: "Luxury 5-star resort",
        address: "Jl. Raya Sukabumi No. 100",
        contactName: "Budi Santoso",
        contactEmail: "hr@grandsukabumi.test",
        contactPhone: "08123456789",
      },
    });
    createdEmployerIds.push(testEmployer.id);

    const testVacancy = await prisma.vacancy.create({
      data: {
        employerId: testEmployer.id,
        title: "Front Desk Officer",
        description: "Front desk operations and guest relations",
        requirements: "Hospitality background, English proficiency",
        status: "OPEN",
      },
    });
    createdVacancyIds.push(testVacancy.id);

    const applicationA = await prisma.application.create({
      data: {
        vacancyId: testVacancy.id,
        studentId: studentA.id,
        status: "SELECTED",
      },
    });
    createdApplicationIds.push(applicationA.id);

    const applicationB = await prisma.application.create({
      data: {
        vacancyId: testVacancy.id,
        studentId: studentB.id,
        status: "SELECTED",
      },
    });
    createdApplicationIds.push(applicationB.id);

    console.log("6. Testing Authentication & RBAC Access on GET /api/placements...");
    // 6.1 Unauthenticated -> 401
    const unauthGetRes = await request("/api/placements");
    record("Unauthenticated GET /api/placements returns 401", 401, unauthGetRes.status);

    // 6.2 Academic Staff -> 403
    const academicGetRes = await request("/api/placements", {
      headers: { Cookie: academicCookies },
    });
    record("Academic Staff GET /api/placements returns 403", 403, academicGetRes.status);

    // 6.3 Instructor -> 403
    const instructorGetRes = await request("/api/placements", {
      headers: { Cookie: instructorCookies },
    });
    record("Instructor GET /api/placements returns 403", 403, instructorGetRes.status);

    // 6.4 Super Admin -> 200
    const superAdminGetRes = await request("/api/placements", {
      headers: { Cookie: superAdminCookies },
    });
    record("Super Admin GET /api/placements returns 200", 200, superAdminGetRes.status);

    // 6.5 Admin -> 200
    const adminGetRes = await request("/api/placements", {
      headers: { Cookie: adminCookies },
    });
    record("Admin GET /api/placements returns 200", 200, adminGetRes.status);

    // 6.6 Placement Staff -> 200
    const placementGetRes = await request("/api/placements", {
      headers: { Cookie: placementCookies },
    });
    record("Placement Staff GET /api/placements returns 200", 200, placementGetRes.status);

    // 6.7 Management -> 200
    const managementGetRes = await request("/api/placements", {
      headers: { Cookie: managementCookies },
    });
    record("Management GET /api/placements returns 200", 200, managementGetRes.status);

    // 6.8 Student -> 200
    const studentGetRes = await request("/api/placements", {
      headers: { Cookie: studentACookies },
    });
    record("Student GET /api/placements returns 200", 200, studentGetRes.status);

    console.log("7. Testing RBAC Access on POST /api/placements (Create)...");
    const validPayloadDirect = {
      studentId: studentA.id,
      employerId: testEmployer.id,
      position: "Commis Chef",
      startDate: "2026-10-01T08:00:00.000Z",
      notes: "Direct placement approved by management",
    };

    // 7.1 Student POST -> 403
    const studentPostRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentACookies },
      body: JSON.stringify(validPayloadDirect),
    });
    record("Student POST /api/placements returns 403", 403, studentPostRes.status);

    // 7.2 Management POST -> 403
    const managementPostRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify(validPayloadDirect),
    });
    record("Management POST /api/placements returns 403", 403, managementPostRes.status);

    // 7.3 Academic Staff POST -> 403
    const academicPostRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: academicCookies },
      body: JSON.stringify(validPayloadDirect),
    });
    record("Academic Staff POST /api/placements returns 403", 403, academicPostRes.status);

    // 7.4 Instructor POST -> 403
    const instructorPostRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: instructorCookies },
      body: JSON.stringify(validPayloadDirect),
    });
    record("Instructor POST /api/placements returns 403", 403, instructorPostRes.status);

    console.log("8. Testing Validation & Relation Integrity on POST /api/placements...");
    // 8.1 Missing required position -> 400
    const invalidBodyRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ studentId: studentA.id, employerId: testEmployer.id }),
    });
    record("Missing required field returns 400", 400, invalidBodyRes.status);

    // 8.2 Client specifying non-PREPARATION status on create -> 400
    const clientStatusRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        status: "READY",
      }),
    });
    record("Client setting status on create returns 400", 400, clientStatusRes.status);

    // 8.3 Non-existent student -> 404
    const nonExistentStudentRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        studentId: "cuid_nonexistent_student_12345",
      }),
    });
    record("Non-existent studentId returns 404", 404, nonExistentStudentRes.status);

    // 8.4 Non-existent employer -> 404
    const nonExistentEmployerRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        employerId: "cuid_nonexistent_employer_12345",
      }),
    });
    record("Non-existent employerId returns 404", 404, nonExistentEmployerRes.status);

    // 8.5 Non-existent vacancy -> 404
    const nonExistentVacancyRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        vacancyId: "cuid_nonexistent_vacancy_12345",
      }),
    });
    record("Non-existent vacancyId returns 404", 404, nonExistentVacancyRes.status);

    // 8.6 Non-existent application -> 404
    const nonExistentAppRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        applicationId: "cuid_nonexistent_app_12345",
      }),
    });
    record("Non-existent applicationId returns 404", 404, nonExistentAppRes.status);

    // 8.7 Cross-student application linkage -> 400
    // applicationA belongs to studentA, but payload specifies studentB
    const crossStudentRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        ...validPayloadDirect,
        studentId: studentB.id,
        applicationId: applicationA.id,
      }),
    });
    record("Cross-student applicationId returns 400", 400, crossStudentRes.status);

    console.log("9. Testing Successful Placement Creation & Initial State...");
    // 9.1 Create direct placement for Student A by PLACEMENT_STAFF
    const createDirectRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify(validPayloadDirect),
    });
    record("Placement Staff creates direct placement returns 201", 201, createDirectRes.status);
    const directPlacementData = await createDirectRes.json();
    const placement1 = directPlacementData.data;
    createdPlacementIds.push(placement1.id);
    record("Placement initial status is PREPARATION", "PREPARATION", placement1.status);
    record("Placement position is Commis Chef", "Commis Chef", placement1.position);
    record("Placement employer is correct", testEmployer.id, placement1.employerId);

    // 9.2 Verify Audit Log for CREATE
    const createAudit = await prisma.auditLog.findFirst({
      where: { entity: "Placement", entityId: placement1.id, action: "CREATE" },
    });
    record("AuditLog recorded for CREATE action", true, Boolean(createAudit));

    // 9.3 Create placement linked to Vacancy and Application A by ADMIN
    const createLinkedRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentA.id,
        employerId: testEmployer.id,
        vacancyId: testVacancy.id,
        applicationId: applicationA.id,
        position: "Front Desk Officer",
        startDate: "2026-10-15T09:00:00.000Z",
        notes: "Originated from application A",
      }),
    });
    record("Admin creates linked placement returns 201", 201, createLinkedRes.status);
    const linkedPlacementData = await createLinkedRes.json();
    const placement2 = linkedPlacementData.data;
    createdPlacementIds.push(placement2.id);
    record("Linked placement vacancyId matches", testVacancy.id, placement2.vacancyId);
    record("Linked placement applicationId matches", applicationA.id, placement2.applicationId);

    // 9.4 Duplicate application placement -> 409 Conflict
    const dupAppRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookies },
      body: JSON.stringify({
        studentId: studentA.id,
        employerId: testEmployer.id,
        applicationId: applicationA.id,
        position: "Guest Relations",
      }),
    });
    record("Duplicate placement for same application returns 409 Conflict", 409, dupAppRes.status);

    // 9.5 Create placement for Student B linked to Application B
    const createBRes = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        employerId: testEmployer.id,
        vacancyId: testVacancy.id,
        applicationId: applicationB.id,
        position: "Housekeeping Supervisor",
      }),
    });
    record("Placement Staff creates placement for Student B returns 201", 201, createBRes.status);
    const bPlacementData = await createBRes.json();
    const placementB = bPlacementData.data;
    createdPlacementIds.push(placementB.id);

    console.log("10. Testing GET Scoping, IDOR Protection, and Filtering...");
    // 10.1 Super Admin GET sees all 3 placements
    const adminListRes = await request("/api/placements", {
      headers: { Cookie: superAdminCookies },
    });
    const adminListData = await adminListRes.json();
    record("Super Admin sees all placements (count >= 3)", true, adminListData.data.length >= 3);

    // 10.2 Filter by employerId
    const filterEmpRes = await request(`/api/placements?employerId=${testEmployer.id}`, {
      headers: { Cookie: placementCookies },
    });
    const filterEmpData = await filterEmpRes.json();
    record("Filter by employerId returns matching placements", 3, filterEmpData.data.length);

    // 10.3 Student A GET only sees Student A's placements
    const studentAListRes = await request("/api/placements", {
      headers: { Cookie: studentACookies },
    });
    const studentAListData = await studentAListRes.json();
    record("Student A list returns only Student A's placements (2)", 2, studentAListData.data.length);
    const allBelongToA = studentAListData.data.every((p) => p.studentId === studentA.id);
    record("All returned placements belong to Student A", true, allBelongToA);

    // 10.4 Student A attempting IDOR query param ?studentId=studentB.id -> 403
    const idorQueryRes = await request(`/api/placements?studentId=${studentB.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("Student A querying studentId of Student B returns 403", 403, idorQueryRes.status);

    // 10.5 Student A accessing detail of Student A's placement -> 200
    const studentADetailRes = await request(`/api/placements/${placement1.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("Student A accessing own placement detail returns 200", 200, studentADetailRes.status);

    // 10.6 Student A accessing detail of Student B's placement -> 403 IDOR
    const studentBDetailRes = await request(`/api/placements/${placementB.id}`, {
      headers: { Cookie: studentACookies },
    });
    record("Student A accessing Student B placement detail returns 403", 403, studentBDetailRes.status);

    // 10.6b Student B accessing detail of Student B's placement -> 200
    const studentBOwnDetailRes = await request(`/api/placements/${placementB.id}`, {
      headers: { Cookie: studentBCookies },
    });
    record("Student B accessing own placement detail returns 200", 200, studentBOwnDetailRes.status);

    // 10.7 Management accessing any placement detail -> 200
    const mgmtDetailRes = await request(`/api/placements/${placementB.id}`, {
      headers: { Cookie: managementCookies },
    });
    record("Management accessing placement detail returns 200", 200, mgmtDetailRes.status);

    console.log("11. Testing Operational Updates (PATCH /api/placements/[id])...");
    // 11.1 Student attempting PATCH -> 403
    const studentPatchRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: studentACookies },
      body: JSON.stringify({ position: "Senior Chef" }),
    });
    record("Student PATCH returns 403 Forbidden", 403, studentPatchRes.status);

    // 11.2 Management attempting PATCH -> 403
    const mgmtPatchRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: managementCookies },
      body: JSON.stringify({ position: "Senior Chef" }),
    });
    record("Management PATCH returns 403 Forbidden", 403, mgmtPatchRes.status);

    // 11.3 Attempting to modify immutable FK studentId -> 400
    const tamperFkRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ studentId: studentB.id }),
    });
    record("Attempting to modify studentId via PATCH returns 400", 400, tamperFkRes.status);

    // 11.4 Valid operational update by Placement Staff
    const validOpUpdateRes = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({
        position: "Demi Chef de Partie",
        startDate: "2026-11-01T08:00:00.000Z",
        notes: "Promotion before departure",
      }),
    });
    record("Placement Staff operational update returns 200", 200, validOpUpdateRes.status);
    const updatedOpData = await validOpUpdateRes.json();
    record("Position updated to Demi Chef de Partie", "Demi Chef de Partie", updatedOpData.data.position);

    // 11.5 Verify Audit Log for operational UPDATE
    const updateAudit = await prisma.auditLog.findFirst({
      where: { entity: "Placement", entityId: placement1.id, action: "UPDATE" },
    });
    record("AuditLog recorded for operational UPDATE action", true, Boolean(updateAudit));

    console.log("12. Testing Lifecycle Transitions & Terminal States...");
    // 12.1 Invalid transition: PREPARATION -> DEPARTED -> 409
    const invalidTrans1 = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "DEPARTED" }),
    });
    record("PREPARATION -> DEPARTED returns 409 Conflict", 409, invalidTrans1.status);

    // 12.2 Invalid transition: PREPARATION -> PLACED -> 409
    const invalidTrans2 = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "PLACED" }),
    });
    record("PREPARATION -> PLACED returns 409 Conflict", 409, invalidTrans2.status);

    // 12.3 Valid transition: PREPARATION -> READY -> 200
    const validTransReady = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "READY", notes: "Documents and medical cleared" }),
    });
    record("PREPARATION -> READY returns 200", 200, validTransReady.status);
    const readyData = await validTransReady.json();
    record("Status updated to READY", "READY", readyData.data.status);

    // 12.4 Verify Audit Log for STATUS_CHANGE
    const statusChangeAudit = await prisma.auditLog.findFirst({
      where: { entity: "Placement", entityId: placement1.id, action: "STATUS_CHANGE" },
    });
    record("AuditLog recorded for STATUS_CHANGE action", true, Boolean(statusChangeAudit));

    // 12.5 Invalid transition: READY -> PLACED -> 409
    const invalidTrans3 = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "PLACED" }),
    });
    record("READY -> PLACED returns 409 Conflict", 409, invalidTrans3.status);

    // 12.6 Valid transition: READY -> DEPARTED -> 200
    const validTransDeparted = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "DEPARTED", notes: "Flight departed to destination" }),
    });
    record("READY -> DEPARTED returns 200", 200, validTransDeparted.status);
    const departedData = await validTransDeparted.json();
    record("Status updated to DEPARTED", "DEPARTED", departedData.data.status);

    // 12.7 Invalid transition: DEPARTED -> CANCELLED -> 409 (not allowed per PRD)
    const invalidTrans4 = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    record("DEPARTED -> CANCELLED returns 409 Conflict", 409, invalidTrans4.status);

    // 12.8 Valid transition: DEPARTED -> PLACED -> 200 (terminal state)
    const validTransPlaced = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "PLACED", notes: "Reported to work at resort" }),
    });
    record("DEPARTED -> PLACED returns 200", 200, validTransPlaced.status);
    const placedData = await validTransPlaced.json();
    record("Status updated to PLACED", "PLACED", placedData.data.status);

    // 12.9 Terminal state immutability: PLACED cannot be mutated (operational update)
    const placedOpUpdate = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ position: "Head Chef" }),
    });
    record("Operational update on PLACED terminal status returns 409 Conflict", 409, placedOpUpdate.status);

    // 12.10 Terminal state immutability: PLACED cannot transition to any other status
    const placedTransUpdate = await request(`/api/placements/${placement1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    record("Status transition on PLACED terminal status returns 409 Conflict", 409, placedTransUpdate.status);

    // 12.11 Testing cancellation paths: PREPARATION -> CANCELLED
    const cancelRes1 = await request(`/api/placements/${placement2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ status: "CANCELLED", notes: "Candidate decided to withdraw" }),
    });
    record("PREPARATION -> CANCELLED returns 200", 200, cancelRes1.status);
    const cancelData1 = await cancelRes1.json();
    record("Status updated to CANCELLED", "CANCELLED", cancelData1.data.status);

    // 12.12 Terminal state immutability: CANCELLED cannot be mutated
    const cancelledOpUpdate = await request(`/api/placements/${placement2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: placementCookies },
      body: JSON.stringify({ position: "Another Title" }),
    });
    record("Operational update on CANCELLED terminal status returns 409 Conflict", 409, cancelledOpUpdate.status);

    // 12.13 Testing cancellation path: READY -> CANCELLED
    // Create a 4th placement to test READY -> CANCELLED
    const create4Res = await request("/api/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({
        studentId: studentB.id,
        employerId: testEmployer.id,
        position: "Barista Trainee",
      }),
    });
    const p4 = (await create4Res.json()).data;
    createdPlacementIds.push(p4.id);

    await request(`/api/placements/${p4.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ status: "READY" }),
    });
    const cancelFromReadyRes = await request(`/api/placements/${p4.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookies },
      body: JSON.stringify({ status: "CANCELLED", notes: "Visa rejected" }),
    });
    record("READY -> CANCELLED returns 200", 200, cancelFromReadyRes.status);
    const cancelFromReadyData = await cancelFromReadyRes.json();
    record("Status updated to CANCELLED from READY", "CANCELLED", cancelFromReadyData.data.status);

    console.log("13. Testing Historical Record Preservation (DELETE -> 405)...");
    // 13.1 DELETE /api/placements -> 405
    const deleteListRes = await request("/api/placements", {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("DELETE /api/placements returns 405 Method Not Allowed", 405, deleteListRes.status);

    // 13.2 DELETE /api/placements/[id] -> 405
    const deleteDetailRes = await request(`/api/placements/${placement1.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("DELETE /api/placements/[id] returns 405 Method Not Allowed", 405, deleteDetailRes.status);

    console.log("\n==========================================");
    console.log(`ALL ${results.length} TESTS FINISHED!`);
    const allPassed = results.every((r) => r.passed);
    console.log(`OVERALL STATUS: ${allPassed ? "PASSED" : "FAILED"}`);
    console.log("==========================================");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    console.log("\nCleaning up test fixtures and restoring baseline...");
    if (createdPlacementIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Placement", entityId: { in: createdPlacementIds } },
      }).catch(() => {});
      await prisma.placement.deleteMany({
        where: { id: { in: createdPlacementIds } },
      }).catch(() => {});
    }
    if (createdApplicationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Application", entityId: { in: createdApplicationIds } },
      }).catch(() => {});
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      }).catch(() => {});
    }
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
      }).catch(() => {});
      await prisma.vacancy.deleteMany({
        where: { id: { in: createdVacancyIds } },
      }).catch(() => {});
    }
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Employer", entityId: { in: createdEmployerIds } },
      }).catch(() => {});
      await prisma.employer.deleteMany({
        where: { id: { in: createdEmployerIds } },
      }).catch(() => {});
    }
    if (studentB) {
      await prisma.student.update({
        where: { id: studentB.id },
        data: { userId: originalStudentBUserId },
      }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }
    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      }).catch(() => {});
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      }).catch(() => {});
    }

    const finalCounts = {
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      documents: await prisma.document.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
      instructors: await prisma.instructor.count(),
      users: await prisma.user.count(),
    };

    console.log("\nDatabase Baseline Counts After Cleanup:");
    console.log(`Employers:    ${finalCounts.employers} (expected 0)`);
    console.log(`Vacancies:    ${finalCounts.vacancies} (expected 0)`);
    console.log(`Applications: ${finalCounts.applications} (expected 0)`);
    console.log(`Interviews:   ${finalCounts.interviews} (expected 0)`);
    console.log(`Placements:   ${finalCounts.placements} (expected 0)`);
    console.log(`Documents:    ${finalCounts.documents} (expected 0)`);
    console.log(`Students:     ${finalCounts.students} (expected 21)`);
    console.log(`Enrollments:  ${finalCounts.enrollments} (expected 21)`);
    console.log(`Subjects:     ${finalCounts.subjects} (expected 6)`);
    console.log(`Classes:      ${finalCounts.classes} (expected 10)`);
    console.log(`Schedules:    ${finalCounts.schedules} (expected 10)`);
    console.log(`Instructors:  ${finalCounts.instructors} (expected 6)`);
    console.log(`Users:        ${finalCounts.users} (expected 2)`);

    const baselineMatches =
      finalCounts.employers === 0 &&
      finalCounts.vacancies === 0 &&
      finalCounts.applications === 0 &&
      finalCounts.interviews === 0 &&
      finalCounts.placements === 0 &&
      finalCounts.documents === 0 &&
      finalCounts.students === 21 &&
      finalCounts.enrollments === 21 &&
      finalCounts.subjects === 6 &&
      finalCounts.classes === 10 &&
      finalCounts.schedules === 10 &&
      finalCounts.instructors === 6 &&
      finalCounts.users === 2;

    if (!baselineMatches) {
      console.error("FATAL: Database baseline mismatch after cleanup!");
      process.exit(1);
    } else {
      console.log("✓ Database baseline fully restored and verified!");
    }

    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
