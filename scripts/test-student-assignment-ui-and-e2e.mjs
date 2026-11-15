import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, AssignmentStatus, SubmissionStatus } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";
import { ASSIGNMENTS_BUCKET } from "../lib/storage.ts";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let total = 0;

function record(name, condition, errorMsg = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}: ${errorMsg}`);
    throw new Error(`Test failed: ${name} - ${errorMsg}`);
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
    if (separator > 0) {
      values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await request("/api/auth/callback/credentials", {
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

  cookies = mergeCookies(cookies, res);
  if (res.status !== 302 && res.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  return cookies;
}

function createSubmissionFormData(fileName, buffer, mimeType, content = "") {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append("file", blob, fileName);
  if (content) {
    formData.append("content", content);
  }
  return formData;
}

async function runStudentUiAndE2ETestSuite() {
  console.log("=== RUNNING STUDENT ASSIGNMENT UI & E2E INTEGRATION SUITE ===\n");

  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const testPassword = `Pass#${runId}!Aa1`;
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const cleanupUserIds = [];
  const cleanupStudentIds = [];
  const cleanupInstructorIds = [];
  const cleanupClassIds = [];
  const cleanupBatchIds = [];
  const cleanupSubjectIds = [];
  const cleanupProgramIds = [];
  const cleanupAssignmentIds = [];
  const cleanupProbePaths = [];

  try {
    // 1. Roles verification
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const instructorRole = await prisma.role.findUniqueOrThrow({ where: { name: "INSTRUCTOR" } });

    // 2. Program & Subject
    const program = await prisma.program.create({
      data: {
        code: `PRG${runId}`,
        name: `Program Test ${runId}`,
      },
    });
    cleanupProgramIds.push(program.id);

    const subject = await prisma.subject.create({
      data: {
        code: `SUB${runId}`,
        name: `Mata Pelajaran Test ${runId}`,
      },
    });
    cleanupSubjectIds.push(subject.id);

    // 3. Batches
    const batchA = await prisma.batch.create({
      data: {
        name: `Batch A ${runId}`,
        programId: program.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      },
    });
    cleanupBatchIds.push(batchA.id);

    const batchB = await prisma.batch.create({
      data: {
        name: `Batch B ${runId}`,
        programId: program.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      },
    });
    cleanupBatchIds.push(batchB.id);

    // 4. Instructors
    const instUser = await prisma.user.create({
      data: {
        email: `instructor.${runId}@ghs.test`,
        passwordHash,
        name: `Instruktur ${runId}`,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(instUser.id);

    const instructor = await prisma.instructor.create({
      data: {
        userId: instUser.id,
        name: `Instruktur ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor.id);

    // 5. Classes
    const class1 = await prisma.class.create({
      data: {
        name: `Kelas 1 ${runId}`,
        batchId: batchA.id,
        instructorId: instructor.id,
      },
    });
    cleanupClassIds.push(class1.id);

    const class2 = await prisma.class.create({
      data: {
        name: `Kelas 2 ${runId}`,
        batchId: batchB.id,
        instructorId: instructor.id,
      },
    });
    cleanupClassIds.push(class2.id);

    // 6. Students
    // Student 1 in Batch A (enrolled in Class 1)
    const std1User = await prisma.user.create({
      data: {
        email: `student1.${runId}@ghs.test`,
        passwordHash,
        name: `Mahasiswa Satu ${runId}`,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(std1User.id);

    const student1 = await prisma.student.create({
      data: {
        userId: std1User.id,
        nim: `NIM1${runId}`,
        name: `Mahasiswa Satu ${runId}`,
      },
    });
    cleanupStudentIds.push(student1.id);

    await prisma.enrollment.create({
      data: {
        studentId: student1.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });

    // Student 2 in Batch A (enrolled in Class 1 as peer)
    const std2User = await prisma.user.create({
      data: {
        email: `student2.${runId}@ghs.test`,
        passwordHash,
        name: `Mahasiswa Dua ${runId}`,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(std2User.id);

    const student2 = await prisma.student.create({
      data: {
        userId: std2User.id,
        nim: `NIM2${runId}`,
        name: `Mahasiswa Dua ${runId}`,
      },
    });
    cleanupStudentIds.push(student2.id);

    await prisma.enrollment.create({
      data: {
        studentId: student2.id,
        batchId: batchA.id,
        status: "ACTIVE",
      },
    });

    // 7. Assignments
    // Assignment 1 in Class 1 (Batch A)
    const asgn1 = await prisma.assignment.create({
      data: {
        title: `Tugas Analisis Kasus ${runId}`,
        description: `Silakan unduh materi dan kerjakan analisis kasus berikut secara mandiri.`,
        classId: class1.id,
        subjectId: subject.id,
        instructorId: instructor.id,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days in future
        allowLateSubmission: true,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
        attachmentName: "panduan_analisis.pdf",
        attachmentSize: 1024,
        attachmentType: "application/pdf",
        attachmentPath: `assignments/instructions/mock_guide_${runId}.pdf`,
      },
    });
    cleanupAssignmentIds.push(asgn1.id);

    // Assignment 2 in Class 2 (Batch B)
    const asgn2 = await prisma.assignment.create({
      data: {
        title: `Tugas Kelas Dua ${runId}`,
        description: `Tugas khusus untuk kelas 2 batch B.`,
        classId: class2.id,
        subjectId: subject.id,
        instructorId: instructor.id,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        allowLateSubmission: false,
        maxScore: 100,
        status: AssignmentStatus.PUBLISHED,
      },
    });
    cleanupAssignmentIds.push(asgn2.id);

    // 8. Authenticate student sessions
    console.log("Authenticating student user sessions...");
    const std1Cookies = await login(std1User.email, testPassword);
    const std2Cookies = await login(std2User.email, testPassword);
    console.log("Sessions authenticated successfully.\n");

    // =================================================================
    // SECTION 1: UI HTML Page Routes
    // =================================================================
    console.log("--- SECTION 1: Server-Rendered UI Page Routes ---");

    // 1.1 GET /assignments with Student session
    const resUiList = await request("/assignments", {
      headers: { Cookie: std1Cookies },
    });
    const htmlList = await resUiList.text();

    record(
      "UI: Student accesses /assignments page (HTTP 200)",
      resUiList.status === 200,
      `Expected 200, got ${resUiList.status}`
    );

    record(
      "UI: /assignments renders AppShell title and sidebar marker",
      htmlList.includes("Tugas"),
      "Response does not contain 'Tugas'"
    );

    // 1.2 GET /assignments/[id] with Student session
    const resUiDetail = await request(`/assignments/${asgn1.id}`, {
      headers: { Cookie: std1Cookies },
    });
    const htmlDetail = await resUiDetail.text();

    record(
      "UI: Student accesses /assignments/[id] detail page (HTTP 200)",
      resUiDetail.status === 200,
      `Expected 200, got ${resUiDetail.status}`
    );

    record(
      "UI: /assignments/[id] contains detail title",
      htmlDetail.includes("Detail Tugas"),
      "Detail page missing 'Detail Tugas'"
    );

    // 1.3 Unauthenticated access redirect
    const resUnauth = await request("/assignments", {
      redirect: "manual",
    });

    record(
      "UI: Unauthenticated access redirects to login (HTTP 307/302/401)",
      [302, 307, 401].includes(resUnauth.status),
      `Expected redirect or 401, got ${resUnauth.status}`
    );

    // =================================================================
    // SECTION 2: Student API Endpoints (Data & Scoping)
    // =================================================================
    console.log("\n--- SECTION 2: Student API Scoping & Relational Integrity ---");

    // 2.1 GET /api/assignments lists published assignments for Student's batch
    const resApiList = await request("/api/assignments", {
      headers: { Cookie: std1Cookies },
    });
    const apiListJson = await resApiList.json();

    record(
      "API: Student lists assignments successfully (HTTP 200)",
      resApiList.status === 200 && Array.isArray(apiListJson.data),
      `Failed: ${JSON.stringify(apiListJson)}`
    );

    const foundAsgn1 = apiListJson.data.find((a) => a.id === asgn1.id);
    const foundAsgn2 = apiListJson.data.find((a) => a.id === asgn2.id);

    record(
      "API: Student sees assignment for enrolled Class 1 batch",
      Boolean(foundAsgn1),
      "Assignment 1 not found in student list"
    );

    record(
      "API: Student does NOT see assignment from other Class 2 batch (Scoping)",
      !foundAsgn2,
      "Leaked Assignment 2 from Class 2!"
    );

    record(
      "API: Assignment list includes student's own submission state (null initially)",
      foundAsgn1 && foundAsgn1.mySubmission === null,
      `Expected mySubmission null, got: ${JSON.stringify(foundAsgn1?.mySubmission)}`
    );

    // 2.2 GET /api/assignments/[id] detail
    const resApiDetail = await request(`/api/assignments/${asgn1.id}`, {
      headers: { Cookie: std1Cookies },
    });
    const apiDetailJson = await resApiDetail.json();

    record(
      "API: Student fetches assignment detail (HTTP 200)",
      resApiDetail.status === 200 && apiDetailJson.data?.id === asgn1.id,
      `Failed: ${JSON.stringify(apiDetailJson)}`
    );

    record(
      "API: Detail returns instruction attachmentUrl and omits internal attachmentPath",
      typeof apiDetailJson.data.attachmentUrl === "string" &&
        apiDetailJson.data.attachmentPath === undefined,
      `Leaked raw attachmentPath or missing signed URL: ${JSON.stringify(apiDetailJson.data)}`
    );

    // =================================================================
    // SECTION 3: Submission & Resubmission Workflow
    // =================================================================
    console.log("\n--- SECTION 3: Submission & Resubmission Workflow ---");

    const validPdfBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
    );

    // 3.1 Initial submission by Student 1
    const formSubmit1 = createSubmissionFormData(
      "tugas_analisis_v1.pdf",
      validPdfBuffer,
      "application/pdf",
      "Pengantar tugas versi 1"
    );

    const resSubmit1 = await request(`/api/assignments/${asgn1.id}/submissions`, {
      method: "POST",
      headers: {
        Cookie: std1Cookies,
      },
      body: formSubmit1,
    });
    const submit1Json = await resSubmit1.json();

    record(
      "API: Student 1 submits assignment successfully (HTTP 201)",
      resSubmit1.status === 201 && submit1Json.id,
      `Expected 201, got ${resSubmit1.status}: ${JSON.stringify(submit1Json)}`
    );

    record(
      "API: Submission returns status SUBMITTED, attemptCount 1, and signed downloadUrl",
      submit1Json.status === SubmissionStatus.SUBMITTED &&
        submit1Json.attemptCount === 1 &&
        typeof submit1Json.downloadUrl === "string" &&
        submit1Json.storagePath === undefined,
      `Response invalid: ${JSON.stringify(submit1Json)}`
    );

    const submission1Id = submit1Json.id;

    // 3.2 Fetch assignment detail after submission
    const resApiDetailAfterSub = await request(`/api/assignments/${asgn1.id}`, {
      headers: { Cookie: std1Cookies },
    });
    const detailAfterSubJson = await resApiDetailAfterSub.json();

    record(
      "API: Detail response now contains student's active submission with downloadUrl",
      detailAfterSubJson.data.mySubmission?.id === submission1Id &&
        detailAfterSubJson.data.mySubmission?.status === SubmissionStatus.SUBMITTED &&
        typeof detailAfterSubJson.data.mySubmission?.downloadUrl === "string",
      `mySubmission invalid: ${JSON.stringify(detailAfterSubJson.data.mySubmission)}`
    );

    // 3.3 Student 1 resubmits assignment
    const formSubmit2 = createSubmissionFormData(
      "tugas_analisis_v2_revisi.pdf",
      validPdfBuffer,
      "application/pdf",
      "Revisi perbaikan tugas"
    );

    const resSubmit2 = await request(`/api/assignments/${asgn1.id}/submissions`, {
      method: "POST",
      headers: {
        Cookie: std1Cookies,
      },
      body: formSubmit2,
    });
    const submit2Json = await resSubmit2.json();

    record(
      "API: Student 1 resubmission succeeds with attemptCount 2 and RESUBMITTED status",
      resSubmit2.status === 201 &&
        submit2Json.id === submission1Id &&
        submit2Json.attemptCount === 2 &&
        submit2Json.status === SubmissionStatus.RESUBMITTED &&
        submit2Json.fileName === "tugas_analisis_v2_revisi.pdf",
      `Expected resubmission result, got: ${JSON.stringify(submit2Json)}`
    );

    // =================================================================
    // SECTION 4: Cross-Student Access Control (IDOR & Privacy)
    // =================================================================
    console.log("\n--- SECTION 4: Cross-Student Security & IDOR Verification ---");

    // 4.1 Student 2 views assignment detail (should NOT see Student 1's submission)
    const resStd2Detail = await request(`/api/assignments/${asgn1.id}`, {
      headers: { Cookie: std2Cookies },
    });
    const std2DetailJson = await resStd2Detail.json();

    record(
      "Security: Student 2 detail shows mySubmission null (does not leak Student 1 submission)",
      resStd2Detail.status === 200 && std2DetailJson.data.mySubmission === null,
      `Student 2 received: ${JSON.stringify(std2DetailJson.data.mySubmission)}`
    );

    // 4.2 Student 2 attempts to directly access Student 1's submission by ID
    const resStd2DirectAccess = await request(
      `/api/assignments/${asgn1.id}/submissions/${submission1Id}`,
      { headers: { Cookie: std2Cookies } }
    );

    record(
      "Security: Student 2 directly accessing Student 1's submission is rejected (HTTP 403)",
      resStd2DirectAccess.status === 403,
      `Expected 403, got ${resStd2DirectAccess.status}`
    );

    // 4.3 Student 1 attempts to access Class-Wide Recap endpoint
    const resStd1ClassRecap = await request(`/api/assignments/${asgn1.id}/submissions`, {
      headers: { Cookie: std1Cookies },
    });

    record(
      "Security: Student 1 accessing class recap endpoint is rejected (HTTP 403)",
      resStd1ClassRecap.status === 403,
      `Expected 403, got ${resStd1ClassRecap.status}`
    );

    // =================================================================
    // SECTION 5: Live Supabase Storage Verification
    // =================================================================
    console.log("\n--- SECTION 5: Live Supabase Storage Cloud Verification ---");

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey && !supabaseUrl.includes("your-project")) {
      const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const liveProbePath = `assignments/submissions/${asgn1.id}/${student1.id}/probe_${runId}.pdf`;
      cleanupProbePaths.push(liveProbePath);

      // Upload live probe to private 'assignments' bucket
      const { error: liveUploadErr } = await client.storage
        .from(ASSIGNMENTS_BUCKET)
        .upload(liveProbePath, validPdfBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      record(
        "Live Storage: Upload student submission file to Supabase 'assignments' bucket",
        !liveUploadErr,
        `Upload error: ${liveUploadErr?.message}`
      );

      // Generate signed URL (900s)
      const { data: signedData, error: signedErr } = await client.storage
        .from(ASSIGNMENTS_BUCKET)
        .createSignedUrl(liveProbePath, 900);

      record(
        "Live Storage: Generate 900-second expiring signed URL from Supabase",
        !signedErr && Boolean(signedData?.signedUrl),
        `Signed URL error: ${signedErr?.message}`
      );

      if (signedData?.signedUrl) {
        // Download via signed URL
        const resDownload = await fetch(signedData.signedUrl);
        const downloadedBuf = Buffer.from(await resDownload.arrayBuffer());

        record(
          "Live Storage: Download file via signed URL matches exact uploaded binary",
          resDownload.ok && downloadedBuf.equals(validPdfBuffer),
          `Download status: ${resDownload.status}, bytes: ${downloadedBuf.length}`
        );
      }

      // Verify unauthenticated public access is blocked
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${ASSIGNMENTS_BUCKET}/${liveProbePath}`;
      const resPublic = await fetch(publicUrl);

      record(
        "Live Storage: Direct public URL access without signed token is blocked (HTTP 400)",
        resPublic.status === 400,
        `Expected 400, got ${resPublic.status}`
      );

      // Cleanup probe
      const { error: cleanupErr } = await client.storage
        .from(ASSIGNMENTS_BUCKET)
        .remove([liveProbePath]);

      record(
        "Live Storage: Probe file cleaned up from Supabase Storage",
        !cleanupErr,
        `Cleanup error: ${cleanupErr?.message}`
      );
    } else {
      console.log("ℹ Live Supabase Storage credentials not configured for cloud probe, skipped Section 5.");
    }

    console.log("\n==================================================");
    console.log(`ALL TESTS FINISHED: ${passed}/${total} PASSED`);
    console.log("==================================================");
  } finally {
    // Teardown database fixtures
    console.log("\nTearing down test database records...");

    try {
      if (cleanupAssignmentIds.length) {
        await prisma.assignmentSubmission.deleteMany({
          where: { assignmentId: { in: cleanupAssignmentIds } },
        });
        await prisma.assignment.deleteMany({
          where: { id: { in: cleanupAssignmentIds } },
        });
      }

      if (cleanupStudentIds.length) {
        await prisma.enrollment.deleteMany({
          where: { studentId: { in: cleanupStudentIds } },
        });
        await prisma.student.deleteMany({
          where: { id: { in: cleanupStudentIds } },
        });
      }

      if (cleanupInstructorIds.length) {
        await prisma.class.deleteMany({
          where: { id: { in: cleanupClassIds } },
        });
        await prisma.instructor.deleteMany({
          where: { id: { in: cleanupInstructorIds } },
        });
      }

      if (cleanupBatchIds.length) {
        await prisma.batch.deleteMany({
          where: { id: { in: cleanupBatchIds } },
        });
      }

      if (cleanupSubjectIds.length) {
        await prisma.subject.deleteMany({
          where: { id: { in: cleanupSubjectIds } },
        });
      }

      if (cleanupProgramIds.length) {
        await prisma.program.deleteMany({
          where: { id: { in: cleanupProgramIds } },
        });
      }

      if (cleanupUserIds.length) {
        await prisma.instructor.deleteMany({
          where: { userId: { in: cleanupUserIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { userId: { in: cleanupUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: cleanupUserIds } },
        });
      }
    } catch (cleanupDbErr) {
      console.warn("Notice: Test fixture DB cleanup warning:", cleanupDbErr.message);
    }

    console.log("Teardown completed.");
  }
}

runStudentUiAndE2ETestSuite()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
