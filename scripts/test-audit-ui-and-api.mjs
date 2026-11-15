import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertSafeLocalApplicationTarget,
  assertSafeLocalDatabase,
} from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

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
    throw new Error(`Login failed for role/account: HTTP ${res.status}`);
  }
  return cookies;
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("TAHAP 5A — AUDIT LOG UI & VIEWER VERIFICATION SUITE");
  console.log("==================================================\n");

  const initialLogCount = await prisma.auditLog.count();
  console.log(`Baseline database AuditLog record count: ${initialLogCount}`);

  try {
    // -------------------------------------------------------------------------
    // 1. Unauthenticated & Authorization Boundaries
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: AUTENTIKASI & PERMISSION BOUNDARIES ---");

    const unauthApiRes = await request("/api/audit-logs");
    record(
      "1.1 Unauthenticated GET /api/audit-logs ditolak (HTTP 401)",
      unauthApiRes.status === 401,
      `Expected 401, received ${unauthApiRes.status}`,
    );

    const unauthPageRes = await request("/audit", { redirect: "manual" });
    record(
      "1.2 Unauthenticated GET /audit dialihkan ke login (HTTP 307/302)",
      unauthPageRes.status === 307 || unauthPageRes.status === 302,
      `Expected 307/302, received ${unauthPageRes.status}`,
    );

    // Non-permitted role login (Instructor without audit:read)
    const instructorCookies = await login("instructor.audit@ghs.test", "Password#123!");
    const nonPermittedApiRes = await request("/api/audit-logs", {
      headers: { Cookie: instructorCookies },
    });
    record(
      "1.3 Role non-admin (INSTRUCTOR) akses GET /api/audit-logs ditolak dengan 403 Forbidden",
      nonPermittedApiRes.status === 403,
      `Expected 403, received ${nonPermittedApiRes.status}`,
    );

    const nonPermittedPageRes = await request("/audit", {
      headers: { Cookie: instructorCookies },
      redirect: "manual",
    });
    record(
      "1.4 Role non-admin akses GET /audit dialihkan / ditolak server-side (HTTP 307/302 ke dashboard)",
      nonPermittedPageRes.status === 307 ||
        nonPermittedPageRes.status === 302 ||
        nonPermittedPageRes.status === 403,
      `Expected redirect or 403, received ${nonPermittedPageRes.status}`,
    );

    // Matrix RBAC verification for all non-permitted roles
    const nonPermittedRoles = await prisma.role.findMany({
      where: { name: { in: ["STUDENT", "INSTRUCTOR", "ACADEMIC_STAFF", "PLACEMENT_STAFF"] } },
      include: { permissions: { include: { permission: true } } },
    });
    const leakRoles = nonPermittedRoles.filter((r) =>
      r.permissions.some((p) => p.permission.name.includes("audit")),
    );
    record(
      "1.4b Matriks RBAC: Seluruh role non-admin (STUDENT, INSTRUCTOR, ACADEMIC_STAFF, PLACEMENT_STAFF) 100% bebas dari audit permission",
      leakRoles.length === 0,
      `Roles with audit permission leak: ${leakRoles.map((r) => r.name).join(", ")}`,
    );

    // Super Admin Login
    const superAdminEmail = process.env.SUPERADMIN_EMAIL?.trim();
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
    if (!superAdminEmail || !superAdminPassword) {
      throw new Error("SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD is missing from environment.");
    }

    const adminCookies = await login(superAdminEmail, superAdminPassword);
    const adminApiRes = await request("/api/audit-logs", {
      headers: { Cookie: adminCookies },
    });
    record(
      "1.5 Super Admin dengan permission audit:read berhasil mengakses /api/audit-logs (HTTP 200)",
      adminApiRes.status === 200,
      `Expected 200, received ${adminApiRes.status}`,
    );

    const adminPageRes = await request("/audit", {
      headers: { Cookie: adminCookies },
    });
    record(
      "1.6 Super Admin berhasil mengakses halaman /audit UI (HTTP 200)",
      adminPageRes.status === 200,
      `Expected 200, received ${adminPageRes.status}`,
    );

    // Management Role RBAC check in database
    const mgmtRole = await prisma.role.findFirst({
      where: { name: "MANAGEMENT" },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    const mgmtHasAuditRead = mgmtRole?.permissions.some(
      (p) => p.permission.name === "audit:read",
    );
    record(
      "1.7 Role MANAGEMENT terverifikasi memiliki permission audit:read di matriks RBAC",
      Boolean(mgmtHasAuditRead),
      "Role MANAGEMENT missing audit:read permission in DB",
    );

    // -------------------------------------------------------------------------
    // 2. Query Validation & Error Handling
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: VALIDASI INPUT & PENANGANAN ERROR ---");

    const limitOverRes = await request("/api/audit-logs?limit=101", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.1 Parameter limit > 100 ditolak (HTTP 400)",
      limitOverRes.status === 400,
      `Expected 400, received ${limitOverRes.status}`,
    );

    const limitZeroRes = await request("/api/audit-logs?limit=0", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.2 Parameter limit < 1 ditolak (HTTP 400)",
      limitZeroRes.status === 400,
      `Expected 400, received ${limitZeroRes.status}`,
    );

    const limitBadRes = await request("/api/audit-logs?limit=abc", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.3 Parameter limit non-integer ditolak (HTTP 400)",
      limitBadRes.status === 400,
      `Expected 400, received ${limitBadRes.status}`,
    );

    const cursorBadRes = await request("/api/audit-logs?cursor=invalid_cursor_xyz", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.4 Cursor yang tidak valid ditolak (HTTP 400)",
      cursorBadRes.status === 400,
      `Expected 400, received ${cursorBadRes.status}`,
    );

    const pageBadRes = await request("/api/audit-logs?page=0", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.5 Parameter page < 1 ditolak (HTTP 400)",
      pageBadRes.status === 400,
      `Expected 400, received ${pageBadRes.status}`,
    );

    const dateBadRes = await request("/api/audit-logs?startDate=not-a-valid-date", {
      headers: { Cookie: adminCookies },
    });
    record(
      "2.6 Parameter startDate tidak valid ditolak (HTTP 400)",
      dateBadRes.status === 400,
      `Expected 400, received ${dateBadRes.status}`,
    );

    // -------------------------------------------------------------------------
    // 3. Server-side Pagination & Filtering
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: PAGINATION & FILTERING ---");

    const page1Res = await request("/api/audit-logs?page=1&limit=5", {
      headers: { Cookie: adminCookies },
    });
    const page1Json = await page1Res.json();
    record(
      "3.1 Pagination Halaman 1 mengembalikan data dan pageInfo yang valid",
      page1Res.status === 200 &&
        Array.isArray(page1Json.data) &&
        page1Json.data.length === 5 &&
        page1Json.pageInfo.page === 1 &&
        page1Json.pageInfo.totalPages >= 1 &&
        page1Json.pageInfo.totalCount >= initialLogCount,
      `Page 1 response invalid: ${JSON.stringify(page1Json.pageInfo)}`,
    );

    const page2Res = await request("/api/audit-logs?page=2&limit=5", {
      headers: { Cookie: adminCookies },
    });
    const page2Json = await page2Res.json();
    const page1Ids = new Set(page1Json.data.map((d) => d.id));
    const page2HasOverlap = page2Json.data.some((d) => page1Ids.has(d.id));
    record(
      "3.2 Pagination Halaman 2 mengembalikan data berbeda tanpa overlap dari Halaman 1",
      page2Res.status === 200 &&
        page2Json.data.length === 5 &&
        !page2HasOverlap &&
        page2Json.pageInfo.page === 2,
      "Page 2 overlapped with Page 1 or failed",
    );

    // Action filter: CREATE
    const createFilterRes = await request("/api/audit-logs?action=CREATE&limit=10", {
      headers: { Cookie: adminCookies },
    });
    const createFilterJson = await createFilterRes.json();
    const allCreate =
      createFilterJson.data.length > 0 &&
      createFilterJson.data.every((d) => d.action === "CREATE");
    record(
      "3.3 Filter action=CREATE hanya mengembalikan catatan aksi CREATE",
      allCreate,
      `Unexpected action in response: ${createFilterJson.data.map((d) => d.action).join(", ")}`,
    );

    // Action filter: GRADE
    const gradeFilterRes = await request("/api/audit-logs?action=GRADE&limit=10", {
      headers: { Cookie: adminCookies },
    });
    const gradeFilterJson = await gradeFilterRes.json();
    const allGrade =
      gradeFilterJson.data.length > 0 &&
      gradeFilterJson.data.every((d) => d.action === "GRADE");
    record(
      "3.4 Filter action=GRADE hanya mengembalikan catatan aksi GRADE",
      allGrade,
      `Unexpected action in response: ${gradeFilterJson.data.map((d) => d.action).join(", ")}`,
    );

    // Entity filter: AssignmentSubmission
    const subFilterRes = await request(
      "/api/audit-logs?entity=AssignmentSubmission&limit=10",
      { headers: { Cookie: adminCookies } },
    );
    const subFilterJson = await subFilterRes.json();
    const allSub =
      subFilterJson.data.length > 0 &&
      subFilterJson.data.every((d) => d.entity === "AssignmentSubmission");
    record(
      "3.5 Filter entity=AssignmentSubmission hanya mengembalikan entitas AssignmentSubmission",
      allSub,
      `Unexpected entity in response: ${subFilterJson.data.map((d) => d.entity).join(", ")}`,
    );

    // Search query
    const searchRes = await request("/api/audit-logs?search=asub_&limit=10", {
      headers: { Cookie: adminCookies },
    });
    const searchJson = await searchRes.json();
    const allMatched =
      searchJson.data.length > 0 &&
      searchJson.data.every(
        (d) =>
          d.entityId.toLowerCase().includes("asub_") ||
          (d.actor?.name && d.actor.name.toLowerCase().includes("asub_")),
      );
    record(
      "3.6 Search filter mencocokkan kata kunci pada entityId atau pelaku",
      allMatched,
      "Search returned unmatched rows",
    );

    // Empty state search
    const emptySearchRes = await request(
      "/api/audit-logs?search=nonexistent_entity_id_xyz9999",
      { headers: { Cookie: adminCookies } },
    );
    const emptySearchJson = await emptySearchRes.json();
    record(
      "3.7 Pencarian data tidak ada mengembalikan array kosong dan totalCount 0 secara aman",
      emptySearchRes.status === 200 &&
        Array.isArray(emptySearchJson.data) &&
        emptySearchJson.data.length === 0 &&
        emptySearchJson.pageInfo.totalCount === 0,
      `Expected empty array, received: ${JSON.stringify(emptySearchJson)}`,
    );

    // -------------------------------------------------------------------------
    // 4. Server-side Sanitization & Metadata Security
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: SANITASI SERVER & KEAMANAN METADATA ---");

    const sampleAuditRes = await request("/api/audit-logs?limit=50", {
      headers: { Cookie: adminCookies },
    });
    const sampleAuditJson = await sampleAuditRes.json();

    const sensitiveKeyPattern =
      /password|token|secret|session|database[_-]?url|storage[_-]?path|raw[_-]?path/i;
    const sensitiveValuePattern =
      /^(postgres(ql)?:\/\/|Bearer\s+|eyJ[a-zA-Z0-9_-]{15,}|\$2[aby]\$)/i;

    let foundSensitiveKey = false;
    let foundSensitiveValue = false;
    let missingSummary = false;

    for (const item of sampleAuditJson.data) {
      if (!item.summary || typeof item.summary !== "string" || item.summary.trim() === "") {
        missingSummary = true;
      }

      function checkObj(obj) {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          if (sensitiveKeyPattern.test(k)) {
            foundSensitiveKey = true;
            console.error(`Sensitive key detected in audit item ${item.id}: ${k}`);
          }
          if (typeof v === "string" && sensitiveValuePattern.test(v)) {
            foundSensitiveValue = true;
            console.error(`Sensitive value leaked in audit item ${item.id}: [KEY: ${k}]`);
          }
          if (typeof v === "object" && v !== null) {
            checkObj(v);
          }
        }
      }

      checkObj(item.details);
      checkObj(item.changes);
    }

    record(
      "4.1 Seluruh payload response bebas dari sensitive keys (password, token, secret, session, storagePath)",
      !foundSensitiveKey,
      "Sensitive key was found in response payload",
    );

    record(
      "4.2 Seluruh payload response bebas dari raw connection strings, secrets, atau bcrypt hashes",
      !foundSensitiveValue,
      "Sensitive value string was leaked in response payload",
    );

    record(
      "4.3 Seluruh entri audit log memiliki summary deskriptif ramah pengguna dalam Bahasa Indonesia",
      !missingSummary,
      "Some items had missing or empty summary",
    );

    // Null actor resilience check
    const hasNullActorRecord = sampleAuditJson.data.some((d) => d.actor === null);
    record(
      "4.4 Entri dengan user/actor yang bernilai null ditangani secara aman (actor: null)",
      hasNullActorRecord,
      "No null-actor records found to assert resilience",
    );

    // -------------------------------------------------------------------------
    // 5. Append-only Immutability & Method Restrictions
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: SIFAT APPEND-ONLY & INTEGRITAS DATA ---");

    const postAttempt = await request("/api/audit-logs", {
      method: "POST",
      headers: { Cookie: adminCookies, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "FAKE_ACTION", entity: "Test" }),
    });
    record(
      "5.1 POST /api/audit-logs ditolak (HTTP 405 Method Not Allowed)",
      postAttempt.status === 405,
      `Expected 405, received ${postAttempt.status}`,
    );

    const deleteAttempt = await request("/api/audit-logs", {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record(
      "5.2 DELETE /api/audit-logs ditolak (HTTP 405 Method Not Allowed)",
      deleteAttempt.status === 405,
      `Expected 405, received ${deleteAttempt.status}`,
    );

    const finalLogCount = await prisma.auditLog.count();
    record(
      "5.3 Sifat append-only terbukti: Total audit log tidak berubah setelah seluruh pengujian read-only",
      finalLogCount === initialLogCount,
      `AuditLog count changed from ${initialLogCount} to ${finalLogCount}`,
    );

    // -------------------------------------------------------------------------
    // 6. Navigation and Sidebar Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: KONSISTENSI NAVIGASI & SIDEBAR ---");

    const sidebarContent = fs.readFileSync(
      path.resolve("components/layout/app-sidebar.tsx"),
      "utf8",
    );
    const proxyContent = fs.readFileSync(path.resolve("proxy.ts"), "utf8");

    record(
      "6.1 proxy.ts memuat matcher untuk /audit/:path*",
      proxyContent.includes('"/audit/:path*"'),
      'proxy.ts missing "/audit/:path*"',
    );

    record(
      "6.2 components/layout/app-sidebar.tsx memuat rute 'Audit Log': '/audit'",
      sidebarContent.includes('"Audit Log": "/audit"'),
      'app-sidebar.tsx missing "Audit Log": "/audit"',
    );

    record(
      "6.3 components/layout/app-sidebar.tsx membatasi Audit Log pada canViewAudit (Admin & Management)",
      sidebarContent.includes("canViewAudit") &&
        sidebarContent.includes("isManagement") &&
        sidebarContent.includes("isAdminOrSuperAdmin"),
      "app-sidebar.tsx missing role-based gating for Audit Log",
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`HASIL AKHIR TAHAP 5A: ${passed} / ${total} pengujian BERHASIL.`);
  console.log("==================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal error during test suite:", err);
  process.exit(1);
});
