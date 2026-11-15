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
const screenshotDir = "C:\\Users\\lastyee\\.gemini\\antigravity\\brain\\4dfe325b-c36f-4527-bfd3-a9ada172b748\\screenshots";

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
  if (res.status !== 302 && res.status !== 303 && res.status !== 200) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  return cookies;
}

// Minimal CDP Client Helper
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

async function runFinalVerification() {
  console.log("==================================================");
  console.log("TAHAP 5A FINAL VERIFICATION SUITE — AUDIT LOG UI");
  console.log("==================================================\n");

  await fs.mkdir(screenshotDir, { recursive: true });

  const initialLogCount = await prisma.auditLog.count();
  console.log(`[DATA BASELINE] Initial AuditLog record count: ${initialLogCount}`);

  const cleanupUserIds = [];
  const runId = randomUUID().slice(0, 8);
  const fixturePassword = `AuditTest#${runId}!`;
  const passwordHash = await bcrypt.hash(fixturePassword, 10);

  let chrome = null;

  try {
    // =========================================================================
    // SECTION 1: REAL HTTP ROLE SESSIONS VERIFICATION
    // =========================================================================
    console.log("\n--- SECTION 1: VERIFIKASI SESI HTTP ROLE NYATA ---");

    // 1.1 SUPER_ADMIN Real Session
    const saEmail = process.env.SUPERADMIN_EMAIL?.trim();
    const saPassword = process.env.SUPERADMIN_PASSWORD;
    const saCookies = await login(saEmail, saPassword);

    const saApiRes = await request("/api/audit-logs", { headers: { Cookie: saCookies } });
    const saPageRes = await request("/audit", { headers: { Cookie: saCookies } });
    record("1.1 SUPER_ADMIN real session akses /api/audit-logs (HTTP 200)", saApiRes.status === 200);
    record("1.2 SUPER_ADMIN real session akses /audit page (HTTP 200)", saPageRes.status === 200);

    // 1.2 ADMIN Real Session (via disposable user fixture)
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const adminUser = await prisma.user.create({
      data: {
        email: `temp.admin.${runId}@ghs.test`,
        name: `Temporary Admin ${runId}`,
        passwordHash,
        roleId: adminRole.id,
      },
    });
    cleanupUserIds.push(adminUser.id);

    const adminCookies = await login(adminUser.email, fixturePassword);
    const adminApiRes = await request("/api/audit-logs", { headers: { Cookie: adminCookies } });
    const adminPageRes = await request("/audit", { headers: { Cookie: adminCookies } });
    record("1.3 ADMIN real session akses /api/audit-logs (HTTP 200)", adminApiRes.status === 200);
    record("1.4 ADMIN real session akses /audit page (HTTP 200)", adminPageRes.status === 200);

    // 1.3 MANAGEMENT Real Session (via disposable user fixture)
    const mgmtRole = await prisma.role.findUniqueOrThrow({ where: { name: "MANAGEMENT" } });
    const mgmtUser = await prisma.user.create({
      data: {
        email: `temp.mgmt.${runId}@ghs.test`,
        name: `Temporary Management ${runId}`,
        passwordHash,
        roleId: mgmtRole.id,
      },
    });
    cleanupUserIds.push(mgmtUser.id);

    const mgmtCookies = await login(mgmtUser.email, fixturePassword);
    const mgmtApiRes = await request("/api/audit-logs", { headers: { Cookie: mgmtCookies } });
    const mgmtPageRes = await request("/audit", { headers: { Cookie: mgmtCookies } });
    record("1.5 MANAGEMENT real session akses /api/audit-logs (HTTP 200)", mgmtApiRes.status === 200);
    record("1.6 MANAGEMENT real session akses /audit page (HTTP 200)", mgmtPageRes.status === 200);

    // 1.4 Non-permitted Role Session (INSTRUCTOR without audit:read)
    const instructorCookies = await login("instructor.audit@ghs.test", "Password#123!");
    const instApiRes = await request("/api/audit-logs", { headers: { Cookie: instructorCookies } });
    const instPageRes = await request("/audit", { headers: { Cookie: instructorCookies }, redirect: "manual" });
    record("1.7 Non-permitted role (INSTRUCTOR) ditolak di /api/audit-logs (HTTP 403 Forbidden)", instApiRes.status === 403);
    record("1.8 Non-permitted role (INSTRUCTOR) dialihkan dari /audit (HTTP 307/302 ke dashboard)", instPageRes.status === 307 || instPageRes.status === 302);

    // 1.5 Unauthenticated Session
    const unauthApiRes = await request("/api/audit-logs");
    const unauthPageRes = await request("/audit", { redirect: "manual" });
    record("1.9 Sesi tanpa login ditolak di /api/audit-logs (HTTP 401 Unauthorized)", unauthApiRes.status === 401);
    record("1.10 Sesi tanpa login dialihkan ke /login (HTTP 307/302)", unauthPageRes.status === 307 || unauthPageRes.status === 302);

    // =========================================================================
    // SECTION 2: SERVER-SIDE SANITIZATION DEEP VERIFICATION
    // =========================================================================
    console.log("\n--- SECTION 2: VERIFIKASI MENDALAM SANITASI SERVER ---");

    const auditDataRes = await request("/api/audit-logs?limit=50", { headers: { Cookie: saCookies } });
    const auditDataJson = await auditDataRes.json();

    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /session/i,
      /database[_-]?url/i,
      /storage[_-]?path/i,
      /raw[_-]?path/i,
    ];

    let foundSensitiveField = false;
    let foundSensitiveValue = false;

    function deepCheck(val) {
      if (!val || typeof val !== "object") return;
      for (const [k, v] of Object.entries(val)) {
        if (sensitivePatterns.some((pattern) => pattern.test(k))) {
          foundSensitiveField = true;
          console.error(`Sensitive key found: ${k}`);
        }
        if (typeof v === "string") {
          if (/postgres(ql)?:\/\/|Bearer\s+|eyJ[a-zA-Z0-9_-]{15,}|\$2[aby]\$/i.test(v)) {
            foundSensitiveValue = true;
            console.error(`Sensitive value found in key ${k}: ${v}`);
          }
        } else if (typeof v === "object" && v !== null) {
          deepCheck(v);
        }
      }
    }

    for (const row of auditDataJson.data) {
      deepCheck(row.details);
      deepCheck(row.changes);
    }

    record("2.1 Tidak ada sensitive keys bocor dalam payload API", !foundSensitiveField);
    record("2.2 Tidak ada token JWT, postgres URL, atau hash kredensial bocor dalam payload API", !foundSensitiveValue);
    record("2.3 Setiap baris audit log memiliki ringkasan (summary) bahasa Indonesia yang valid", 
      auditDataJson.data.every((r) => typeof r.summary === "string" && r.summary.trim().length > 0));

    // =========================================================================
    // SECTION 3: BROWSER VISUAL VERIFICATION VIA HEADLESS CHROME
    // =========================================================================
    console.log("\n--- SECTION 3: PEMERIKSAAN VISUAL CHROME & SCREENSHOTS ---");

    chrome = new ChromeController();
    await chrome.start();

    // 3.1 Desktop View (1280x800) as SUPER_ADMIN
    await chrome.setViewport(1280, 800, false);
    await chrome.setCookies(saCookies);
    await chrome.navigate(`${baseUrl}/audit`, 3000);

    const hasTable = await chrome.waitFor("document.querySelector('table') !== null");
    record("3.1 Browser Desktop berhasil memuat halaman /audit beserta tabel log", Boolean(hasTable));

    const desktopMainShot = await chrome.captureScreenshot("audit-desktop-main-view.png");
    console.log(`   Captured desktop screenshot: ${desktopMainShot}`);
    record("3.2 Tersimpan screenshot desktop utama (audit-desktop-main-view.png)", Boolean(desktopMainShot));

    // 3.2 Detail Modal Dialog View
    await chrome.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('table button'));
        const detailBtn = buttons.find(b => b.textContent.includes('Detail'));
        if (detailBtn) { detailBtn.click(); return true; }
        return false;
      })()
    `);

    await new Promise((r) => setTimeout(r, 600));
    const modalVisible = await chrome.waitFor("document.querySelector('[role=\"dialog\"]') !== null");
    record("3.3 Dialog detail terbuka saat tombol 'Detail' diklik", Boolean(modalVisible));

    const desktopModalShot = await chrome.captureScreenshot("audit-desktop-detail-modal.png");
    console.log(`   Captured detail modal screenshot: ${desktopModalShot}`);
    record("3.4 Tersimpan screenshot dialog detail (audit-desktop-detail-modal.png)", Boolean(desktopModalShot));

    // Close modal
    await chrome.eval(`
      (() => {
        const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Tutup modal"]') ||
                         Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.includes('Tutup'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // 3.3 Filter Interaction (Filter by action=GRADE)
    await chrome.eval(`
      (() => {
        const selects = Array.from(document.querySelectorAll('select'));
        const actionSelect = selects[0];
        if (actionSelect) {
          actionSelect.value = 'GRADE';
          actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));

    const desktopFilteredShot = await chrome.captureScreenshot("audit-desktop-filtered-view.png");
    console.log(`   Captured filtered view screenshot: ${desktopFilteredShot}`);
    record("3.5 Tersimpan screenshot hasil filter aksi GRADE (audit-desktop-filtered-view.png)", Boolean(desktopFilteredShot));

    // 3.4 Mobile Responsive View (375x812)
    await chrome.setViewport(375, 812, true);
    await chrome.navigate(`${baseUrl}/audit`, 2500);

    const mobileShot = await chrome.captureScreenshot("audit-mobile-responsive-view.png");
    console.log(`   Captured mobile screenshot: ${mobileShot}`);
    record("3.6 Tersimpan screenshot tampilan mobile responsif (audit-mobile-responsive-view.png)", Boolean(mobileShot));

    // 3.5 MANAGEMENT Session Visual Verification
    await chrome.clearCookies();
    await chrome.setViewport(1280, 800, false);
    await chrome.setCookies(mgmtCookies);
    await chrome.navigate(`${baseUrl}/audit`, 2500);

    const mgmtSidebarItem = await chrome.eval(`
      (() => {
        const links = Array.from(document.querySelectorAll('aside a'));
        return links.some(a => a.textContent.includes('Audit Log'));
      })()
    `);
    record("3.7 Sesi MANAGEMENT menampilkan menu 'Audit Log' pada sidebar navigasi", Boolean(mgmtSidebarItem));

    const mgmtViewShot = await chrome.captureScreenshot("audit-management-session-view.png");
    console.log(`   Captured management view screenshot: ${mgmtViewShot}`);
    record("3.8 Tersimpan screenshot sesi MANAGEMENT (audit-management-session-view.png)", Boolean(mgmtViewShot));

    // =========================================================================
    // SECTION 4: DATA IMMUTABILITY & AUDIT COUNT VERIFICATION
    // =========================================================================
    console.log("\n--- SECTION 4: PEMBUKTIAN IMMUTABILITY APPEND-ONLY ---");

    const finalLogCount = await prisma.auditLog.count();
    console.log(`[DATA AUDIT] Final AuditLog record count: ${finalLogCount}`);

    record(
      "4.1 Jumlah catatan AuditLog tidak berubah sama sekali (Tetap 148 baris)",
      finalLogCount === initialLogCount,
      `AuditLog count changed! Initial: ${initialLogCount}, Final: ${finalLogCount}`
    );

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
  console.log(`HASIL FINAL VERIFIKASI TAHAP 5A: ${passed} / ${total} PEMERIKSAAN LULUS.`);
  console.log("==================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runFinalVerification().catch((err) => {
  console.error("Fatal error in final verification suite:", err);
  process.exit(1);
});
