// scripts/test-step73b-academic-core.mjs
// Step 73B: Academic Core Backend Implementation & Hardening Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP73B_ACADEMIC_CORE_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP73B_ACADEMIC_CORE_CONFIRM_DATABASE",
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
  console.log("=== STEP 73B ACADEMIC CORE TEST SUITE ===\n");

  const createdUserIds = [];

  try {
    // 0. Capture initial baseline
    console.log("Capturing database baseline...");
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

    // Setup logins
    const adminLogin = await login("admin.demo@ghs.local", "superadmin123");
    const studentLogin = await login("student.demo@ghs.local", "murid123");

    // Create temp Management user
    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const managementUser = await prisma.user.create({
      data: {
        email: "test.management.73b@ghs.local",
        name: "Test Management 73B",
        passwordHash: tempPasswordHash,
        roleId: roleMap.get("MANAGEMENT"),
      },
    });
    createdUserIds.push(managementUser.id);
    const managementLogin = await login(managementUser.email, tempPassword);

    // Find baseline records for testing
    const baselineProgram = await prisma.program.findFirst({ orderBy: { id: "asc" } });
    const baselineSubject = await prisma.subject.findFirst({ orderBy: { id: "asc" } });
    const baselineBatch = await prisma.batch.findFirst({ orderBy: { id: "asc" } });
    const baselineClass = await prisma.class.findFirst({ orderBy: { id: "asc" } });
    const baselineEnrollment = await prisma.enrollment.findFirst({ orderBy: { id: "asc" } });

    // Identify demo student record
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
      include: { student: true },
    });
    const ownStudent = demoStudentUser?.student;
    if (!ownStudent) throw new Error("Demo student record not linked in database!");

    const otherStudent = await prisma.student.findFirst({
      where: { id: { not: ownStudent.id } },
    });

    // ==========================================
    // A. Authentication (tests 1-6)
    // ==========================================
    console.log("\n--- Section A: Authentication ---");
    const unauthStudents = await api("GET", "/api/students");
    record("1. unauth GET Students -> 401", 401, unauthStudents.status, "AUTH");

    const unauthPrograms = await api("GET", "/api/programs");
    record("2. unauth GET Programs -> 401", 401, unauthPrograms.status, "AUTH");

    const unauthSubjects = await api("GET", "/api/subjects");
    record("3. unauth GET Subjects -> 401", 401, unauthSubjects.status, "AUTH");

    const unauthBatches = await api("GET", "/api/batches");
    record("4. unauth GET Batches -> 401", 401, unauthBatches.status, "AUTH");

    const unauthClasses = await api("GET", "/api/classes");
    record("5. unauth GET Classes -> 401", 401, unauthClasses.status, "AUTH");

    const unauthEnrollments = await api("GET", "/api/enrollments");
    record("6. unauth GET Enrollments -> 401", 401, unauthEnrollments.status, "AUTH");

    // ==========================================
    // B. Program PATCH & DELETE (tests 7-12)
    // ==========================================
    console.log("\n--- Section B: Program PATCH ---");
    // 7. Valid admin update
    const origProgramName = baselineProgram.name;
    const patchProgValid = await api("PATCH", `/api/programs/${baselineProgram.id}`, adminLogin.cookies, {
      name: `${origProgramName} [Step 73B Temp]`,
    });
    record("7. valid admin Program update -> 200", 200, patchProgValid.status, "PROGRAM");
    // Restore
    await api("PATCH", `/api/programs/${baselineProgram.id}`, adminLogin.cookies, {
      name: origProgramName,
    });

    // 8. Duplicate code -> 409
    // Try to create a temp program or update to existing code
    // If we only have 1 program, create a temporary program, try to update code to collide, then delete temp program
    const tempProg = await prisma.program.create({
      data: {
        code: "TEMP-PROG-73B",
        name: "Temporary Program 73B",
      },
    });
    const patchProgDup = await api("PATCH", `/api/programs/${tempProg.id}`, adminLogin.cookies, {
      code: baselineProgram.code, // already in use
    });
    record("8. Program duplicate code -> 409", 409, patchProgDup.status, "PROGRAM");
    await prisma.program.delete({ where: { id: tempProg.id } });

    // 9. Invalid ID -> 404
    const patchProgMissing = await api("PATCH", "/api/programs/00000000-0000-0000-0000-000000000000", adminLogin.cookies, {
      name: "Nonexistent",
    });
    record("9. Program invalid ID -> 404", 404, patchProgMissing.status, "PROGRAM");

    // 10. Student -> 403
    const patchProgStudent = await api("PATCH", `/api/programs/${baselineProgram.id}`, studentLogin.cookies, {
      name: "Hacked by Student",
    });
    record("10. Student Program PATCH -> 403", 403, patchProgStudent.status, "PROGRAM");

    // 11. Management mutation -> 403
    const patchProgMgmt = await api("PATCH", `/api/programs/${baselineProgram.id}`, managementLogin.cookies, {
      name: "Management update",
    });
    record("11. Management Program mutation -> 403", 403, patchProgMgmt.status, "PROGRAM");

    // 12. DELETE -> 405
    const delProgram = await api("DELETE", `/api/programs/${baselineProgram.id}`, adminLogin.cookies);
    record("12. Program DELETE -> 405", 405, delProgram.status, "PROGRAM");

    // ==========================================
    // C. Subject PATCH & DELETE (tests 13-17)
    // ==========================================
    console.log("\n--- Section C: Subject PATCH ---");
    // 13. Valid update
    const origSubjectName = baselineSubject.name;
    const patchSubValid = await api("PATCH", `/api/subjects/${baselineSubject.id}`, adminLogin.cookies, {
      name: `${origSubjectName} [Step 73B Temp]`,
    });
    record("13. valid admin Subject update -> 200", 200, patchSubValid.status, "SUBJECT");
    // Restore
    await api("PATCH", `/api/subjects/${baselineSubject.id}`, adminLogin.cookies, {
      name: origSubjectName,
    });

    // 14. Duplicate code -> 409
    const otherSubject = await prisma.subject.findFirst({
      where: { id: { not: baselineSubject.id } },
    });
    const patchSubDup = await api("PATCH", `/api/subjects/${baselineSubject.id}`, adminLogin.cookies, {
      code: otherSubject.code,
    });
    record("14. Subject duplicate code -> 409", 409, patchSubDup.status, "SUBJECT");

    // 15. Invalid ID -> 404
    const patchSubMissing = await api("PATCH", "/api/subjects/00000000-0000-0000-0000-000000000000", adminLogin.cookies, {
      name: "Nonexistent",
    });
    record("15. Subject invalid ID -> 404", 404, patchSubMissing.status, "SUBJECT");

    // 16. Student -> 403
    const patchSubStudent = await api("PATCH", `/api/subjects/${baselineSubject.id}`, studentLogin.cookies, {
      name: "Hacked",
    });
    record("16. Student Subject PATCH -> 403", 403, patchSubStudent.status, "SUBJECT");

    // 17. DELETE -> 405
    const delSubject = await api("DELETE", `/api/subjects/${baselineSubject.id}`, adminLogin.cookies);
    record("17. Subject DELETE -> 405", 405, delSubject.status, "SUBJECT");

    // ==========================================
    // D. Batch PATCH & DELETE (tests 18-22)
    // ==========================================
    console.log("\n--- Section D: Batch PATCH ---");
    // 18. Valid update
    const origBatchName = baselineBatch.name;
    const patchBatchValid = await api("PATCH", `/api/batches/${baselineBatch.id}`, adminLogin.cookies, {
      name: `${origBatchName} [Step 73B Temp]`,
    });
    record("18. valid admin Batch update -> 200", 200, patchBatchValid.status, "BATCH");
    // Restore
    await api("PATCH", `/api/batches/${baselineBatch.id}`, adminLogin.cookies, {
      name: origBatchName,
    });

    // 19. Invalid programId -> 404
    const patchBatchBadProg = await api("PATCH", `/api/batches/${baselineBatch.id}`, adminLogin.cookies, {
      programId: "00000000-0000-0000-0000-000000000000",
    });
    record("19. Batch invalid programId -> 404", 404, patchBatchBadProg.status, "BATCH");

    // 20. Invalid date range -> 400
    const patchBatchBadDate = await api("PATCH", `/api/batches/${baselineBatch.id}`, adminLogin.cookies, {
      startDate: "2026-12-01",
      endDate: "2026-01-01", // end < start
    });
    record("20. Batch invalid date range -> 400", 400, patchBatchBadDate.status, "BATCH");

    // 21. Student -> 403
    const patchBatchStudent = await api("PATCH", `/api/batches/${baselineBatch.id}`, studentLogin.cookies, {
      name: "Hacked",
    });
    record("21. Student Batch PATCH -> 403", 403, patchBatchStudent.status, "BATCH");

    // 22. DELETE -> 405
    const delBatch = await api("DELETE", `/api/batches/${baselineBatch.id}`, adminLogin.cookies);
    record("22. Batch DELETE -> 405", 405, delBatch.status, "BATCH");

    // ==========================================
    // E. Class PATCH & DELETE (tests 23-28)
    // ==========================================
    console.log("\n--- Section E: Class PATCH ---");
    // 23. Valid update
    const origClassStatus = baselineClass.status;
    const patchClassValid = await api("PATCH", `/api/classes/${baselineClass.id}`, adminLogin.cookies, {
      status: "COMPLETED",
    });
    record("23. valid admin Class update -> 200", 200, patchClassValid.status, "CLASS");
    // Restore
    await api("PATCH", `/api/classes/${baselineClass.id}`, adminLogin.cookies, {
      status: origClassStatus,
    });

    // 24. Invalid batchId -> 404
    const patchClassBadBatch = await api("PATCH", `/api/classes/${baselineClass.id}`, adminLogin.cookies, {
      batchId: "00000000-0000-0000-0000-000000000000",
    });
    record("24. Class invalid batchId -> 404", 404, patchClassBadBatch.status, "CLASS");

    // 25. Invalid instructorId -> 404
    const patchClassBadInst = await api("PATCH", `/api/classes/${baselineClass.id}`, adminLogin.cookies, {
      instructorId: "00000000-0000-0000-0000-000000000000",
    });
    record("25. Class invalid instructorId -> 404", 404, patchClassBadInst.status, "CLASS");

    // 26. Invalid status -> 400
    const patchClassBadStatus = await api("PATCH", `/api/classes/${baselineClass.id}`, adminLogin.cookies, {
      status: "NONEXISTENT_STATUS",
    });
    record("26. Class invalid status -> 400", 400, patchClassBadStatus.status, "CLASS");

    // 27. Student -> 403
    const patchClassStudent = await api("PATCH", `/api/classes/${baselineClass.id}`, studentLogin.cookies, {
      status: "CANCELLED",
    });
    record("27. Student Class PATCH -> 403", 403, patchClassStudent.status, "CLASS");

    // 28. DELETE -> 405
    const delClass = await api("DELETE", `/api/classes/${baselineClass.id}`, adminLogin.cookies);
    record("28. Class DELETE -> 405", 405, delClass.status, "CLASS");

    // ==========================================
    // F. Enrollment PATCH & DELETE (tests 29-34)
    // ==========================================
    console.log("\n--- Section F: Enrollment PATCH ---");
    // 29. Valid status update
    const origEnrollStatus = baselineEnrollment.status;
    const patchEnrStatus = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies, {
      status: "COMPLETED",
    });
    record("29. valid admin Enrollment status update -> 200", 200, patchEnrStatus.status, "ENROLLMENT");
    // Restore
    await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies, {
      status: origEnrollStatus,
    });

    // 30. Valid notes update
    const origEnrollNotes = baselineEnrollment.notes;
    const patchEnrNotes = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies, {
      notes: "Temporary test notes 73B",
    });
    record("30. valid admin Enrollment notes update -> 200", 200, patchEnrNotes.status, "ENROLLMENT");
    // Restore
    await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies, {
      notes: origEnrollNotes,
    });

    // 31. Invalid status -> 400
    const patchEnrBadStatus = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies, {
      status: "INVALID_ENROLLMENT_STATUS",
    });
    record("31. Enrollment invalid status -> 400", 400, patchEnrBadStatus.status, "ENROLLMENT");

    // 32. Invalid ID -> 404
    const patchEnrMissing = await api("PATCH", "/api/enrollments/00000000-0000-0000-0000-000000000000", adminLogin.cookies, {
      status: "COMPLETED",
    });
    record("32. Enrollment invalid ID -> 404", 404, patchEnrMissing.status, "ENROLLMENT");

    // 33. Student -> 403
    const patchEnrStudent = await api("PATCH", `/api/enrollments/${baselineEnrollment.id}`, studentLogin.cookies, {
      status: "COMPLETED",
    });
    record("33. Student Enrollment PATCH -> 403", 403, patchEnrStudent.status, "ENROLLMENT");

    // 34. DELETE -> 405
    const delEnrollment = await api("DELETE", `/api/enrollments/${baselineEnrollment.id}`, adminLogin.cookies);
    record("34. Enrollment DELETE -> 405", 405, delEnrollment.status, "ENROLLMENT");

    // ==========================================
    // G. Student Ownership (tests 35-38)
    // ==========================================
    console.log("\n--- Section G: Student Ownership ---");
    // 35. Student GET own -> 200
    const studentGetOwn = await api("GET", `/api/students/${ownStudent.id}`, studentLogin.cookies);
    record("35. Student GET own -> 200", 200, studentGetOwn.status, "STUDENT_OWNERSHIP");

    // 36. Student GET other -> 403
    const studentGetOther = await api("GET", `/api/students/${otherStudent.id}`, studentLogin.cookies);
    record("36. Student GET other -> 403", 403, studentGetOther.status, "STUDENT_OWNERSHIP");

    // 37. Student PATCH own -> 200
    const origPhone = ownStudent.phone;
    const studentPatchOwn = await api("PATCH", `/api/students/${ownStudent.id}`, studentLogin.cookies, {
      phone: "+628999999999",
    });
    record("37. Student PATCH own -> 200", 200, studentPatchOwn.status, "STUDENT_OWNERSHIP");
    // Restore
    await api("PATCH", `/api/students/${ownStudent.id}`, studentLogin.cookies, {
      phone: origPhone,
    });

    // 38. Student PATCH other -> 403
    const studentPatchOther = await api("PATCH", `/api/students/${otherStudent.id}`, studentLogin.cookies, {
      phone: "+628888888888",
    });
    record("38. Student PATCH other -> 403", 403, studentPatchOther.status, "STUDENT_OWNERSHIP");

    // ==========================================
    // H. Security (tests 39-41)
    // ==========================================
    console.log("\n--- Section H: Security ---");
    // 39. Role cannot be escalated from request body
    const escalateRole = await api("PATCH", `/api/students/${ownStudent.id}`, studentLogin.cookies, {
      phone: origPhone,
      role: "SUPER_ADMIN",
    });
    // Schema is strict so role should either trigger 400 Bad Request or be ignored without escalating
    record("39. Role cannot be escalated from request body", 400, escalateRole.status, "SECURITY");

    // Verify user role is still STUDENT
    const verifyUser = await prisma.user.findUnique({
      where: { id: demoStudentUser.id },
      include: { role: true },
    });
    record("39b. Role in DB remains STUDENT", "STUDENT", verifyUser.role.name, "SECURITY");

    // 40. Unknown fields rejected
    const unknownFieldProgram = await api("PATCH", `/api/programs/${baselineProgram.id}`, adminLogin.cookies, {
      name: baselineProgram.name,
      unknownField: "malicious",
    });
    record("40. Unknown fields rejected in PATCH -> 400", 400, unknownFieldProgram.status, "SECURITY");

    // 41. PasswordHash absent from responses
    const studentDetail = await api("GET", `/api/students/${ownStudent.id}`, studentLogin.cookies);
    const hasPasswordHash =
      JSON.stringify(studentDetail.payload).includes("passwordHash") ||
      JSON.stringify(studentDetail.payload).includes("$2b$") ||
      JSON.stringify(studentDetail.payload).includes("$2a$");
    record("41. passwordHash absent from responses", false, hasPasswordHash, "SECURITY");

    // ==========================================
    // I. Database Integrity (tests 42-47)
    // ==========================================
    console.log("\n--- Section I: Database Integrity ---");
    // Clean up temporary user before count check
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }

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

    record("42. baseline Program count remains correct", initialCounts.programs, finalCounts.programs, "INTEGRITY");
    record("43. baseline Batch count remains correct", initialCounts.batches, finalCounts.batches, "INTEGRITY");
    record("44. baseline Subject count remains correct", initialCounts.subjects, finalCounts.subjects, "INTEGRITY");
    record("45. baseline Class count remains correct", initialCounts.classes, finalCounts.classes, "INTEGRITY");
    record("46. baseline Student count remains correct", initialCounts.students, finalCounts.students, "INTEGRITY");
    record("47. baseline Enrollment count remains correct", initialCounts.enrollments, finalCounts.enrollments, "INTEGRITY");

    record("47b. baseline Users count remains correct", initialCounts.users, finalCounts.users, "INTEGRITY");
    record("47c. baseline Instructors count remains correct", initialCounts.instructors, finalCounts.instructors, "INTEGRITY");
    record("47d. baseline Schedules count remains correct", initialCounts.schedules, finalCounts.schedules, "INTEGRITY");

  } finally {
    // Cleanup if any remaining
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
