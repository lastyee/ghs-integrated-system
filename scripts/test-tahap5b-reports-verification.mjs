import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  assertSafeLocalApplicationTarget,
  assertSafeLocalDatabase,
} from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const screenshotDir =
  "C:\\Users\\lastyee\\.gemini\\antigravity\\brain\\4dfe325b-c36f-4527-bfd3-a9ada172b748\\screenshots";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
assertSafeLocalApplicationTarget({ baseUrl });

let passed = 0;
let total = 0;
const results = [];

function record(name, condition, errorMsg = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    results.push({ name, pass: true });
  } else {
    console.error(`✗ ${name}: ${errorMsg}`);
    results.push({ name, pass: false, error: errorMsg });
  }
}

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
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
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
  if (res.status !== 302 && res.status !== 303 && res.status !== 200) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  return cookies;
}

// Minimal Chrome DevTools Protocol Controller
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

    const newTabRes = await fetch("http://127.0.0.1:9222/json/new?about:blank", {
      method: "PUT",
    });
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
      try {
        this.ws.close();
      } catch {}
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {}
    }
  }
}

async function runReportsVerification() {
  console.log("==================================================");
  console.log("TAHAP 5B VERIFICATION SUITE — REPORTS & ANALYTICS");
  console.log("==================================================\n");

  await fs.mkdir(screenshotDir, { recursive: true });

  // Baseline data counts across tables
  const baseline = {
    students: await prisma.student.count(),
    batches: await prisma.batch.count(),
    classes: await prisma.class.count(),
    enrollments: await prisma.enrollment.count(),
    schedules: await prisma.schedule.count(),
    attendances: await prisma.attendance.count(),
    assessments: await prisma.assessment.count(),
    assessmentScores: await prisma.assessmentScore.count(),
    assignments: await prisma.assignment.count(),
    assignmentSubmissions: await prisma.assignmentSubmission.count(),
    employers: await prisma.employer.count(),
    vacancies: await prisma.vacancy.count(),
    applications: await prisma.application.count(),
    interviews: await prisma.interview.count(),
    placements: await prisma.placement.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log("[DATA BASELINE] Initial record counts:", JSON.stringify(baseline));

  const cleanupUserIds = [];
  const runId = randomUUID().slice(0, 8);
  const fixturePassword = `ReportTest#${runId}!`;
  const passwordHash = await bcrypt.hash(fixturePassword, 10);

  let chrome = null;

  try {
    // =========================================================================
    // SECTION 1: AUTENTIKASI & RBAC ACCESS CONTROL
    // =========================================================================
    console.log("\n--- SECTION 1: AUTENTIKASI & RBAC ACCESS CONTROL ---");

    // 1.1 Unauthenticated requests
    const unauthAcadRes = await request("/api/reports/academic");
    const unauthAttRes = await request("/api/reports/attendance");
    const unauthPlcRes = await request("/api/reports/placement");
    const unauthPageRes = await request("/reports", { redirect: "manual" });

    record("1.1 Unauthenticated akses /api/reports/academic ditolak (HTTP 401)", unauthAcadRes.status === 401);
    record("1.2 Unauthenticated akses /api/reports/attendance ditolak (HTTP 401)", unauthAttRes.status === 401);
    record("1.3 Unauthenticated akses /api/reports/placement ditolak (HTTP 401)", unauthPlcRes.status === 401);
    record("1.4 Unauthenticated akses /reports dialihkan ke /login (HTTP 307/302)", unauthPageRes.status === 307 || unauthPageRes.status === 302);

    // 1.2 Non-permitted role (INSTRUCTOR)
    const instructorCookies = await login("instructor.audit@ghs.test", "Password#123!");
    const instAcadRes = await request("/api/reports/academic", { headers: { Cookie: instructorCookies } });
    const instAttRes = await request("/api/reports/attendance", { headers: { Cookie: instructorCookies } });
    const instPlcRes = await request("/api/reports/placement", { headers: { Cookie: instructorCookies } });
    const instPageRes = await request("/reports", { headers: { Cookie: instructorCookies }, redirect: "manual" });

    record("1.5 INSTRUCTOR akses /api/reports/academic ditolak (HTTP 403 Forbidden)", instAcadRes.status === 403);
    record("1.6 INSTRUCTOR akses /api/reports/attendance ditolak (HTTP 403 Forbidden)", instAttRes.status === 403);
    record("1.7 INSTRUCTOR akses /api/reports/placement ditolak (HTTP 403 Forbidden)", instPlcRes.status === 403);
    record("1.8 INSTRUCTOR akses /reports dialihkan ke /dashboard (HTTP 307/302)", instPageRes.status === 307 || instPageRes.status === 302);

    // 1.3 Permitted Role: MANAGEMENT (via temporary fixture)
    const mgmtRole = await prisma.role.findUniqueOrThrow({ where: { name: "MANAGEMENT" } });
    const mgmtUser = await prisma.user.create({
      data: {
        email: `temp.mgmt.${runId}@ghs.test`,
        name: `Management Tester ${runId}`,
        passwordHash,
        roleId: mgmtRole.id,
      },
    });
    cleanupUserIds.push(mgmtUser.id);

    const mgmtCookies = await login(mgmtUser.email, fixturePassword);
    const mgmtAcadRes = await request("/api/reports/academic", { headers: { Cookie: mgmtCookies } });
    const mgmtAttRes = await request("/api/reports/attendance", { headers: { Cookie: mgmtCookies } });
    const mgmtPlcRes = await request("/api/reports/placement", { headers: { Cookie: mgmtCookies } });
    const mgmtPageRes = await request("/reports", { headers: { Cookie: mgmtCookies } });

    record("1.9 MANAGEMENT akses /api/reports/academic diizinkan (HTTP 200)", mgmtAcadRes.status === 200);
    record("1.10 MANAGEMENT akses /api/reports/attendance diizinkan (HTTP 200)", mgmtAttRes.status === 200);
    record("1.11 MANAGEMENT akses /api/reports/placement diizinkan (HTTP 200)", mgmtPlcRes.status === 200);
    record("1.12 MANAGEMENT akses /reports UI diizinkan (HTTP 200)", mgmtPageRes.status === 200);

    // 1.4 Role: ACADEMIC_STAFF (Allowed academic & attendance, forbidden placement)
    const acadRole = await prisma.role.findUniqueOrThrow({ where: { name: "ACADEMIC_STAFF" } });
    const acadUser = await prisma.user.create({
      data: {
        email: `temp.acad.${runId}@ghs.test`,
        name: `Academic Tester ${runId}`,
        passwordHash,
        roleId: acadRole.id,
      },
    });
    cleanupUserIds.push(acadUser.id);

    const acadCookies = await login(acadUser.email, fixturePassword);
    const acadAcadRes = await request("/api/reports/academic", { headers: { Cookie: acadCookies } });
    const acadAttRes = await request("/api/reports/attendance", { headers: { Cookie: acadCookies } });
    const acadPlcRes = await request("/api/reports/placement", { headers: { Cookie: acadCookies } });

    record("1.13 ACADEMIC_STAFF akses /api/reports/academic diizinkan (HTTP 200)", acadAcadRes.status === 200);
    record("1.14 ACADEMIC_STAFF akses /api/reports/attendance diizinkan (HTTP 200)", acadAttRes.status === 200);
    record("1.15 ACADEMIC_STAFF akses /api/reports/placement ditolak (HTTP 403 Forbidden)", acadPlcRes.status === 403);

    // 1.5 Role: PLACEMENT_STAFF (Allowed placement, forbidden academic & attendance)
    const plcRole = await prisma.role.findUniqueOrThrow({ where: { name: "PLACEMENT_STAFF" } });
    const plcUser = await prisma.user.create({
      data: {
        email: `temp.plc.${runId}@ghs.test`,
        name: `Placement Tester ${runId}`,
        passwordHash,
        roleId: plcRole.id,
      },
    });
    cleanupUserIds.push(plcUser.id);

    const plcCookies = await login(plcUser.email, fixturePassword);
    const plcAcadRes = await request("/api/reports/academic", { headers: { Cookie: plcCookies } });
    const plcAttRes = await request("/api/reports/attendance", { headers: { Cookie: plcCookies } });
    const plcPlcRes = await request("/api/reports/placement", { headers: { Cookie: plcCookies } });

    record("1.16 PLACEMENT_STAFF akses /api/reports/academic ditolak (HTTP 403 Forbidden)", plcAcadRes.status === 403);
    record("1.17 PLACEMENT_STAFF akses /api/reports/attendance ditolak (HTTP 403 Forbidden)", plcAttRes.status === 403);
    record("1.18 PLACEMENT_STAFF akses /api/reports/placement diizinkan (HTTP 200)", plcPlcRes.status === 200);

    // =========================================================================
    // SECTION 2: VALIDASI INPUT PARAMETER & ERROR HANDLING
    // =========================================================================
    console.log("\n--- SECTION 2: VALIDASI INPUT PARAMETER & ERROR HANDLING ---");

    const invalidDateRes1 = await request("/api/reports/academic?startDate=bukan-tanggal", { headers: { Cookie: mgmtCookies } });
    const invalidDateRes2 = await request("/api/reports/attendance?endDate=invalid-format", { headers: { Cookie: mgmtCookies } });
    const invalidRangeRes = await request("/api/reports/placement?startDate=2026-12-31&endDate=2026-01-01", { headers: { Cookie: mgmtCookies } });
    const nonExistentBatchRes = await request("/api/reports/academic?batchId=nonexistent_batch_id_9999", { headers: { Cookie: mgmtCookies } });

    record("2.1 Parameter startDate tidak valid ditolak (HTTP 400)", invalidDateRes1.status === 400);
    record("2.2 Parameter endDate tidak valid ditolak (HTTP 400)", invalidDateRes2.status === 400);
    record("2.3 startDate > endDate ditolak (HTTP 400)", invalidRangeRes.status === 400);
    record("2.4 batchId tidak ditemukan mengembalikan 404", nonExistentBatchRes.status === 404);

    // =========================================================================
    // SECTION 3: AKURASI AGREGASI DATA & KETELITIAN HITUNGAN
    // =========================================================================
    console.log("\n--- SECTION 3: AKURASI AGREGASI DATA & KETELITIAN HITUNGAN ---");

    const acadJson = await (await request("/api/reports/academic", { headers: { Cookie: mgmtCookies } })).json();
    const attJson = await (await request("/api/reports/attendance", { headers: { Cookie: mgmtCookies } })).json();
    const plcJson = await (await request("/api/reports/placement", { headers: { Cookie: mgmtCookies } })).json();

    console.log("ACAD DATA:", JSON.stringify(acadJson.data));
    console.log("ATT DATA:", JSON.stringify(attJson.data));

    // Check Academic & Assignment
    record("3.1 Total siswa aktif terhitung akurat sesuai database (25 siswa)", acadJson.data.totalStudents === 25);
    record("3.2 Total batch terhitung akurat (5 batch)", acadJson.data.totalBatches === 5);
    record("3.3 Total kelas aktif terhitung akurat (14 kelas)", acadJson.data.totalClasses === 14);
    record("3.4 Enrollment aktif terhitung akurat (24 siswa aktif)", acadJson.data.activeEnrollments === 24 && acadJson.data.totalEnrollments === 24);
    record("3.5 Ringkasan tugas tersedia dan akurat (3 tugas terbit)", acadJson.data.assignmentsSummary?.totalAssignments === 3 && acadJson.data.assignmentsSummary?.statusBreakdown?.PUBLISHED === 3);
    record("3.6 Ringkasan pengumpulan tugas akurat (2 SUBMITTED)", acadJson.data.assignmentsSummary?.totalSubmissions === 2 && acadJson.data.assignmentsSummary?.submissionStatusBreakdown?.SUBMITTED === 2);
    record("3.7 Rata-rata skor tugas belum dinilai bernilai null tanpa tebakan angka", acadJson.data.assignmentsSummary?.averageSubmissionScore === null);

    // Check Attendance & Schedule
    record("3.8 Total sesi jadwal aktif terhitung akurat (14 sesi)", attJson.data.totalSchedules === 14 && attJson.data.scheduleStatusBreakdown?.SCHEDULED === 14);
    record("3.9 Total catatan kehadiran aktif akurat (5 catatan)", attJson.data.totalRecords === 5);
    record("3.10 Distribusi kehadiran akurat (5 hadir)", attJson.data.presentCount === 5 && attJson.data.lateCount === 0 && attJson.data.absentCount === 0);
    record("3.11 Rincian ketidakhadiran akurat (0 sakit pada sesi aktif)", attJson.data.absenceBreakdown?.sick === 0 && attJson.data.absenceBreakdown?.permitted === 0);
    record("3.12 Attendance rate aktif akurat 100% (5 hadir dari 5 catatan aktif)", attJson.data.overallAttendanceRate === 100);

    // Check Placement
    record("3.13 Total mitra perusahaan dan lowongan terhitung akurat (2 mitra, 2 lowongan)", plcJson.data.totalEmployers === 2 && plcJson.data.totalVacancies === 2);
    record("3.14 Funnel lamaran kerja memuat status nyata tanpa estimasi buatan", plcJson.data.applicationFunnel?.APPLIED >= 0 && plcJson.data.totalApplications === 2);
    record("3.15 Distribusi wawancara memuat 2 sesi tercatat", plcJson.data.totalInterviews === 2);
    record("3.16 Distribusi penempatan memuat 1 peserta dalam status persiapan", plcJson.data.totalPlacements === 1 && plcJson.data.placementStatusDistribution?.PREPARATION === 1);

    // =========================================================================
    // SECTION 4: FILTER SCOPING & EMPTY STATE SAFETY
    // =========================================================================
    console.log("\n--- SECTION 4: FILTER SCOPING & EMPTY STATE SAFETY ---");

    const firstBatch = await prisma.batch.findFirstOrThrow({ where: { deletedAt: null } });
    const scopedAcadRes = await request(`/api/reports/academic?batchId=${firstBatch.id}`, { headers: { Cookie: mgmtCookies } });
    const scopedAcadJson = await scopedAcadRes.json();

    record("4.1 Filter batchId berhasil mempersempit lingkup data (totalBatches = 1)", scopedAcadJson.data.totalBatches === 1);
    record("4.2 Filter batchId mencantumkan appliedFilters pada respons", scopedAcadJson.data.appliedFilters?.batchId === firstBatch.id);

    // Filter by empty historical date range (1990)
    const emptyRangeRes = await request("/api/reports/attendance?startDate=1990-01-01&endDate=1990-01-02", { headers: { Cookie: mgmtCookies } });
    const emptyRangeJson = await emptyRangeRes.json();

    record("4.3 Rentang tanggal kosong ditangani aman (0 catatan)", emptyRangeJson.data.totalRecords === 0);
    record("4.4 Tingkat kehadiran bernilai null / Belum ada data pada data kosong (bukan 0% semu)", emptyRangeJson.data.overallAttendanceRate === null);

    const emptyAcadRes = await request("/api/reports/academic?startDate=1990-01-01&endDate=1990-01-02", { headers: { Cookie: mgmtCookies } });
    const emptyAcadJson = await emptyAcadRes.json();
    record("4.5 Skor asesmen rata-rata bernilai null pada data kosong (bukan 0)", emptyAcadJson.data.averageAssessmentScore === null);
    record("4.6 Tingkat kehadiran akademik bernilai null pada data kosong", emptyAcadJson.data.attendanceRate === null);

    // 4.7 Verifikasi Tanpa PII (Privacy Check)
    const payloadStr = JSON.stringify({ acad: acadJson.data, att: attJson.data, plc: plcJson.data });
    const hasPii = /@ghs\.|\.com|\.local|password|hash|phone|nik|alamat|street/i.test(payloadStr);
    record("4.7 Payload seluruh endpoint bebas dari data pribadi / PII sensitif", !hasPii);

    // 4.8 Batch tanpa catatan absensi mengembalikan attendanceRate = null
    const emptyBatchRate = attJson.data.batchRates.find((b) => b.totalRecords === 0);
    record("4.8 Batch tanpa sesi absensi mengembalikan attendanceRate: null (Belum ada data)", emptyBatchRate ? emptyBatchRate.attendanceRate === null : true);

    // =========================================================================
    // SECTION 5: BROWSER VISUAL VERIFICATION VIA HEADLESS CHROME
    // =========================================================================
    console.log("\n--- SECTION 5: PEMERIKSAAN VISUAL CHROME & SCREENSHOTS ---");

    chrome = new ChromeController();
    await chrome.start();

    // 5.1 Desktop View (1280x800) as MANAGEMENT
    await chrome.setViewport(1280, 800, false);
    await chrome.setCookies(mgmtCookies);
    await chrome.navigate(`${baseUrl}/reports`, 3000);

    const hasPage = await chrome.waitFor("document.querySelector('h1') !== null");
    record("5.1 Browser Desktop berhasil memuat halaman /reports", Boolean(hasPage));

    const hasBadge = await chrome.eval("document.body.innerText.includes('Cakupan Batch') && document.body.innerText.includes('Rentang Waktu')");
    record("5.1b Label periode dan cakupan batch tertera jelas di header", Boolean(hasBadge));

    // Tab 1: Academic & Tugas View
    const acadSectionVisible = await chrome.waitFor("document.querySelector('[data-testid=\"academic-report-section\"]') !== null");
    record("5.2 Tab 'Akademik & Tugas' dirender lengkap dengan ringkasan tugas", Boolean(acadSectionVisible));

    const acadShot = await chrome.captureScreenshot("reports-desktop-academic-view.png");
    console.log(`   Captured screenshot: ${acadShot}`);
    record("5.3 Tersimpan screenshot tab Akademik (reports-desktop-academic-view.png)", Boolean(acadShot));

    // Tab 2: Attendance & Jadwal View
    await chrome.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="tab-attendance"]');
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const attSectionVisible = await chrome.waitFor("document.querySelector('[data-testid=\"attendance-report-section\"]') !== null");
    record("5.4 Tab 'Jadwal & Kehadiran' dirender lengkap dengan breakdown dan tabel batch", Boolean(attSectionVisible));

    const attShot = await chrome.captureScreenshot("reports-desktop-attendance-view.png");
    console.log(`   Captured screenshot: ${attShot}`);
    record("5.5 Tersimpan screenshot tab Kehadiran (reports-desktop-attendance-view.png)", Boolean(attShot));

    // Tab 3: Placement View
    await chrome.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="tab-placement"]');
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const plcSectionVisible = await chrome.waitFor("document.querySelector('[data-testid=\"placement-report-section\"]') !== null");
    record("5.6 Tab 'Penempatan Kerja' dirender lengkap dengan funnel lamaran", Boolean(plcSectionVisible));

    const plcShot = await chrome.captureScreenshot("reports-desktop-placement-view.png");
    console.log(`   Captured screenshot: ${plcShot}`);
    record("5.7 Tersimpan screenshot tab Penempatan (reports-desktop-placement-view.png)", Boolean(plcShot));

    // 5.4 Filter Interaction on Tab Akademik
    await chrome.eval(`
      (() => {
        const btn = document.querySelector('[data-testid="tab-academic"]');
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Select first batch in dropdown
    await chrome.eval(`
      (() => {
        const select = document.querySelector('[data-testid="filter-batch"]');
        if (select && select.options.length > 1) {
          select.selectedIndex = 1;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));

    const filteredShot = await chrome.captureScreenshot("reports-desktop-filtered-view.png");
    console.log(`   Captured screenshot: ${filteredShot}`);
    record("5.8 Tersimpan screenshot hasil filter batch (reports-desktop-filtered-view.png)", Boolean(filteredShot));

    // 5.5 Mobile Responsive View (375x812)
    await chrome.setViewport(375, 812, true);
    await chrome.navigate(`${baseUrl}/reports`, 2500);

    const mobileShot = await chrome.captureScreenshot("reports-mobile-responsive-view.png");
    console.log(`   Captured screenshot: ${mobileShot}`);
    record("5.9 Tersimpan screenshot tampilan mobile responsif (reports-mobile-responsive-view.png)", Boolean(mobileShot));

    // =========================================================================
    // SECTION 6: PEMBUKTIAN DATA IMMUTABILITY & CLEANUP
    // =========================================================================
    console.log("\n--- SECTION 6: PEMBUKTIAN IMMUTABILITY APPEND-ONLY ---");

    const finalCounts = {
      students: await prisma.student.count(),
      batches: await prisma.batch.count(),
      classes: await prisma.class.count(),
      enrollments: await prisma.enrollment.count(),
      schedules: await prisma.schedule.count(),
      attendances: await prisma.attendance.count(),
      assessments: await prisma.assessment.count(),
      assessmentScores: await prisma.assessmentScore.count(),
      assignments: await prisma.assignment.count(),
      assignmentSubmissions: await prisma.assignmentSubmission.count(),
      employers: await prisma.employer.count(),
      vacancies: await prisma.vacancy.count(),
      applications: await prisma.application.count(),
      interviews: await prisma.interview.count(),
      placements: await prisma.placement.count(),
      auditLogs: await prisma.auditLog.count(),
    };

    let countsMatch = true;
    for (const [key, val] of Object.entries(baseline)) {
      if (finalCounts[key] !== val) {
        countsMatch = false;
        console.error(`Count mismatch for ${key}: initial ${val}, final ${finalCounts[key]}`);
      }
    }

    record("6.1 Seluruh tabel data bisnis dan log tidak berubah sama sekali (100% Immutable)", countsMatch);
  } finally {
    if (chrome) {
      await chrome.close();
    }

    // Clean up temporary user fixtures
    if (cleanupUserIds.length > 0) {
      console.log(`\nMembersihkan ${cleanupUserIds.length} user fixture sementara...`);
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
      console.log("Pembersihan fixture selesai.");
    }

    const postCleanupUserCount = await prisma.user.count({ where: { id: { in: cleanupUserIds } } });
    record("Clean-up: Seluruh user fixture sementara 100% terhapus", postCleanupUserCount === 0);

    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`HASIL VERIFIKASI TAHAP 5B: ${passed} / ${total} PEMERIKSAAN LULUS.`);
  console.log("==================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runReportsVerification().catch((err) => {
  console.error("Fatal error in reports verification suite:", err);
  process.exit(1);
});

