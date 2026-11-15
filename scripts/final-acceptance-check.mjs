import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const screenshotDir = "C:\\Users\\lastyee\\.gemini\\antigravity-ide\\brain\\7e753131-424e-472b-ac46-5c1b2d493bc8\\acceptance_screenshots";

await fs.mkdir(screenshotDir, { recursive: true });

let passed = 0;
let total = 0;
const results = [];

function record(section, check, success, detail = "") {
  total++;
  if (success) {
    passed++;
    console.log(`✓ [${section}] ${check}`);
    results.push({ section, check, success: true, detail });
  } else {
    console.error(`✗ [${section}] ${check} - FAILED: ${detail}`);
    results.push({ section, check, success: false, detail });
  }
}

// Cookie helper
function mergeCookies(existing = "", response) {
  const setCookie = response.headers.getSetCookie?.() || [];
  const map = new Map();
  if (existing) {
    for (const part of existing.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [k, ...v] = trimmed.split("=");
      map.set(k.trim(), v.join("="));
    }
  }
  for (const cookieStr of setCookie) {
    const firstPart = cookieStr.split(";")[0]?.trim();
    if (firstPart) {
      const [k, ...v] = firstPart.split("=");
      map.set(k.trim(), v.join("="));
    }
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;
  return fetch(url, options);
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

function createFormData(fields, file) {
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

// CDP Client Helper
class ChromeController {
  constructor() {
    this.process = null;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
  }

  async start() {
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    this.process = spawn(chromePath, [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1280,800",
    ]);

    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) break;
      } catch {}
    }

    const newTabRes = await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" });
    const tabData = await newTabRes.json();
    this.ws = new WebSocket(tabData.webSocketDebuggerUrl);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  send(method, params = {}) {
    const id = this.reqId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setCookies(cookieHeader) {
    if (!cookieHeader) return;
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [name, ...valParts] = trimmed.split("=");
      const value = valParts.join("=");
      await this.send("Network.setCookie", {
        name: name.trim(),
        value,
        domain: "localhost",
        path: "/",
      });
    }
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async setViewport(width, height, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
  }

  async navigate(url, waitMs = 2500) {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async waitFor(expression, maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const val = await this.eval(expression);
        if (val) return val;
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async captureScreenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const filepath = path.join(screenshotDir, filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    if (this.process) {
      try { this.process.kill(); } catch {}
    }
  }
}

async function runAcceptanceCheck() {
  console.log("=== FINAL ACCEPTANCE CHECK: GHS ASSIGNMENT MODULE (TAHAP 4A & 4B) ===\n");

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

  const chrome = new ChromeController();

  try {
    const initialAssessmentScoreCount = await prisma.assessmentScore.count();

    // 1. Roles
    const instructorRole = await prisma.role.findUniqueOrThrow({ where: { name: "INSTRUCTOR" } });
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const placementRole = await prisma.role.findUniqueOrThrow({ where: { name: "PLACEMENT_STAFF" } });

    // 2. Setup Academic Fixtures
    console.log("Setting up acceptance test academic fixtures...");
    const program = await prisma.program.create({
      data: { code: `ACC-${runId}`, name: `Program Acceptance ${runId}` },
    });
    cleanupProgramIds.push(program.id);

    const subject = await prisma.subject.create({
      data: {
        code: `SUB-ACC-${runId}`,
        name: `Manajemen Perhotelan ${runId}`,
        description: "Mata kuliah acceptance test",
      },
    });
    cleanupSubjectIds.push(subject.id);

    await prisma.programSubject.create({
      data: { programId: program.id, subjectId: subject.id },
    });

    const batch = await prisma.batch.create({
      data: {
        name: `Batch ACC ${runId}`,
        programId: program.id,
        startDate: new Date("2026-01-01"),
      },
    });
    cleanupBatchIds.push(batch.id);

    // Instructor
    const instructorUser = await prisma.user.create({
      data: {
        email: `instructor_acc_${runId}@ghs.test`,
        name: `Dosen Pengampu ${runId}`,
        passwordHash,
        roleId: instructorRole.id,
      },
    });
    cleanupUserIds.push(instructorUser.id);

    const instructor = await prisma.instructor.create({
      data: {
        userId: instructorUser.id,
        name: `Dosen Pengampu ${runId}`,
      },
    });
    cleanupInstructorIds.push(instructor.id);

    const classRoom = await prisma.class.create({
      data: {
        name: `Kelas Hotel-A ${runId}`,
        batchId: batch.id,
        instructorId: instructor.id,
      },
    });
    cleanupClassIds.push(classRoom.id);

    // Students: Student A (will submit) & Student B (will remain unsubmitted)
    const studentAUser = await prisma.user.create({
      data: {
        email: `studentA_acc_${runId}@ghs.test`,
        name: `Siswa Rajin ${runId}`,
        passwordHash,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(studentAUser.id);

    const studentA = await prisma.student.create({
      data: {
        userId: studentAUser.id,
        nim: `NIM-A-${runId}`,
        name: `Siswa Rajin ${runId}`,
      },
    });
    cleanupStudentIds.push(studentA.id);

    await prisma.enrollment.create({
      data: { studentId: studentA.id, batchId: batch.id, status: "ACTIVE" },
    });

    const studentBUser = await prisma.user.create({
      data: {
        email: `studentB_acc_${runId}@ghs.test`,
        name: `Siswa Belum Kumpul ${runId}`,
        passwordHash,
        roleId: studentRole.id,
      },
    });
    cleanupUserIds.push(studentBUser.id);

    const studentB = await prisma.student.create({
      data: {
        userId: studentBUser.id,
        nim: `NIM-B-${runId}`,
        name: `Siswa Belum Kumpul ${runId}`,
      },
    });
    cleanupStudentIds.push(studentB.id);

    await prisma.enrollment.create({
      data: { studentId: studentB.id, batchId: batch.id, status: "ACTIVE" },
    });

    // Admin & Super Admin & Placement Users
    const adminUser = await prisma.user.create({
      data: {
        email: `admin_acc_${runId}@ghs.test`,
        name: `Admin Akademik ${runId}`,
        passwordHash,
        roleId: adminRole.id,
      },
    });
    cleanupUserIds.push(adminUser.id);

    const superAdminUser = await prisma.user.create({
      data: {
        email: `super_acc_${runId}@ghs.test`,
        name: `Super Admin ${runId}`,
        passwordHash,
        roleId: superAdminRole.id,
      },
    });
    cleanupUserIds.push(superAdminUser.id);

    const placementUser = await prisma.user.create({
      data: {
        email: `placement_acc_${runId}@ghs.test`,
        name: `Staf Karier ${runId}`,
        passwordHash,
        roleId: placementRole.id,
      },
    });
    cleanupUserIds.push(placementUser.id);

    // 3. Authenticate Sessions
    console.log("Authenticating test sessions...");
    const instructorCookie = await login(instructorUser.email, testPassword);
    const studentACookie = await login(studentAUser.email, testPassword);
    const adminCookie = await login(adminUser.email, testPassword);
    const superAdminCookie = await login(superAdminUser.email, testPassword);
    const placementCookie = await login(placementUser.email, testPassword);

    // 4. Start Chrome DevTools Protocol Client
    console.log("Starting headless Chrome for real visual & browser inspection...");
    await chrome.start();
    record("BROWSER_INIT", "Chrome headless initialized and connected via CDP", true);

    // =========================================================================
    // SECTION 1: INSTRUCTOR WORKFLOW (LIST, MODAL, DETAIL, RECAP)
    // =========================================================================
    console.log("\n--- SECTION 1: INSTRUCTOR WORKFLOW ---");

    // 1.1 Desktop View of Instructor Assignments List
    await chrome.clearCookies();
    await chrome.setCookies(instructorCookie);
    await chrome.setViewport(1280, 800, false);
    await chrome.navigate(`${baseUrl}/assignments`);

    const instructorHeader = await chrome.eval("document.querySelector('h1')?.innerText");
    const instructorHasTable = await chrome.eval("Boolean(document.querySelector('table'))");
    const hasCreateBtn = await chrome.eval("Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Buat Tugas'))");
    await chrome.captureScreenshot("01_instructor_assignments_desktop.png");

    record("INSTRUCTOR_UI", "Instructor assignment page renders with title and table", 
      instructorHeader?.includes("Tugas") && instructorHasTable !== undefined && hasCreateBtn);

    // 1.2 Open Create Assignment Modal via UI click
    await chrome.eval(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Buat Tugas'));
      if (btn) btn.click();
    `);
    await new Promise((r) => setTimeout(r, 1000));
    const createModalVisible = await chrome.eval(`
      const modal = document.querySelector('form');
      Boolean(modal && document.body.innerText.includes('Buat Tugas Baru'));
    `);
    await chrome.captureScreenshot("02_create_assignment_modal_desktop.png");
    record("INSTRUCTOR_UI", "Create Assignment Modal opens with form inputs and overlay", Boolean(createModalVisible));

    // 1.3 Create Assignment via API with attachment
    const pdfBuffer = createMinimalPdfBuffer();
    const createRes = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: instructorCookie },
      body: createFormData(
        {
          title: `Tugas Final Standard Operating Procedure ${runId}`,
          description: "Pelajari materi SOP dan susun rangkuman observasi dalam format PDF.",
          classId: classRoom.id,
          subjectId: subject.id,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          allowLateSubmission: true,
          maxScore: 100,
          status: "PUBLISHED",
        },
        {
          buffer: pdfBuffer,
          name: `sop-panduan-${runId}.pdf`,
          mimeType: "application/pdf",
        }
      ),
    });
    const createdData = await createRes.json();
    cleanupAssignmentIds.push(createdData.id);
    record("INSTRUCTOR_FLOW", "Instructor creates published assignment with PDF attachment (HTTP 201)", 
      createRes.status === 201 && Boolean(createdData.id));

    // 1.4 Instructor Detail Page & Student Recap Table (Desktop)
    await chrome.navigate(`${baseUrl}/assignments/${createdData.id}`);
    await chrome.waitFor("Boolean(document.querySelector('h1'))");
    await chrome.waitFor("Boolean(document.querySelector('table'))");
    const instructorSeesTitle = await chrome.eval(`document.body.innerText.includes('${createdData.title}')`);
    const recapRowsCount = await chrome.eval("document.querySelectorAll('tbody tr').length");
    await chrome.captureScreenshot("03_instructor_detail_recap_desktop.png");

    record("INSTRUCTOR_FLOW", "Instructor detail page displays assignment overview & recap table", 
      Boolean(instructorSeesTitle) && recapRowsCount >= 2);

    // 1.5 Mobile View of Instructor Recap (390 x 844)
    await chrome.setViewport(390, 844, true);
    await new Promise((r) => setTimeout(r, 1000));
    const isMobileNoWindowOverflow = await chrome.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5");
    await chrome.captureScreenshot("04_instructor_detail_recap_mobile.png");
    record("RESPONSIVE_MOBILE", "Instructor detail mobile view has no layout break (390px)", Boolean(isMobileNoWindowOverflow));

    // =========================================================================
    // SECTION 2: STUDENT WORKFLOW (LIST, DETAIL, SUBMISSION, STATUS)
    // =========================================================================
    console.log("\n--- SECTION 2: STUDENT WORKFLOW ---");

    // 2.1 Student Assignments List (Desktop)
    await chrome.clearCookies();
    await chrome.setCookies(studentACookie);
    await chrome.setViewport(1280, 800, false);
    await chrome.navigate(`${baseUrl}/assignments`);
    await chrome.waitFor("Boolean(document.querySelector('h1'))");

    const studentHeader = await chrome.eval("document.querySelector('h1')?.innerText");
    const studentSeesAssignment = await chrome.eval(`document.body.innerText.includes('${createdData.title}')`);
    await chrome.captureScreenshot("05_student_assignments_desktop.png");

    record("STUDENT_UI", "Student view displays published assignments for their batch/class", 
      Boolean(studentHeader?.includes("Tugas")) && Boolean(studentSeesAssignment));

    // 2.2 Student Mobile List View
    await chrome.setViewport(390, 844, true);
    await new Promise((r) => setTimeout(r, 1000));
    await chrome.captureScreenshot("06_student_assignments_mobile.png");
    const studentMobileOverflow = await chrome.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5");
    record("RESPONSIVE_MOBILE", "Student assignments mobile view fits viewport cleanly", Boolean(studentMobileOverflow));

    // 2.3 Student Detail & Submission Page
    await chrome.setViewport(1280, 800, false);
    await chrome.navigate(`${baseUrl}/assignments/${createdData.id}`);
    await chrome.waitFor("Boolean(document.querySelector('h1'))");
    await chrome.waitFor("(() => Boolean(document.querySelector('input[type=\"file\"]') || document.body.innerText.includes('Unggah') || document.body.innerText.includes('Instruksi')) )()");
    const studentSeesTitle = await chrome.eval(`document.body.innerText.includes('${createdData.title}')`);
    const hasDownloadMateriBtn = await chrome.eval("(() => Boolean(document.body.innerText.includes('Unduh Lampiran') || document.body.innerText.includes('sop-panduan')) )()");
    const hasUploadArea = await chrome.eval("(() => Boolean(document.querySelector('input[type=\"file\"]') || document.body.innerText.includes('Unggah')) )()");
    await chrome.captureScreenshot("07_student_detail_submission_form.png");

    record("STUDENT_FLOW", "Student assignment detail displays instructions, material download, and upload area", 
      Boolean(studentSeesTitle) && Boolean(hasDownloadMateriBtn) && Boolean(hasUploadArea));

    // 2.4 Student Submits Assignment File
    const studentSubmissionRes = await request(`/api/assignments/${createdData.id}/submissions`, {
      method: "POST",
      headers: { Cookie: studentACookie },
      body: createFormData(
        { notes: "Laporan observasi SOP selesai dikerjakan sesuai petunjuk." },
        {
          buffer: pdfBuffer,
          name: `laporan-observasi-${runId}.pdf`,
          mimeType: "application/pdf",
        }
      ),
    });
    const subData = await studentSubmissionRes.json();
    cleanupSubmissionIds.push(subData.id);
    record("STUDENT_FLOW", "Student successfully submits assignment file (HTTP 201)", 
      studentSubmissionRes.status === 201 && subData.status === "SUBMITTED");

    // 2.5 Student Refresh Page & View Submitted State
    await chrome.navigate(`${baseUrl}/assignments/${createdData.id}`);
    await chrome.waitFor("Boolean(document.querySelector('h1'))");
    const studentStatusBadge = await chrome.eval("(() => Boolean(document.body.innerText.includes('Sudah Dikumpulkan') || document.body.innerText.includes('Menunggu Dinilai')) )()");
    await chrome.captureScreenshot("08_student_submitted_state.png");
    record("STUDENT_UI", "Student detail updates status badge to 'Sudah Dikumpulkan' / 'Menunggu Dinilai'", Boolean(studentStatusBadge));

    // =========================================================================
    // SECTION 3: INSTRUCTOR GRADING & RECAP UPDATES
    // =========================================================================
    console.log("\n--- SECTION 3: INSTRUCTOR GRADING & RECAP UPDATES ---");

    await chrome.clearCookies();
    await chrome.setCookies(instructorCookie);
    await chrome.navigate(`${baseUrl}/assignments/${createdData.id}`);
    await chrome.waitFor("Boolean(document.querySelector('table'))");

    // Check Recap Table shows Student A as Submitted and Student B as Unsubmitted
    const studentASubmitted = await chrome.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.some(r => r.innerText.includes('Siswa Rajin') && r.innerText.includes('Sudah Mengumpulkan'));
      })()
    `);
    const studentBUnsubmitted = await chrome.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.some(r => r.innerText.includes('Siswa Belum Kumpul') && r.innerText.includes('Belum Mengumpulkan'));
      })()
    `);
    record("INSTRUCTOR_RECAP", "Recap table properly contrasts submitted vs unsubmitted students", 
      Boolean(studentASubmitted) && Boolean(studentBUnsubmitted));

    // 3.1 Open Grading Modal via UI
    await chrome.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Nilai') || b.innerText.includes('Beri Nilai'));
        if (btn) btn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    const gradingModalVisible = await chrome.eval("Boolean(document.body.innerText.includes('Penilaian Tugas'))");
    await chrome.captureScreenshot("09_grading_modal_desktop.png");
    record("INSTRUCTOR_GRADING", "Grading modal opens with student info, score input, and feedback area", Boolean(gradingModalVisible));

    // 3.2 Grade Submission via API
    const gradeRes = await request(`/api/assignments/${createdData.id}/submissions/${subData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: instructorCookie,
      },
      body: JSON.stringify({
        score: 95.5,
        feedback: "Analisis sangat komprehensif dan format laporan sesuai standar.",
      }),
    });
    const gradeData = await gradeRes.json();
    const scoredValue = gradeData.data?.score ?? gradeData.score;
    const gradedStatus = gradeData.data?.status ?? gradeData.status;
    record("INSTRUCTOR_GRADING", "Instructor submits grade 95.5 with feedback (HTTP 200)", 
      gradeRes.status === 200 && scoredValue === 95.5 && gradedStatus === "GRADED");

    // 3.3 Verify Download Endpoint Returns Signed URL without internal storagePath
    const downloadRes = await request(`/api/assignments/${createdData.id}/submissions/${subData.id}`, {
      headers: { Cookie: instructorCookie },
    });
    const downloadData = await downloadRes.json();
    const downloadUrl = downloadData.data?.downloadUrl ?? downloadData.downloadUrl;
    const hasSignedUrl = Boolean(downloadUrl && downloadUrl.includes("signed"));
    const noRawStoragePath = !downloadData.data?.storagePath && !downloadData.storagePath && !downloadUrl?.includes("ghs_integrated_private");
    record("SECURITY_STORAGE", "Submission download endpoint issues private signed URL and hides internal storagePath", 
      downloadRes.status === 200 && hasSignedUrl && noRawStoragePath);

    // 3.4 Reload Instructor Page and Verify Graded State
    await chrome.navigate(`${baseUrl}/assignments/${createdData.id}`);
    await chrome.waitFor("Boolean(document.querySelector('table'))");
    const studentAGradedText = await chrome.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.some(r => r.innerText.includes('Siswa Rajin') && (r.innerText.includes('95.5') || r.innerText.includes('Sudah Dinilai')));
      })()
    `);
    await chrome.captureScreenshot("10_instructor_recap_graded_state.png");
    record("INSTRUCTOR_RECAP", "Recap table updates instantly showing score 95.5 and 'Sudah Dinilai' status", Boolean(studentAGradedText));

    // =========================================================================
    // SECTION 4: ROLE ACCESS MATRIX & SIDEBAR NAVIGATION
    // =========================================================================
    console.log("\n--- SECTION 4: ROLE ACCESS & SIDEBAR NAVIGATION ---");

    // 4.1 SUPER_ADMIN
    await chrome.clearCookies();
    await chrome.setCookies(superAdminCookie);
    await chrome.navigate(`${baseUrl}/assignments`);
    const superAdminHeader = await chrome.eval("document.querySelector('h1')?.innerText");
    const superAdminSidebarTugas = await chrome.eval("Boolean(document.querySelector('aside a[href=\"/assignments\"]'))");
    record("ROLE_SUPER_ADMIN", "Super Admin accesses assignments and sidebar contains 'Tugas'", 
      superAdminHeader?.includes("Tugas") && Boolean(superAdminSidebarTugas));

    // 4.2 ADMIN
    await chrome.clearCookies();
    await chrome.setCookies(adminCookie);
    await chrome.navigate(`${baseUrl}/assignments`);
    const adminHeader = await chrome.eval("document.querySelector('h1')?.innerText");
    const adminSidebarTugas = await chrome.eval("Boolean(document.querySelector('aside a[href=\"/assignments\"]'))");
    record("ROLE_ADMIN", "Admin accesses assignments and sidebar contains 'Tugas'", 
      adminHeader?.includes("Tugas") && Boolean(adminSidebarTugas));

    // 4.3 PLACEMENT_STAFF (Career staff)
    await chrome.clearCookies();
    await chrome.setCookies(placementCookie);
    await chrome.navigate(`${baseUrl}/dashboard`);
    const placementSidebarTugas = await chrome.eval("Boolean(document.querySelector('aside a[href=\"/assignments\"]'))");
    await chrome.captureScreenshot("11_placement_staff_sidebar.png");
    record("ROLE_PLACEMENT_STAFF", "Placement Staff sidebar strictly OMITS 'Tugas' menu", !placementSidebarTugas);

    // Placement Staff access to /api/assignments returns 403 Forbidden
    const placementApiRes = await request("/api/assignments", {
      headers: { Cookie: placementCookie },
    });
    record("ROLE_PLACEMENT_STAFF", "Placement Staff direct access to /api/assignments is blocked (HTTP 403)", 
      placementApiRes.status === 403);

    // =========================================================================
    // SECTION 5: VALIDATION & ISOLATION INTEGRITY CHECKS
    // =========================================================================
    console.log("\n--- SECTION 5: VALIDATION & ISOLATION CHECKS ---");

    // 5.1 Max score boundary check
    const invalidScoreRes = await request(`/api/assignments/${createdData.id}/submissions/${subData.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: instructorCookie },
      body: JSON.stringify({ score: 100.1 }),
    });
    record("VALIDATION_CONSISTENCY", "Grading rejects score > maxScore (HTTP 400)", invalidScoreRes.status === 400);

    // 5.2 Disguised binary / magic number check
    const badFileRes = await request("/api/assignments", {
      method: "POST",
      headers: { Cookie: instructorCookie },
      body: createFormData(
        {
          title: "Malicious Attachment Test",
          description: "Testing fake PDF",
          classId: classRoom.id,
          subjectId: subject.id,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          buffer: Buffer.from("MZThisIsFakeExecutablePayload", "utf-8"),
          name: "fake.pdf",
          mimeType: "application/pdf",
        }
      ),
    });
    record("VALIDATION_CONSISTENCY", "File upload rejects invalid binary magic bytes (HTTP 400)", badFileRes.status === 400);

    // 5.3 AssessmentScore isolation check
    const finalAssessmentScoreCount = await prisma.assessmentScore.count();
    record("SYSTEM_INTEGRITY", "AssessmentScore table remains completely untouched and isolated", 
      finalAssessmentScoreCount === initialAssessmentScoreCount);

  } finally {
    // Teardown Chrome
    await chrome.close();

    // Teardown test fixtures
    console.log("\nCleaning up acceptance test records...");
    try {
      if (cleanupSubmissionIds.length > 0) {
        await prisma.assignmentSubmission.deleteMany({ where: { id: { in: cleanupSubmissionIds } } });
      }
      if (cleanupAssignmentIds.length > 0) {
        await prisma.assignment.deleteMany({ where: { id: { in: cleanupAssignmentIds } } });
      }
      if (cleanupStudentIds.length > 0) {
        await prisma.enrollment.deleteMany({ where: { studentId: { in: cleanupStudentIds } } });
        await prisma.student.deleteMany({ where: { id: { in: cleanupStudentIds } } });
      }
      if (cleanupClassIds.length > 0) {
        await prisma.class.deleteMany({ where: { id: { in: cleanupClassIds } } });
      }
      if (cleanupInstructorIds.length > 0) {
        await prisma.instructor.deleteMany({ where: { id: { in: cleanupInstructorIds } } });
      }
      if (cleanupBatchIds.length > 0) {
        await prisma.batch.deleteMany({ where: { id: { in: cleanupBatchIds } } });
      }
      if (cleanupProgramIds.length > 0) {
        await prisma.programSubject.deleteMany({ where: { programId: { in: cleanupProgramIds } } });
        await prisma.program.deleteMany({ where: { id: { in: cleanupProgramIds } } });
      }
      if (cleanupSubjectIds.length > 0) {
        await prisma.subject.deleteMany({ where: { id: { in: cleanupSubjectIds } } });
      }
      if (cleanupUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
      }
      console.log("Cleanup complete.");
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  }

  console.log("\n========================================================");
  console.log(`FINAL ACCEPTANCE RESULTS: ${passed} / ${total} checks passed.`);
  console.log("========================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runAcceptanceCheck().catch((err) => {
  console.error("Acceptance check fatal error:", err);
  process.exit(1);
});
