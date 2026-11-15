import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
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

// Minimal valid PDF binary
function createMinimalPdfBuffer() {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;
  return Buffer.from(content, "utf-8");
}

// Minimal valid PNG binary
function createMinimalPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 width/height
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // 8-bit RGBA
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82,
  ]);
}

function createFormData(fields, file = null) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      formData.append(key, value.toString());
    }
  }
  if (file) {
    const blob = new Blob([file.buffer], { type: file.mimeType });
    formData.append("file", blob, file.name);
  }
  return formData;
}

async function runInstructorAssignmentUiAndE2ETestSuite() {
  console.log("=== RUNNING INSTRUCTOR ASSIGNMENT UI & E2E INTEGRATION SUITE (TAHAP 4B) ===\n");

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
  const cleanupSubmissionIds = [];

  try {
    // 0. Fetch roles
    const instructorRole = await prisma.role.findUniqueOrThrow({ where: { name: "INSTRUCTOR" } });
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });

    // 1. Setup Academic Program & Subject
    console.log("Setting up test academic fixtures...");
    const program = await prisma.program.create({
      data: {
        code: `PRG${runId}`,
        name: `Program Test ${runId}`,
      },
    });
    cleanupProgramIds.push(program.id);

    const subject = await prisma.subject.create({
      data: {
        code: `SUB-${runId}`,
        name: `Mata Kuliah ${runId}`,
        description: "Mata kuliah uji Tahap 4B",
      },
    });
    cleanupSubjectIds.push(subject.id);

    await prisma.programSubject.create({
      data: {
        programId: program.id,
        subjectId: subject.id,
      },
    });

    // 2. Setup Instructors (Instructor 1 & Instructor 2 for isolation test)
    const instructor1User = await prisma.user.create({
      data: {
        email: `instructor1_${runId}@ghs.test`,
        name: `Instruktur Satu ${runId}`,
        passwordHash,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(instructor1User.id);

    const instructor1 = await prisma.instructor.create({
      data: {
        userId: instructor1User.id,
        name: `Instruktur Satu ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor1.id);

    const instructor2User = await prisma.user.create({
      data: {
        email: `instructor2_${runId}@ghs.test`,
        name: `Instruktur Dua ${runId}`,
        passwordHash,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(instructor2User.id);

    const instructor2 = await prisma.instructor.create({
      data: {
        userId: instructor2User.id,
        name: `Instruktur Dua ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor2.id);

    // 3. Setup Batches & Classes
    const batch1 = await prisma.batch.create({
      data: {
        name: `Batch 1 ${runId}`,
        programId: program.id,
        startDate: new Date("2026-01-01"),
      },
    });
    cleanupBatchIds.push(batch1.id);

    const class1 = await prisma.class.create({
      data: {
        name: `Kelas 1-A ${runId}`,
        batchId: batch1.id,
        instructorId: instructor1.id,
      },
    });
    cleanupClassIds.push(class1.id);

    const batch2 = await prisma.batch.create({
      data: {
        name: `Batch 2 ${runId}`,
        programId: program.id,
        startDate: new Date("2026-01-01"),
      },
    });
    cleanupBatchIds.push(batch2.id);

    const class2 = await prisma.class.create({
      data: {
        name: `Kelas 2-B ${runId}`,
        batchId: batch2.id,
        instructorId: instructor2.id,
      },
    });
    cleanupClassIds.push(class2.id);

    // 4. Setup Students (Student A and Student B in Batch 1)
    const studentAUser = await prisma.user.create({
      data: {
        email: `studentA_${runId}@ghs.test`,
        name: `Mahasiswa A ${runId}`,
        passwordHash,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(studentAUser.id);

    const studentA = await prisma.student.create({
      data: {
        userId: studentAUser.id,
        nim: `NIM-A-${runId}`,
        name: `Mahasiswa A ${runId}`,
      },
    });
    cleanupStudentIds.push(studentA.id);

    await prisma.enrollment.create({
      data: {
        studentId: studentA.id,
        batchId: batch1.id,
        status: "ACTIVE",
      },
    });

    const studentBUser = await prisma.user.create({
      data: {
        email: `studentB_${runId}@ghs.test`,
        name: `Mahasiswa B ${runId}`,
        passwordHash,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(studentBUser.id);

    const studentB = await prisma.student.create({
      data: {
        userId: studentBUser.id,
        nim: `NIM-B-${runId}`,
        name: `Mahasiswa B ${runId}`,
      },
    });
    cleanupStudentIds.push(studentB.id);

    await prisma.enrollment.create({
      data: {
        studentId: studentB.id,
        batchId: batch1.id,
        status: "ACTIVE",
      },
    });

    // 5. Authenticate sessions
    console.log("Authenticating test sessions...");
    const instructor1Cookie = await login(instructor1User.email, testPassword);
    const instructor2Cookie = await login(instructor2User.email, testPassword);
    const studentACookie = await login(studentAUser.email, testPassword);

    // TEST 1: Unauthenticated access to /assignments redirects to /login
    const unauthRes = await request("/assignments", { redirect: "manual" });
    record(
      "Unauthenticated access to /assignments returns 307 redirect to login",
      unauthRes.status === 307 && unauthRes.headers.get("location")?.includes("/login")
    );

    // TEST 2: Instructor access to /assignments returns 200 OK with Instructor UI
    const instructorPageRes = await request("/assignments", {
      headers: { Cookie: instructor1Cookie },
    });
    const instructorPageHtml = await instructorPageRes.text();
    record(
      "Instructor access to /assignments returns 200 OK with page header",
      instructorPageRes.status === 200 && instructorPageHtml.includes("Tugas")
    );

    // TEST 3: Instructor creates Assignment with valid PDF attachment via POST /api/assignments
    const pdfBuffer = createMinimalPdfBuffer();
    const createFormDataObj = createFormData(
      {
        title: `Tugas Analisis Modul 1 ${runId}`,
        description: "Kerjakan laporan analisis berikut dan kumpulkan berkas PDF",
        classId: class1.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        allowLateSubmission: true,
        maxScore: 100,
        status: "PUBLISHED",
      },
      {
        buffer: pdfBuffer,
        name: `materi-panduan-${runId}.pdf`,
        mimeType: "application/pdf",
      }
    );

    const createRes = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: instructor1Cookie },
      body: createFormDataObj,
    });
    const createData = await createRes.json();
    const createdAssignment = createData.data || createData;
    record(
      "Instructor 1 creates assignment with valid PDF attachment (HTTP 201)",
      createRes.status === 201 &&
        Boolean(createdAssignment?.id) &&
        (createdAssignment.attachmentName || createdAssignment.attachmentFileName) === `materi-panduan-${runId}.pdf`,
      `Status: ${createRes.status}, body: ${JSON.stringify(createData)}`
    );
    const assignment1Id = createdAssignment.id;
    cleanupAssignmentIds.push(assignment1Id);

    // TEST 4: Instructor 1 cannot create assignment for Class 2 (taught by Instructor 2)
    const crossCreateRes = await request("/api/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: instructor1Cookie,
      },
      body: JSON.stringify({
        title: `Tugas Ilegal ${runId}`,
        classId: class2.id, // Class 2 belongs to Instructor 2!
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    record(
      "Instructor 1 is forbidden from creating assignment for Class 2 (HTTP 403)",
      crossCreateRes.status === 403
    );

    // TEST 5: Instructor creates assignment with disallowed file extension (e.g. .exe masquerading as .pdf)
    const fakeExeBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00");
    const invalidFileForm = createFormData(
      {
        title: `Tugas Disguised ${runId}`,
        classId: class1.id,
        subjectId: subject.id,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        buffer: fakeExeBuffer,
        name: "malicious.pdf",
        mimeType: "application/pdf",
      }
    );
    const invalidFileRes = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: instructor1Cookie },
      body: invalidFileForm,
    });
    record(
      "Rejects assignment creation with invalid file signature/binary (HTTP 400)",
      invalidFileRes.status === 400
    );

    // TEST 6: Instructor 1 lists assignments (GET /api/assignments)
    const listRes = await request(`/api/assignments?classId=${class1.id}`, {
      headers: { Cookie: instructor1Cookie },
    });
    const listData = await listRes.json();
    record(
      "Instructor 1 retrieves assignments scoped to their class",
      listRes.status === 200 &&
        Array.isArray(listData.data) &&
        listData.data.some((a) => a.id === assignment1Id)
    );

    // TEST 7: Instructor 2 cannot see Instructor 1's assignment when filtering for Class 1
    const crossListRes = await request(`/api/assignments?classId=${class1.id}`, {
      headers: { Cookie: instructor2Cookie },
    });
    record(
      "Instructor 2 is forbidden from requesting Class 1 assignments (HTTP 403)",
      crossListRes.status === 403
    );

    // TEST 8: Instructor 1 updates Assignment (PATCH /api/assignments/[id]) with new PNG attachment
    const pngBuffer = createMinimalPngBuffer();
    const updateFormDataObj = createFormData(
      {
        title: `Tugas Analisis Modul 1 (Updated) ${runId}`,
        maxScore: 100,
        status: "PUBLISHED",
      },
      {
        buffer: pngBuffer,
        name: `diagram-alur-${runId}.png`,
        mimeType: "image/png",
      }
    );
    const updateRes = await request(`/api/assignments/${assignment1Id}`, {
      method: "PATCH",
      headers: { Cookie: instructor1Cookie },
      body: updateFormDataObj,
    });
    const updateData = await updateRes.json();
    record(
      "Instructor 1 updates assignment and replaces attachment with PNG (HTTP 200)",
      updateRes.status === 200 &&
        updateData.data?.title?.includes("(Updated)") &&
        (updateData.data?.attachmentName || updateData.data?.attachmentFileName) === `diagram-alur-${runId}.png`,
      `Status: ${updateRes.status}, body: ${JSON.stringify(updateData)}`
    );

    // TEST 9: Instructor 2 cannot update Instructor 1's assignment (HTTP 403)
    const crossUpdateRes = await request(`/api/assignments/${assignment1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: instructor2Cookie,
      },
      body: JSON.stringify({ title: "Hacked Title" }),
    });
    record(
      "Instructor 2 cannot update Instructor 1's assignment (HTTP 403)",
      crossUpdateRes.status === 403
    );

    // TEST 10: Student A submits their work
    const studentPdfBuffer = createMinimalPdfBuffer();
    const submissionForm = new FormData();
    submissionForm.append(
      "file",
      new Blob([studentPdfBuffer], { type: "application/pdf" }),
      `jawaban-studentA-${runId}.pdf`
    );
    submissionForm.append("content", "Berikut hasil jawaban tugas saya Pak.");

    const submitRes = await request(`/api/assignments/${assignment1Id}/submissions`, {
      method: "POST",
      headers: { Cookie: studentACookie },
      body: submissionForm,
    });
    const submitData = await submitRes.json();
    record(
      "Student A submits assignment file (HTTP 201)",
      submitRes.status === 201 && (submitData.data?.id || submitData.id),
      `Status: ${submitRes.status}, body: ${JSON.stringify(submitData)}`
    );
    const submissionId = submitData.data?.id || submitData.id;
    cleanupSubmissionIds.push(submissionId);

    // TEST 11: Instructor 1 views Class Recap (GET /api/assignments/[id]/submissions)
    const recapRes = await request(`/api/assignments/${assignment1Id}/submissions`, {
      headers: { Cookie: instructor1Cookie },
    });
    const recapData = await recapRes.json();
    record(
      "Instructor 1 accesses class submission recap (HTTP 200)",
      recapRes.status === 200 && Array.isArray(recapData.data)
    );

    // TEST 12: Verify unsubmitted student (Student B) remains clearly visible in recap
    const studentBRow = recapData.data.find((item) => item.student.id === studentB.id);
    record(
      "Unsubmitted Student B is present in recap with isSubmitted: false and submission: null",
      Boolean(studentBRow) && studentBRow.isSubmitted === false && studentBRow.submission === null
    );

    // TEST 13: Verify submitted student (Student A) is present in recap
    const studentARow = recapData.data.find((item) => item.student.id === studentA.id);
    record(
      "Submitted Student A is present in recap with submission details",
      Boolean(studentARow) &&
        studentARow.isSubmitted === true &&
        studentARow.submission?.id === submissionId &&
        studentARow.submission?.fileName === `jawaban-studentA-${runId}.pdf`
    );

    // TEST 14: Verify recap stats accuracy
    record(
      "Recap stats accurately reflect 2 enrolled, 1 submitted, 1 unsubmitted, 0 graded",
      recapData.stats.totalEnrolled === 2 &&
        recapData.stats.submitted === 1 &&
        recapData.stats.unsubmitted === 1 &&
        recapData.stats.graded === 0
    );

    // TEST 15: Cross-instructor recap isolation
    const crossRecapRes = await request(`/api/assignments/${assignment1Id}/submissions`, {
      headers: { Cookie: instructor2Cookie },
    });
    record(
      "Instructor 2 cannot view Instructor 1's assignment recap (HTTP 403)",
      crossRecapRes.status === 403
    );

    // TEST 16: Safe submission download via signed URL (GET /api/assignments/[id]/submissions/[submissionId])
    const downloadRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      { headers: { Cookie: instructor1Cookie } }
    );
    const downloadData = await downloadRes.json();
    record(
      "Authorized download endpoint returns signed URL and hides internal storagePath",
      downloadRes.status === 200 &&
        Boolean(downloadData.data?.downloadUrl) &&
        downloadData.data?.storagePath === undefined
    );

    // TEST 17: Cross-instructor submission download isolation
    const crossDownloadRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      { headers: { Cookie: instructor2Cookie } }
    );
    record(
      "Instructor 2 cannot request download URL for Instructor 1's submission (HTTP 403)",
      crossDownloadRes.status === 403
    );

    // TEST 18: Score validation: reject score > maxScore
    const overScoreRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: instructor1Cookie,
        },
        body: JSON.stringify({
          score: 125, // maxScore is 100!
          feedback: "Nilai bonus tidak valid",
        }),
      }
    );
    record(
      "Rejects grading with score exceeding maxScore (HTTP 400)",
      overScoreRes.status === 400
    );

    // TEST 19: Score validation: reject negative score
    const negativeScoreRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: instructor1Cookie,
        },
        body: JSON.stringify({
          score: -10,
          feedback: "Nilai negatif",
        }),
      }
    );
    record(
      "Rejects grading with negative score (HTTP 400)",
      negativeScoreRes.status === 400
    );

    // TEST 20: Cross-role grading isolation: Student cannot grade
    const studentGradeRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: studentACookie,
        },
        body: JSON.stringify({
          score: 100,
          feedback: "Nilai sendiri",
        }),
      }
    );
    record(
      "Student cannot grade submission (HTTP 403 Forbidden)",
      studentGradeRes.status === 403
    );

    // TEST 21: Cross-instructor grading isolation: Instructor 2 cannot grade Instructor 1's submission
    const crossGradeRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: instructor2Cookie,
        },
        body: JSON.stringify({
          score: 80,
          feedback: "Graded by wrong instructor",
        }),
      }
    );
    record(
      "Instructor 2 cannot grade Instructor 1's student submission (HTTP 403)",
      crossGradeRes.status === 403
    );

    // TEST 22: Successful Grading by Instructor 1
    const validGradeRes = await request(
      `/api/assignments/${assignment1Id}/submissions/${submissionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: instructor1Cookie,
        },
        body: JSON.stringify({
          score: 92.5,
          feedback: "Analisis komprehensif dan struktur laporan rapi.",
        }),
      }
    );
    const validGradeData = await validGradeRes.json();
    record(
      "Instructor 1 successfully grades submission (HTTP 200, score: 92.5, status: GRADED)",
      validGradeRes.status === 200 &&
        validGradeData.data?.score === 92.5 &&
        validGradeData.data?.status === "GRADED" &&
        validGradeData.data?.gradedById === instructor1User.id &&
        Boolean(validGradeData.data?.gradedAt)
    );

    // TEST 23: Verify updated recap reflects graded status
    const updatedRecapRes = await request(`/api/assignments/${assignment1Id}/submissions`, {
      headers: { Cookie: instructor1Cookie },
    });
    const updatedRecapData = await updatedRecapRes.json();
    const updatedStudentA = updatedRecapData.data.find((i) => i.student.id === studentA.id);
    record(
      "Updated recap shows Student A as GRADED with score 92.5 and stats graded: 1",
      updatedStudentA?.submission?.status === "GRADED" &&
        updatedStudentA?.submission?.score === 92.5 &&
        updatedRecapData.stats.graded === 1
    );

    // TEST 24: Verification of AssessmentScore isolation
    // The Assignment score must not touch AssessmentScore table
    const assessmentScoresCount = await prisma.assessmentScore.count({
      where: { studentId: studentA.id },
    });
    record(
      "AssessmentScore table remains completely untouched and isolated from Assignment scoring",
      assessmentScoresCount === 0
    );

    // TEST 25: Live Supabase Storage Probe (if credentials configured)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      console.log("\nProbing live Supabase Storage bucket 'assignments'...");
      const supabase = createClient(supabaseUrl, supabaseKey);
      const testStoragePath = `test-probe/tahap4b-probe-${runId}.txt`;
      const probeContent = Buffer.from(`Probe Tahap 4B: ${new Date().toISOString()}`, "utf-8");

      // 1. Upload
      const { error: uploadErr } = await supabase.storage
        .from(ASSIGNMENTS_BUCKET)
        .upload(testStoragePath, probeContent, { contentType: "text/plain", upsert: true });
      record("Live Supabase Storage upload to private assignments bucket", !uploadErr);

      // 2. Signed URL <= 900s
      const { data: signedData, error: signErr } = await supabase.storage
        .from(ASSIGNMENTS_BUCKET)
        .createSignedUrl(testStoragePath, 900);
      record(
        "Live Supabase Storage generates 900s signed URL",
        !signErr && Boolean(signedData?.signedUrl)
      );

      // 3. Download via signed URL
      if (signedData?.signedUrl) {
        const fetchRes = await fetch(signedData.signedUrl);
        const downloadedText = await fetchRes.text();
        record(
          "Download from live Supabase signed URL matches uploaded payload",
          fetchRes.ok && downloadedText.includes("Probe Tahap 4B")
        );
      }

      // 4. Cleanup probe file
      await supabase.storage.from(ASSIGNMENTS_BUCKET).remove([testStoragePath]);
      console.log("Live Supabase Storage probe cleanup completed.");
    } else {
      console.log("Supabase credentials not set, skipping live bucket probe.");
    }

    console.log(`\n========================================`);
    console.log(`TEST RESULTS: ${passed} / ${total} tests passed.`);
    console.log(`========================================\n`);
  } finally {
    console.log("Cleaning up test database records...");
    for (const id of cleanupSubmissionIds) {
      await prisma.assignmentSubmission.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupAssignmentIds) {
      await prisma.assignment.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupStudentIds) {
      await prisma.enrollment.deleteMany({ where: { studentId: id } }).catch(() => {});
      await prisma.student.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupClassIds) {
      await prisma.class.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupBatchIds) {
      await prisma.batch.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupInstructorIds) {
      await prisma.instructor.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupSubjectIds) {
      await prisma.programSubject.deleteMany({ where: { subjectId: id } }).catch(() => {});
      await prisma.subject.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupProgramIds) {
      await prisma.programSubject.deleteMany({ where: { programId: id } }).catch(() => {});
      await prisma.program.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log("Database cleanup completed.");
  }
}

runInstructorAssignmentUiAndE2ETestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
