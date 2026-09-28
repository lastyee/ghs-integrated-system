// scripts/test-step73d-academic-core-e2e.mjs
// Step 73D: Academic Core Integration Audit & E2E Hardening Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP73D_ACADEMIC_CORE_E2E_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP73D_ACADEMIC_CORE_E2E_CONFIRM_DATABASE",
});

const results = [];

function record(name, expected, actual, category = "GENERAL") {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed, category });
  if (passed) {
    console.log(`✓ [${category}] ${name}`);
  } else {
    console.error(`✗ [${category}] ${name}`);
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
  return { status: response.status, cookies };
}

async function api(method, path, cookies = "", body = undefined) {
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function run() {
  console.log("=== STEP 73D ACADEMIC CORE E2E AUDIT & HARDENING TEST SUITE ===\n");

  const createdUserIds = [];
  const tempProgramIds = [];
  const tempSubjectIds = [];
  const tempBatchIds = [];
  const tempClassIds = [];
  const tempStudentIds = [];
  const tempEnrollmentIds = [];

  try {
    // 0. Capture initial baseline
    console.log("--- Section 0: Database Baseline Capture ---");
    const initialCounts = {
      users: await prisma.user.count(),
      instructors: await prisma.instructor.count(),
      programs: await prisma.program.count(),
      batches: await prisma.batch.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
    };

    console.log("Initial baseline counts:", initialCounts);
    record("0.1 baseline Users count is 3", 3, initialCounts.users, "BASELINE" /* Updated STEP 88 */);
    record("0.2 baseline Instructors count is 6", 6, initialCounts.instructors, "BASELINE");
    record("0.3 baseline Programs count is 1", 1, initialCounts.programs, "BASELINE");
    record("0.4 baseline Batches count is 2", 2, initialCounts.batches, "BASELINE");
    record("0.5 baseline Students count is 21", 21, initialCounts.students, "BASELINE");
    record("0.6 baseline Enrollments count is 21", 21, initialCounts.enrollments, "BASELINE");
    record("0.7 baseline Subjects count is 6", 6, initialCounts.subjects, "BASELINE");
    record("0.8 baseline Classes count is 10", 10, initialCounts.classes, "BASELINE");
    record("0.9 baseline Schedules count is 10", 10, initialCounts.schedules, "BASELINE");

    // Setup logins
    console.log("\n--- Section 1: Authentication & Role Setup ---");
    const adminLogin = await login("admin.demo@ghs.local", "superadmin123");
    record("1.1 Super Admin login successful", true, adminLogin.cookies.length > 0, "AUTH");

    const studentLogin = await login("student.demo@ghs.local", "murid123");
    record("1.2 Student login successful", true, studentLogin.cookies.length > 0, "AUTH");

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    // Create temp Academic Staff
    const academicStaff = await prisma.user.create({
      data: {
        email: "test.academic.73d@ghs.local",
        name: "Test Academic Staff 73D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("ACADEMIC_STAFF"),
      },
    });
    createdUserIds.push(academicStaff.id);
    const academicStaffLogin = await login(academicStaff.email, tempPassword);

    // Create temp Management
    const managementUser = await prisma.user.create({
      data: {
        email: "test.management.73d@ghs.local",
        name: "Test Management 73D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("MANAGEMENT"),
      },
    });
    createdUserIds.push(managementUser.id);
    const managementLogin = await login(managementUser.email, tempPassword);

    // Create temp Instructor user
    const instructorUser = await prisma.user.create({
      data: {
        email: "test.instructor.73d@ghs.local",
        name: "Test Instructor 73D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("INSTRUCTOR"),
      },
    });
    createdUserIds.push(instructorUser.id);
    const instructorLogin = await login(instructorUser.email, tempPassword);

    // Create temp Placement Staff
    const placementStaff = await prisma.user.create({
      data: {
        email: "test.placement.73d@ghs.local",
        name: "Test Placement Staff 73D",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("PLACEMENT_STAFF"),
      },
    });
    createdUserIds.push(placementStaff.id);
    const placementLogin = await login(placementStaff.email, tempPassword);

    // Unauthenticated checks
    const unauthProg = await api("GET", "/api/programs");
    record("1.3 unauthenticated GET /api/programs returns 401", 401, unauthProg.status, "AUTH");
    const unauthSub = await api("GET", "/api/subjects");
    record("1.4 unauthenticated GET /api/subjects returns 401", 401, unauthSub.status, "AUTH");
    const unauthBatch = await api("GET", "/api/batches");
    record("1.5 unauthenticated GET /api/batches returns 401", 401, unauthBatch.status, "AUTH");
    const unauthClass = await api("GET", "/api/classes");
    record("1.6 unauthenticated GET /api/classes returns 401", 401, unauthClass.status, "AUTH");
    const unauthEnroll = await api("GET", "/api/enrollments");
    record("1.7 unauthenticated GET /api/enrollments returns 401", 401, unauthEnroll.status, "AUTH");
    const unauthStudent = await api("GET", "/api/students");
    record("1.8 unauthenticated GET /api/students returns 401", 401, unauthStudent.status, "AUTH");

    // Fetch baseline IDs
    const baselineProgram = await prisma.program.findFirst({ orderBy: { id: "asc" } });
    const baselineSubject = await prisma.subject.findFirst({ orderBy: { id: "asc" } });
    const baselineBatch = await prisma.batch.findFirst({ orderBy: { id: "asc" } });
    const baselineClass = await prisma.class.findFirst({ orderBy: { id: "asc" } });
    const baselineEnrollment = await prisma.enrollment.findFirst({ orderBy: { id: "asc" } });
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
      include: { student: true },
    });
    const ownStudent = demoStudentUser?.student;
    const otherStudent = await prisma.student.findFirst({
      where: { id: { not: ownStudent.id } },
    });
    const baselineInstructor = await prisma.instructor.findFirst({ orderBy: { id: "asc" } });

    // ==========================================
    // 2. Navigation & Route Availability
    // ==========================================
    console.log("\n--- Section 2: Navigation & Route Availability ---");
    const routeUrls = [
      "/students",
      `/students/${ownStudent.id}`,
      "/programs",
      `/programs/${baselineProgram.id}`,
      "/subjects",
      `/subjects/${baselineSubject.id}`,
      "/batches",
      `/batches/${baselineBatch.id}`,
      "/classes",
      `/classes/${baselineClass.id}`,
      "/enrollments",
      `/enrollments/${baselineEnrollment.id}`,
    ];

    for (const routeUrl of routeUrls) {
      const res = await request(routeUrl, {
        headers: { Cookie: adminLogin.cookies },
      });
      record(`2. Route ${routeUrl} returns HTTP 200`, 200, res.status, "NAVIGATION");
    }

    // ==========================================
    // 3. Mock Data Dependency Audit
    // ==========================================
    console.log("\n--- Section 3: Mock Data Dependency Audit ---");
    const academicComponentDirs = [
      "components/students",
      "components/programs",
      "components/subjects",
      "components/batches",
      "components/classes",
      "components/enrollments",
    ];

    let foundMockImport = false;
    let foundMockVariable = false;

    for (const compDir of academicComponentDirs) {
      const fullDir = path.join(process.cwd(), compDir);
      if (fs.existsSync(fullDir)) {
        const files = fs.readdirSync(fullDir);
        for (const file of files) {
          if (file.endsWith(".tsx") || file.endsWith(".ts")) {
            const content = fs.readFileSync(path.join(fullDir, file), "utf8");
            if (content.includes("from \"@/lib/mock-data\"") || content.includes("from '@/lib/mock-data'")) {
              foundMockImport = true;
              console.error(`Mock import found in ${compDir}/${file}`);
            }
            if (
              content.includes("managedStudents") ||
              content.includes("managedPrograms") ||
              content.includes("managedSubjects") ||
              content.includes("managedBatches") ||
              content.includes("managedClasses") ||
              content.includes("managedEnrollments")
            ) {
              foundMockVariable = true;
              console.error(`Mock variable found in ${compDir}/${file}`);
            }
          }
        }
      }
    }

    record("3.1 0 mock-data imports in all 6 academic components", false, foundMockImport, "MOCK_AUDIT");
    record("3.2 0 mock variables in all 6 academic components", false, foundMockVariable, "MOCK_AUDIT");

    // ==========================================
    // 4. Cross-Module Relationship E2E Verification
    // ==========================================
    console.log("\n--- Section 4: Cross-Module Relationship Verification ---");

    // 4.1 Program detail with batches
    const progDetailRes = await api("GET", `/api/programs/${baselineProgram.id}`, adminLogin.cookies);
    record("4.1 Program detail returns 200", 200, progDetailRes.status, "RELATIONSHIPS");
    record("4.2 Program detail contains related batches array", true, Array.isArray(progDetailRes.payload?.data?.batches), "RELATIONSHIPS");
    record("4.3 Program detail batches linked to program", true, progDetailRes.payload?.data?.batches?.length > 0, "RELATIONSHIPS");

    // 4.2 Batch detail with program and enrollments
    const batchDetailRes = await api("GET", `/api/batches/${baselineBatch.id}`, adminLogin.cookies);
    record("4.4 Batch detail returns 200", 200, batchDetailRes.status, "RELATIONSHIPS");
    record("4.5 Batch detail includes program code & name", baselineProgram.code, batchDetailRes.payload?.data?.program?.code, "RELATIONSHIPS");
    record("4.6 Batch detail includes enrollments array", true, Array.isArray(batchDetailRes.payload?.data?.enrollments), "RELATIONSHIPS");
    const allEnrollmentsInBatch = batchDetailRes.payload?.data?.enrollments || [];
    const wrongBatchEnrollment = allEnrollmentsInBatch.find((e) => e.batchId !== baselineBatch.id);
    record("4.7 Batch detail contains no enrollments from other batches", undefined, wrongBatchEnrollment, "RELATIONSHIPS");

    // 4.3 Class detail with batch, instructor, and schedules (Class -> Schedule -> Subject)
    const classDetailRes = await api("GET", `/api/classes/${baselineClass.id}`, adminLogin.cookies);
    record("4.8 Class detail returns 200", 200, classDetailRes.status, "RELATIONSHIPS");
    record("4.9 Class detail includes batch relation", true, Boolean(classDetailRes.payload?.data?.batch?.name), "RELATIONSHIPS");
    record("4.10 Class detail includes instructor relation", true, Boolean(classDetailRes.payload?.data?.instructor?.name), "RELATIONSHIPS");
    record("4.11 Class detail has schedules array", true, Array.isArray(classDetailRes.payload?.data?.schedules), "RELATIONSHIPS");
    record("4.12 Class has NO subjectId on Class model directly", undefined, classDetailRes.payload?.data?.subjectId, "RELATIONSHIPS");

    // 4.4 Enrollment detail with student and batch (with program)
    const enrollDetailRes = await api("GET", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies);
    record("4.13 Enrollment detail returns 200", 200, enrollDetailRes.status, "RELATIONSHIPS");
    record("4.14 Enrollment detail includes student name & NIM", true, Boolean(enrollDetailRes.payload?.data?.student?.name), "RELATIONSHIPS");
    record("4.15 Enrollment detail includes batch and program", true, Boolean(enrollDetailRes.payload?.data?.batch?.program?.code), "RELATIONSHIPS");

    // 4.5 Student detail with enrollments
    const stuDetailRes = await api("GET", `/api/students/${ownStudent.id}`, adminLogin.cookies);
    record("4.16 Student detail returns 200", 200, stuDetailRes.status, "RELATIONSHIPS");
    record("4.17 Student detail includes enrollments array", true, Array.isArray(stuDetailRes.payload?.data?.enrollments), "RELATIONSHIPS");

    // ==========================================
    // 5. Cross-Module Create Flow 1 (Full Chain)
    // ==========================================
    console.log("\n--- Section 5: Cross-Module Create Flow 1 (Full Chain) ---");

    // Step 1: Create Program
    const createProgRes = await api("POST", "/api/programs", adminLogin.cookies, {
      code: "E2E73D-PROG",
      name: "E2E Program 73D",
      description: "Test Program for Step 73D",
    });
    record("5.1 Create Program returns 201", 201, createProgRes.status, "FLOW_1");
    const newProgId = createProgRes.payload?.data?.id;
    if (newProgId) tempProgramIds.push(newProgId);

    // Step 2: Create Batch with Program
    const createBatchRes = await api("POST", "/api/batches", adminLogin.cookies, {
      name: "E2E73D-BATCH",
      programId: newProgId,
      startDate: "2026-10-01",
      endDate: "2026-11-01",
    });
    record("5.2 Create Batch with new Program returns 201", 201, createBatchRes.status, "FLOW_1");
    const newBatchId = createBatchRes.payload?.data?.id;
    if (newBatchId) tempBatchIds.push(newBatchId);

    // Step 3: Create Student
    const createStudentRes = await api("POST", "/api/students", adminLogin.cookies, {
      nim: "E2E73D-NIM1",
      nik: "E2E73D-NIK1",
      name: "E2E73D Student One",
      phone: "081299990001",
      address: "Jl. E2E 73D No. 1",
    });
    record("5.3 Create Student returns 201", 201, createStudentRes.status, "FLOW_1");
    const newStudentId = createStudentRes.payload?.data?.id;
    if (newStudentId) tempStudentIds.push(newStudentId);

    // Step 4: Create Enrollment Student -> Batch
    const createEnrollRes = await api("POST", "/api/enrollments", adminLogin.cookies, {
      studentId: newStudentId,
      batchId: newBatchId,
      notes: "Enrolled via Flow 1",
    });
    record("5.4 Create Enrollment Student -> Batch returns 201", 201, createEnrollRes.status, "FLOW_1");
    const newEnrollId = createEnrollRes.payload?.data?.id;
    if (newEnrollId) tempEnrollmentIds.push(newEnrollId);

    // Step 5: Create Class Batch -> Instructor
    const createClassRes = await api("POST", "/api/classes", adminLogin.cookies, {
      name: "E2E73D-CLASS",
      batchId: newBatchId,
      instructorId: baselineInstructor.id,
    });
    record("5.5 Create Class Batch -> Instructor returns 201", 201, createClassRes.status, "FLOW_1");
    const newClassId = createClassRes.payload?.data?.id;
    if (newClassId) tempClassIds.push(newClassId);

    // Step 6: Verify relations in live GETs
    const verifyProg = await api("GET", `/api/programs/${newProgId}`, adminLogin.cookies);
    const progBatches = verifyProg.payload?.data?.batches || [];
    record("5.6 Program detail reflects newly created batch", true, progBatches.some((b) => b.id === newBatchId), "FLOW_1");

    const verifyBatch = await api("GET", `/api/batches/${newBatchId}`, adminLogin.cookies);
    const batchEnrollments = verifyBatch.payload?.data?.enrollments || [];
    record("5.7 Batch detail reflects newly enrolled student", true, batchEnrollments.some((e) => e.studentId === newStudentId), "FLOW_1");

    const verifyStudent = await api("GET", `/api/students/${newStudentId}`, adminLogin.cookies);
    const stuEnrollments = verifyStudent.payload?.data?.enrollments || [];
    record("5.8 Student detail reflects new batch enrollment", true, stuEnrollments.some((e) => e.id === newEnrollId), "FLOW_1");

    const verifyClass = await api("GET", `/api/classes/${newClassId}`, adminLogin.cookies);
    record("5.9 Class detail reflects correct batch name", "E2E73D-BATCH", verifyClass.payload?.data?.batch?.name, "FLOW_1");
    record("5.10 Class detail reflects correct instructor", baselineInstructor.name, verifyClass.payload?.data?.instructor?.name, "FLOW_1");

    // ==========================================
    // 6. Cross-Module Create Flow 2 (Existing + Status Update)
    // ==========================================
    console.log("\n--- Section 6: Cross-Module Create Flow 2 (Existing + Update) ---");

    const flow2EnrollRes = await api("POST", "/api/enrollments", adminLogin.cookies, {
      studentId: ownStudent.id,
      batchId: baselineBatch.id,
      notes: "Flow 2 enrollment",
    });
    record("6.1 Flow 2: Create Enrollment on baseline batch returns 201", 201, flow2EnrollRes.status, "FLOW_2");
    const flow2EnrollId = flow2EnrollRes.payload?.data?.id;
    if (flow2EnrollId) tempEnrollmentIds.push(flow2EnrollId);

    const patchEnrollRes = await api("PATCH", `/api/enrollments/${flow2EnrollId}`, adminLogin.cookies, {
      status: "COMPLETED",
      notes: "Completed via Flow 2 test",
    });
    record("6.2 Flow 2: PATCH Enrollment status returns 200", 200, patchEnrollRes.status, "FLOW_2");
    record("6.3 Flow 2: Patched status is COMPLETED", "COMPLETED", patchEnrollRes.payload?.data?.status, "FLOW_2");

    const verifyFlow2Enroll = await api("GET", `/api/enrollments/${flow2EnrollId}`, adminLogin.cookies);
    record("6.4 Flow 2: Server-confirmed status is COMPLETED", "COMPLETED", verifyFlow2Enroll.payload?.data?.status, "FLOW_2");

    // ==========================================
    // 7. Cross-Module Create Flow 3 (Class Mutation)
    // ==========================================
    console.log("\n--- Section 7: Cross-Module Create Flow 3 (Class Mutation) ---");

    const flow3ClassRes = await api("POST", "/api/classes", adminLogin.cookies, {
      name: "E2E73D-CLASS2",
      batchId: baselineBatch.id,
      instructorId: baselineInstructor.id,
    });
    record("7.1 Flow 3: Create Class returns 201", 201, flow3ClassRes.status, "FLOW_3");
    const flow3ClassId = flow3ClassRes.payload?.data?.id;
    if (flow3ClassId) tempClassIds.push(flow3ClassId);

    const patchClassRes = await api("PATCH", `/api/classes/${flow3ClassId}`, adminLogin.cookies, {
      name: "E2E73D-CLASS2 Updated",
      status: "COMPLETED",
    });
    record("7.2 Flow 3: PATCH Class returns 200", 200, patchClassRes.status, "FLOW_3");
    record("7.3 Flow 3: Class name updated", "E2E73D-CLASS2 Updated", patchClassRes.payload?.data?.name, "FLOW_3");
    record("7.4 Flow 3: Class status is COMPLETED", "COMPLETED", patchClassRes.payload?.data?.status, "FLOW_3");

    // ==========================================
    // 8. Cross-Module FK & Validation
    // ==========================================
    console.log("\n--- Section 8: Cross-Module FK & Input Validation ---");

    const invalidBatchProg = await api("POST", "/api/batches", adminLogin.cookies, {
      name: "Invalid Prog Batch",
      programId: "nonexistent-program-id",
      startDate: "2026-10-01",
    });
    record("8.1 Batch with invalid programId returns 404", 404, invalidBatchProg.status, "VALIDATION");

    const invalidClassBatch = await api("POST", "/api/classes", adminLogin.cookies, {
      name: "Invalid Batch Class",
      batchId: "nonexistent-batch-id",
      instructorId: baselineInstructor.id,
    });
    record("8.2 Class with invalid batchId returns 404", 404, invalidClassBatch.status, "VALIDATION");

    const invalidClassInst = await api("POST", "/api/classes", adminLogin.cookies, {
      name: "Invalid Instructor Class",
      batchId: baselineBatch.id,
      instructorId: "nonexistent-instructor-id",
    });
    record("8.3 Class with invalid instructorId returns 404", 404, invalidClassInst.status, "VALIDATION");

    const invalidEnrollStudent = await api("POST", "/api/enrollments", adminLogin.cookies, {
      studentId: "nonexistent-student-id",
      batchId: baselineBatch.id,
    });
    record("8.4 Enrollment with invalid studentId returns 404", 404, invalidEnrollStudent.status, "VALIDATION");

    const invalidEnrollBatch = await api("POST", "/api/enrollments", adminLogin.cookies, {
      studentId: ownStudent.id,
      batchId: "nonexistent-batch-id",
    });
    record("8.5 Enrollment with invalid batchId returns 404", 404, invalidEnrollBatch.status, "VALIDATION");

    // Date validation
    const invalidBatchDate = await api("POST", "/api/batches", adminLogin.cookies, {
      name: "Invalid Date Batch",
      programId: baselineProgram.id,
      startDate: "2026-10-10",
      endDate: "2026-10-01", // endDate < startDate
    });
    record("8.6 Batch with endDate < startDate returns 400", 400, invalidBatchDate.status, "VALIDATION");

    // Duplicate validations
    const dupProg = await api("POST", "/api/programs", adminLogin.cookies, {
      code: baselineProgram.code,
      name: "Duplicate Program",
    });
    record("8.7 Duplicate Program code returns 409", 409, dupProg.status, "VALIDATION");

    const dupSub = await api("POST", "/api/subjects", adminLogin.cookies, {
      code: baselineSubject.code,
      name: "Duplicate Subject",
    });
    record("8.8 Duplicate Subject code returns 409", 409, dupSub.status, "VALIDATION");

    const dupStudentNim = await api("POST", "/api/students", adminLogin.cookies, {
      nim: ownStudent.nim,
      name: "Duplicate Student NIM",
    });
    record("8.9 Duplicate Student NIM returns 409", 409, dupStudentNim.status, "VALIDATION");

    // ==========================================
    // 9. RBAC E2E Verification
    // ==========================================
    console.log("\n--- Section 9: RBAC E2E Verification ---");

    // Academic Staff can mutate
    const staffCreateSub = await api("POST", "/api/subjects", academicStaffLogin.cookies, {
      code: "E2E73D-SUB",
      name: "E2E Subject Staff",
    });
    record("9.1 ACADEMIC_STAFF can create subject (201)", 201, staffCreateSub.status, "RBAC");
    const tempSubId = staffCreateSub.payload?.data?.id;
    if (tempSubId) tempSubjectIds.push(tempSubId);

    // Management is read-only
    const mgmtGetProg = await api("GET", "/api/programs", managementLogin.cookies);
    record("9.2 MANAGEMENT can read programs (200)", 200, mgmtGetProg.status, "RBAC");

    const mgmtCreateProg = await api("POST", "/api/programs", managementLogin.cookies, {
      code: "MGMT-PROG",
      name: "Management Program",
    });
    record("9.3 MANAGEMENT cannot create program (403)", 403, mgmtCreateProg.status, "RBAC");

    const mgmtPatchProg = await api("PATCH", `/api/programs/${baselineProgram.id}`, managementLogin.cookies, {
      name: "Mutated by Management",
    });
    record("9.4 MANAGEMENT cannot update program (403)", 403, mgmtPatchProg.status, "RBAC");

    // Instructor has read on class/student, NO academic mutation
    const instGetClass = await api("GET", "/api/classes", instructorLogin.cookies);
    record("9.5 INSTRUCTOR can read classes (200)", 200, instGetClass.status, "RBAC");

    const instCreateClass = await api("POST", "/api/classes", instructorLogin.cookies, {
      name: "Instructor Class",
      batchId: baselineBatch.id,
      instructorId: baselineInstructor.id,
    });
    record("9.6 INSTRUCTOR cannot create class (403)", 403, instCreateClass.status, "RBAC");

    const instCreateProg = await api("POST", "/api/programs", instructorLogin.cookies, {
      code: "INST-PROG",
      name: "Instructor Program",
    });
    record("9.7 INSTRUCTOR cannot create program (403)", 403, instCreateProg.status, "RBAC");

    // Placement staff has NO academic mutation
    const placeCreateBatch = await api("POST", "/api/batches", placementLogin.cookies, {
      name: "Placement Batch",
      programId: baselineProgram.id,
      startDate: "2026-10-01",
    });
    record("9.8 PLACEMENT_STAFF cannot create batch (403)", 403, placeCreateBatch.status, "RBAC");

    const placeCreateStudent = await api("POST", "/api/students", placementLogin.cookies, {
      nim: "PLACE-NIM",
      name: "Placement Student",
    });
    record("9.9 PLACEMENT_STAFF cannot create student (403)", 403, placeCreateStudent.status, "RBAC");

    // Student has NO academic mutation
    const stuCreateProg = await api("POST", "/api/programs", studentLogin.cookies, {
      code: "STU-PROG",
      name: "Student Program",
    });
    record("9.10 STUDENT cannot create program (403)", 403, stuCreateProg.status, "RBAC");

    const stuCreateBatch = await api("POST", "/api/batches", studentLogin.cookies, {
      name: "Student Batch",
      programId: baselineProgram.id,
      startDate: "2026-10-01",
    });
    record("9.11 STUDENT cannot create batch (403)", 403, stuCreateBatch.status, "RBAC");

    const stuCreateEnroll = await api("POST", "/api/enrollments", studentLogin.cookies, {
      studentId: ownStudent.id,
      batchId: baselineBatch.id,
    });
    record("9.12 STUDENT cannot create enrollment (403)", 403, stuCreateEnroll.status, "RBAC");

    // ==========================================
    // 10. IDOR / Ownership Verification
    // ==========================================
    console.log("\n--- Section 10: IDOR / Ownership Verification ---");

    const stuGetOwn = await api("GET", `/api/students/${ownStudent.id}`, studentLogin.cookies);
    record("10.1 Student can read own student record (200)", 200, stuGetOwn.status, "IDOR");

    const stuGetOther = await api("GET", `/api/students/${otherStudent.id}`, studentLogin.cookies);
    record("10.2 Student cannot read other student record (403)", 403, stuGetOther.status, "IDOR");

    const stuPatchOther = await api("PATCH", `/api/students/${otherStudent.id}`, studentLogin.cookies, {
      name: "Hacked by Student",
    });
    record("10.3 Student cannot update other student record (403)", 403, stuPatchOther.status, "IDOR");

    const stuGetEnrollments = await api("GET", "/api/enrollments", studentLogin.cookies);
    record("10.4 Student cannot access global enrollments list (403)", 403, stuGetEnrollments.status, "IDOR");

    const stuGetEnrollDetail = await api("GET", `/api/enrollments/${baselineEnrollment.id}`, studentLogin.cookies);
    record("10.5 Student cannot access enrollment detail (403)", 403, stuGetEnrollDetail.status, "IDOR");

    // ==========================================
    // 11. Historical Data Safety & DELETE 405
    // ==========================================
    console.log("\n--- Section 11: Historical Data Safety & DELETE 405 ---");

    const delStudent = await api("DELETE", `/api/students/${ownStudent.id}`, adminLogin.cookies);
    record("11.1 DELETE /api/students/[id] returns 405", 405, delStudent.status, "SAFETY");

    const delProg = await api("DELETE", `/api/programs/${baselineProgram.id}`, adminLogin.cookies);
    record("11.2 DELETE /api/programs/[id] returns 405", 405, delProg.status, "SAFETY");

    const delSub = await api("DELETE", `/api/subjects/${baselineSubject.id}`, adminLogin.cookies);
    record("11.3 DELETE /api/subjects/[id] returns 405", 405, delSub.status, "SAFETY");

    const delBatch = await api("DELETE", `/api/batches/${baselineBatch.id}`, adminLogin.cookies);
    record("11.4 DELETE /api/batches/[id] returns 405", 405, delBatch.status, "SAFETY");

    const delClass = await api("DELETE", `/api/classes/${baselineClass.id}`, adminLogin.cookies);
    record("11.5 DELETE /api/classes/[id] returns 405", 405, delClass.status, "SAFETY");

    const delEnroll = await api("DELETE", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies);
    record("11.6 DELETE /api/enrollments/[id] returns 405", 405, delEnroll.status, "SAFETY");

    // Audit UI files for Delete buttons
    let foundDeleteButton = false;
    for (const compDir of academicComponentDirs) {
      const fullDir = path.join(process.cwd(), compDir);
      if (fs.existsSync(fullDir)) {
        const files = fs.readdirSync(fullDir);
        for (const file of files) {
          if (file.endsWith(".tsx")) {
            const content = fs.readFileSync(path.join(fullDir, file), "utf8");
            // check for delete button
            if (
              content.includes(">Hapus<") ||
              content.includes(">Delete<") ||
              content.includes("aria-label=\"Delete\"") ||
              content.includes("aria-label=\"Hapus\"")
            ) {
              foundDeleteButton = true;
              console.error(`Delete button found in UI: ${compDir}/${file}`);
            }
          }
        }
      }
    }
    record("11.7 UI components have 0 Delete buttons", false, foundDeleteButton, "SAFETY");

    // ==========================================
    // 12. Audit Log E2E Verification
    // ==========================================
    console.log("\n--- Section 12: Audit Log Verification ---");

    const adminUser = await prisma.user.findUnique({ where: { email: "admin.demo@ghs.local" } });

    // Check Program audit log
    const progLogs = await prisma.auditLog.findMany({
      where: { entity: "Program", entityId: newProgId },
    });
    record("12.1 Audit log exists for Program CREATE", true, progLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");
    record("12.2 Program CREATE audit log records correct actorId", adminUser?.id, progLogs[0]?.userId, "AUDIT_LOG");

    // Check Batch audit log
    const batchLogs = await prisma.auditLog.findMany({
      where: { entity: "Batch", entityId: newBatchId },
    });
    record("12.3 Audit log exists for Batch CREATE", true, batchLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");

    // Check Class audit log
    const classLogs = await prisma.auditLog.findMany({
      where: { entity: "Class", entityId: newClassId },
    });
    record("12.4 Audit log exists for Class CREATE", true, classLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");

    // Check Enrollment audit log
    const enrollLogs = await prisma.auditLog.findMany({
      where: { entity: "Enrollment", entityId: flow2EnrollId },
    });
    record("12.5 Audit log exists for Enrollment CREATE", true, enrollLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");
    record("12.6 Audit log exists for Enrollment UPDATE", true, enrollLogs.some((l) => l.action === "UPDATE"), "AUDIT_LOG");

    // Check Student audit log
    const stuLogs = await prisma.auditLog.findMany({
      where: { entity: "Student", entityId: newStudentId },
    });
    record("12.7 Audit log exists for Student CREATE", true, stuLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");

    // Check Subject audit log (created by Academic Staff)
    const subLogs = await prisma.auditLog.findMany({
      where: { entity: "Subject", entityId: tempSubId },
    });
    record("12.8 Audit log exists for Subject CREATE", true, subLogs.some((l) => l.action === "CREATE"), "AUDIT_LOG");
    record("12.9 Subject CREATE audit log actor is Academic Staff", academicStaff.id, subLogs[0]?.userId, "AUDIT_LOG");

    // Sensitive data check in changes
    let sensitiveKeyFound = false;
    const allAcademicLogs = await prisma.auditLog.findMany({
      where: {
        entity: { in: ["Program", "Subject", "Batch", "Class", "Enrollment", "Student"] },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    for (const log of allAcademicLogs) {
      const changesStr = JSON.stringify(log.changes).toLowerCase();
      if (changesStr.includes("passwordhash") || changesStr.includes("sessiontoken")) {
        sensitiveKeyFound = true;
      }
    }
    record("12.10 Audit logs contain no passwordHash or session tokens", false, sensitiveKeyFound, "AUDIT_LOG");

    // ==========================================
    // 13. Deterministic Cleanup & Baseline Verification
    // ==========================================
    console.log("\n--- Section 13: Deterministic Cleanup & Baseline Check ---");

    // Delete temporary enrollments
    if (tempEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({ where: { id: { in: tempEnrollmentIds } } });
    }

    // Delete temporary classes
    if (tempClassIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: tempClassIds } } });
    }

    // Delete temporary batches
    if (tempBatchIds.length > 0) {
      await prisma.batch.deleteMany({ where: { id: { in: tempBatchIds } } });
    }

    // Delete temporary programs
    if (tempProgramIds.length > 0) {
      await prisma.program.deleteMany({ where: { id: { in: tempProgramIds } } });
    }

    // Delete temporary subjects
    if (tempSubjectIds.length > 0) {
      await prisma.subject.deleteMany({ where: { id: { in: tempSubjectIds } } });
    }

    // Delete temporary students
    if (tempStudentIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: tempStudentIds } } });
    }

    // Delete temporary users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }

    // Verify database counts
    const finalCounts = {
      users: await prisma.user.count(),
      instructors: await prisma.instructor.count(),
      programs: await prisma.program.count(),
      batches: await prisma.batch.count(),
      students: await prisma.student.count(),
      enrollments: await prisma.enrollment.count(),
      subjects: await prisma.subject.count(),
      classes: await prisma.class.count(),
      schedules: await prisma.schedule.count(),
    };

    console.log("Final database counts:", finalCounts);
    record("13.1 Users count returned to baseline", initialCounts.users, finalCounts.users, "BASELINE");
    record("13.2 Instructors count returned to baseline", initialCounts.instructors, finalCounts.instructors, "BASELINE");
    record("13.3 Programs count returned to baseline", initialCounts.programs, finalCounts.programs, "BASELINE");
    record("13.4 Batches count returned to baseline", initialCounts.batches, finalCounts.batches, "BASELINE");
    record("13.5 Students count returned to baseline", initialCounts.students, finalCounts.students, "BASELINE");
    record("13.6 Enrollments count returned to baseline", initialCounts.enrollments, finalCounts.enrollments, "BASELINE");
    record("13.7 Subjects count returned to baseline", initialCounts.subjects, finalCounts.subjects, "BASELINE");
    record("13.8 Classes count returned to baseline", initialCounts.classes, finalCounts.classes, "BASELINE");
    record("13.9 Schedules count returned to baseline", initialCounts.schedules, finalCounts.schedules, "BASELINE");

  } finally {
    // Failsafe cleanup
    if (tempEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({ where: { id: { in: tempEnrollmentIds } } }).catch(() => {});
    }
    if (tempClassIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: tempClassIds } } }).catch(() => {});
    }
    if (tempBatchIds.length > 0) {
      await prisma.batch.deleteMany({ where: { id: { in: tempBatchIds } } }).catch(() => {});
    }
    if (tempProgramIds.length > 0) {
      await prisma.program.deleteMany({ where: { id: { in: tempProgramIds } } }).catch(() => {});
    }
    if (tempSubjectIds.length > 0) {
      await prisma.subject.deleteMany({ where: { id: { in: tempSubjectIds } } }).catch(() => {});
    }
    if (tempStudentIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: tempStudentIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED, TOTAL: ${results.length}`);
  console.log("==========================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("Test suite encountered fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
