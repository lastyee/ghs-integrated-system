// scripts/test-step73c-academic-core-frontend.mjs
// Step 73C: Academic Core Frontend Live Integration Verification Test Suite

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

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
  const location = response.headers.get("location") || "";
  if (location.includes("error=")) {
    throw new Error(`Login failed for ${email}: ${location}`);
  }
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function getBaselineCounts() {
  const [
    users,
    instructors,
    programs,
    batches,
    students,
    enrollments,
    subjects,
    classes,
    schedules,
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

  return {
    users,
    instructors,
    programs,
    batches,
    students,
    enrollments,
    subjects,
    classes,
    schedules,
  };
}

async function run() {
  console.log("==================================================");
  console.log("STEP 73C: ACADEMIC CORE FRONTEND VERIFICATION");
  console.log("==================================================\n");

  // 1. Initial Baseline Verification
  console.log("--- 1. Database Baseline Verification ---");
  const baseline = await getBaselineCounts();
  record("Baseline Users count is 2", 2, baseline.users);
  record("Baseline Instructors count is 6", 6, baseline.instructors);
  record("Baseline Programs count is 1", 1, baseline.programs);
  record("Baseline Batches count is 2", 2, baseline.batches);
  record("Baseline Students count is 21", 21, baseline.students);
  record("Baseline Enrollments count is 21", 21, baseline.enrollments);
  record("Baseline Subjects count is 6", 6, baseline.subjects);
  record("Baseline Classes count is 10", 10, baseline.classes);
  record("Baseline Schedules count is 10", 10, baseline.schedules);

  // Authenticate as Super Admin
  console.log("\n--- 2. Authentication & Route Availability ---");
  const adminCookie = await login("admin.demo@ghs.local", "superadmin123");
  const studentCookie = await login("student.demo@ghs.local", "murid123");

  const [
    firstStudent,
    firstProgram,
    firstSubject,
    firstBatch,
    firstClass,
    firstEnrollment,
  ] = await Promise.all([
    prisma.student.findFirst({ select: { id: true } }),
    prisma.program.findFirst({ select: { id: true } }),
    prisma.subject.findFirst({ select: { id: true } }),
    prisma.batch.findFirst({ select: { id: true } }),
    prisma.class.findFirst({ select: { id: true } }),
    prisma.enrollment.findFirst({ select: { id: true } }),
  ]);

  // Check main routes
  const routes = [
    { path: "/students", name: "Students Page" },
    { path: "/programs", name: "Programs Page" },
    { path: "/subjects", name: "Subjects Page" },
    { path: "/batches", name: "Batches Page" },
    { path: "/classes", name: "Classes Page" },
    { path: "/enrollments", name: "Enrollments Page" },
    { path: `/students/${firstStudent.id}`, name: "Student Detail Page" },
    { path: `/programs/${firstProgram.id}`, name: "Program Detail Page" },
    { path: `/subjects/${firstSubject.id}`, name: "Subject Detail Page" },
    { path: `/batches/${firstBatch.id}`, name: "Batch Detail Page" },
    { path: `/classes/${firstClass.id}`, name: "Class Detail Page" },
    { path: `/enrollments/${firstEnrollment.id}`, name: "Enrollment Detail Page" },
  ];

  for (const r of routes) {
    const res = await request(r.path, {
      headers: { Cookie: adminCookie },
    });
    record(`Route ${r.name} (${r.path}) returns 200`, 200, res.status);
  }

  // 3. Static Inspection: Verify Mock Data is NOT Imported in Academic Core Components
  console.log("\n--- 3. Static Inspection: Zero Mock Data in Academic Components ---");
  const academicFiles = [
    "components/students/students-page.tsx",
    "components/students/student-detail.tsx",
    "components/programs/programs-page.tsx",
    "components/programs/program-detail.tsx",
    "components/subjects/subjects-page.tsx",
    "components/subjects/subject-detail.tsx",
    "components/batches/batches-page.tsx",
    "components/batches/batch-detail.tsx",
    "components/classes/classes-page.tsx",
    "components/classes/class-detail.tsx",
    "components/enrollments/enrollments-page.tsx",
    "components/enrollments/enrollment-detail.tsx",
  ];

  for (const file of academicFiles) {
    const content = fs.readFileSync(path.resolve(file), "utf8");
    const hasMockData = content.includes("mock-data");
    const hasManaged = content.includes("managedStudents") ||
      content.includes("managedPrograms") ||
      content.includes("managedSubjects") ||
      content.includes("managedBatches") ||
      content.includes("managedClasses") ||
      content.includes("managedEnrollments");

    record(`File ${file} has NO mock-data imports`, false, hasMockData);
    record(`File ${file} has NO managed mock collections`, false, hasManaged);
  }

  // 4. Verification of Live API Integration Endpoints
  console.log("\n--- 4. Live API Endpoint Integration Checks ---");
  const studentsPage = fs.readFileSync("components/students/students-page.tsx", "utf8");
  record("Students page calls /api/students", true, studentsPage.includes("/api/students"));

  const programsPage = fs.readFileSync("components/programs/programs-page.tsx", "utf8");
  record("Programs page calls /api/programs", true, programsPage.includes("/api/programs"));

  const subjectsPage = fs.readFileSync("components/subjects/subjects-page.tsx", "utf8");
  record("Subjects page calls /api/subjects", true, subjectsPage.includes("/api/subjects"));

  const batchesPage = fs.readFileSync("components/batches/batches-page.tsx", "utf8");
  record("Batches page calls /api/batches", true, batchesPage.includes("/api/batches"));
  record("Batches page calls /api/programs for dropdown", true, batchesPage.includes("/api/programs"));

  const classesPage = fs.readFileSync("components/classes/classes-page.tsx", "utf8");
  record("Classes page calls /api/classes", true, classesPage.includes("/api/classes"));
  record("Classes page calls /api/batches for dropdown", true, classesPage.includes("/api/batches"));
  record("Classes page calls /api/instructors for dropdown", true, classesPage.includes("/api/instructors"));
  record("Classes page does NOT send subjectId", false, classesPage.includes("subjectId:"));

  const enrollmentsPage = fs.readFileSync("components/enrollments/enrollments-page.tsx", "utf8");
  record("Enrollments page calls /api/enrollments", true, enrollmentsPage.includes("/api/enrollments"));
  record("Enrollments page calls /api/students for dropdown", true, enrollmentsPage.includes("/api/students"));
  record("Enrollments page calls /api/batches for dropdown", true, enrollmentsPage.includes("/api/batches"));

  // 5. UI State Markers & No Delete Action Check
  console.log("\n--- 5. UI State Markers & Delete Buttons Audit ---");
  for (const file of academicFiles) {
    const content = fs.readFileSync(path.resolve(file), "utf8");
    record(`${file} has loading state`, true, content.includes('data-testid="loading-state"'));
    record(`${file} has error state`, true, content.includes('data-testid="error-state"'));
    if (file.endsWith("-page.tsx")) {
      record(`${file} has empty state`, true, content.includes('data-testid="empty-state"'));
    }
    // Verify no delete buttons
    const hasDeleteButton = /<button[^>]*>[^<]*Delete[^<]*<\/button>/i.test(content) ||
      /<button[^>]*>[^<]*Hapus[^<]*<\/button>/i.test(content);
    record(`${file} has zero delete buttons`, false, hasDeleteButton);
  }

  // 6. Live API Functional CRUD Tests with Deterministic Cleanup
  console.log("\n--- 6. Live API Functional Tests & Deterministic Cleanup ---");

  // 6A. Programs: Create, Conflict 409, Patch, Cleanup
  console.log("\n-- 6A. Programs Live API --");
  const createProgRes = await request("/api/programs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      code: "TEST-PROG-73C",
      name: "Test Program 73C",
      description: "Temporary program for 73C integration test",
    }),
  });
  record("Create program succeeds with 201", 201, createProgRes.status);
  const progData = await createProgRes.json();
  const createdProgId = progData.data?.id;

  // Duplicate code conflict 409
  const dupProgRes = await request("/api/programs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      code: "TEST-PROG-73C",
      name: "Duplicate Program 73C",
    }),
  });
  record("Duplicate program code returns 409", 409, dupProgRes.status);

  // Patch program
  const patchProgRes = await request(`/api/programs/${createdProgId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Updated Test Program 73C",
    }),
  });
  record("Patch program succeeds with 200", 200, patchProgRes.status);

  // 6B. Subjects: Create, Conflict 409, Patch, Cleanup
  console.log("\n-- 6B. Subjects Live API --");
  const createSubjRes = await request("/api/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      code: "TEST-SUBJ-73C",
      name: "Test Subject 73C",
      description: "Temporary subject for 73C integration test",
    }),
  });
  record("Create subject succeeds with 201", 201, createSubjRes.status);
  const subjData = await createSubjRes.json();
  const createdSubjId = subjData.data?.id;

  // Duplicate subject code conflict 409
  const dupSubjRes = await request("/api/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      code: "TEST-SUBJ-73C",
      name: "Duplicate Subject 73C",
    }),
  });
  record("Duplicate subject code returns 409", 409, dupSubjRes.status);

  // Patch subject
  const patchSubjRes = await request(`/api/subjects/${createdSubjId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Updated Test Subject 73C",
    }),
  });
  record("Patch subject succeeds with 200", 200, patchSubjRes.status);

  // 6C. Batches: Validation, Create, Patch, Cleanup
  console.log("\n-- 6C. Batches Live API --");
  // Invalid date range validation
  const invalidBatchRes = await request("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Invalid Date Batch",
      programId: createdProgId,
      startDate: "2026-12-31",
      endDate: "2026-01-01",
    }),
  });
  record("Batch with endDate < startDate returns 400", 400, invalidBatchRes.status);

  const createBatchRes = await request("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Test Batch 73C",
      programId: createdProgId,
      startDate: "2026-10-01",
      endDate: "2026-12-31",
    }),
  });
  record("Create batch succeeds with 201", 201, createBatchRes.status);
  const batchData = await createBatchRes.json();
  const createdBatchId = batchData.data?.id;

  // 6D. Students: Create, Patch, Cleanup
  console.log("\n-- 6D. Students Live API --");
  const createStudentRes = await request("/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nim: "TEST-NIM-73C",
      nik: "3201019999990001",
      name: "Test Student 73C",
      phone: "081299998888",
      address: "Jl. Test No. 73C",
    }),
  });
  record("Create student succeeds with 201", 201, createStudentRes.status);
  const studentData = await createStudentRes.json();
  const createdStudentId = studentData.data?.id;

  // Duplicate NIM returns 409
  const dupNimRes = await request("/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nim: "TEST-NIM-73C",
      name: "Duplicate NIM Student",
    }),
  });
  record("Duplicate student NIM returns 409", 409, dupNimRes.status);

  // Patch student
  const patchStudentRes = await request(`/api/students/${createdStudentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Updated Test Student 73C",
    }),
  });
  record("Patch student succeeds with 200", 200, patchStudentRes.status);

  // 6E. Enrollments: Create, Conflict 409, Patch, Cleanup
  console.log("\n-- 6E. Enrollments Live API --");
  const createEnrRes = await request("/api/enrollments", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      studentId: createdStudentId,
      batchId: createdBatchId,
      notes: "Test enrollment 73C",
    }),
  });
  record("Create enrollment succeeds with 201", 201, createEnrRes.status);
  const enrData = await createEnrRes.json();
  const createdEnrId = enrData.data?.id;

  // Patch enrollment status
  const patchEnrRes = await request(`/api/enrollments/${createdEnrId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "COMPLETED",
      notes: "Completed course successfully",
    }),
  });
  record("Patch enrollment status succeeds with 200", 200, patchEnrRes.status);

  // 6F. Classes: Create, Patch, Cleanup
  console.log("\n-- 6F. Classes Live API --");
  const firstInstructor = await prisma.instructor.findFirst({ select: { id: true } });
  const createClassRes = await request("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: "Test Class 73C",
      batchId: createdBatchId,
      instructorId: firstInstructor.id,
    }),
  });
  record("Create class succeeds with 201", 201, createClassRes.status);
  const classData = await createClassRes.json();
  const createdClassId = classData.data?.id;

  // Patch class status
  const patchClassRes = await request(`/api/classes/${createdClassId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "COMPLETED",
    }),
  });
  record("Patch class succeeds with 200", 200, patchClassRes.status);

  // 6G. Test DELETE 405 Method Not Allowed
  console.log("\n-- 6G. DELETE Endpoints Return 405 Method Not Allowed --");
  const delEndpoints = [
    `/api/students/${createdStudentId}`,
    `/api/programs/${createdProgId}`,
    `/api/subjects/${createdSubjId}`,
    `/api/batches/${createdBatchId}`,
    `/api/classes/${createdClassId}`,
    `/api/enrollments/${createdEnrId}`,
  ];

  for (const ep of delEndpoints) {
    const delRes = await request(ep, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    record(`DELETE ${ep} returns 405`, 405, delRes.status);
  }

  // 7. Deterministic Cleanup of Test Records
  console.log("\n--- 7. Deterministic Cleanup of Test Entities ---");
  await prisma.class.deleteMany({ where: { batchId: createdBatchId } });
  await prisma.enrollment.deleteMany({ where: { studentId: createdStudentId } });
  if (createdBatchId) {
    await prisma.batch.deleteMany({ where: { id: createdBatchId } });
  }
  if (createdStudentId) {
    await prisma.student.deleteMany({ where: { id: createdStudentId } });
  }
  if (createdSubjId) {
    await prisma.subject.deleteMany({ where: { id: createdSubjId } });
  }
  if (createdProgId) {
    await prisma.program.deleteMany({ where: { id: createdProgId } });
  }

  // Also clean up audit logs created for test records
  await prisma.auditLog.deleteMany({
    where: {
      entityId: {
        in: [
          createdClassId,
          createdEnrId,
          createdBatchId,
          createdStudentId,
          createdSubjId,
          createdProgId,
        ].filter(Boolean),
      },
    },
  });

  // 8. RBAC Verification (Unauthorized Student Role Rejections)
  console.log("\n--- 8. RBAC Verification (Student Direct Mutation Rejection) ---");
  const studentMutations = [
    { ep: "/api/programs", body: { code: "HACK", name: "Hack" } },
    { ep: "/api/subjects", body: { code: "HACK", name: "Hack" } },
    { ep: "/api/batches", body: { name: "Hack", programId: firstProgram.id, startDate: "2026-01-01" } },
    { ep: "/api/classes", body: { name: "Hack", batchId: firstBatch.id, instructorId: firstInstructor.id } },
    { ep: "/api/enrollments", body: { studentId: firstStudent.id, batchId: firstBatch.id } },
  ];

  for (const m of studentMutations) {
    const res = await request(m.ep, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify(m.body),
    });
    record(`Student mutation to ${m.ep} is rejected with 403`, 403, res.status);
  }

  // 9. Final Baseline Integrity Check
  console.log("\n--- 9. Final Database Baseline Integrity Check ---");
  const finalCounts = await getBaselineCounts();
  record("Final Users count is 2", 2, finalCounts.users);
  record("Final Instructors count is 6", 6, finalCounts.instructors);
  record("Final Programs count is 1", 1, finalCounts.programs);
  record("Final Batches count is 2", 2, finalCounts.batches);
  record("Final Students count is 21", 21, finalCounts.students);
  record("Final Enrollments count is 21", 21, finalCounts.enrollments);
  record("Final Subjects count is 6", 6, finalCounts.subjects);
  record("Final Classes count is 10", 10, finalCounts.classes);
  record("Final Schedules count is 10", 10, finalCounts.schedules);

  // Summary
  console.log("\n==================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`TOTAL ASSERTIONS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log("==================================================");

  if (failed > 0) {
    console.error(`\nFAILED TESTS: ${failed}`);
    process.exit(1);
  } else {
    console.log("\nALL STEP 73C TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  }
}

run()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
