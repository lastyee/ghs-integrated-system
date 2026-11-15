// scripts/test-tahap5f1-soft-delete-and-ui.mjs
// Verification suite for Tahap 5F.1: Certificate Soft-Delete Permission & Revoked Download UI Fix

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getStorageProvider, CERTIFICATES_BUCKET } from "../lib/storage.ts";
import {
  assertSafeLocalApplicationTarget,
  assertSafeLocalDatabase,
} from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
assertSafeLocalApplicationTarget({ baseUrl });

const results = [];
let passed = 0;
let failed = 0;

function record(name, condition, errorMsg = "") {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    results.push({ name, pass: true });
  } else {
    failed++;
    console.error(`✗ ${name}: ${errorMsg}`);
    results.push({ name, pass: false, error: errorMsg });
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
  if (!cookies.includes("authjs.session-token")) {
    throw new Error(`Login failed for ${email}: No session token cookie set (HTTP ${response.status})`);
  }
  return cookies;
}

async function api(method, path, cookies = "", body = undefined) {
  const headers = {};
  if (cookies) headers["Cookie"] = cookies;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

async function main() {
  console.log("==========================================================================");
  console.log("TAHAP 5F.1: CERTIFICATE SOFT-DELETE PERMISSION & REVOKED DOWNLOAD UI FIX");
  console.log("==========================================================================\n");

  const initialCertCount = await prisma.certificate.count();
  const initialAuditCount = await prisma.auditLog.count();
  console.log(`Initial DB Baseline -> Certificates: ${initialCertCount}, AuditLogs: ${initialAuditCount}`);

  record("0. Initial Certificate baseline is 0", initialCertCount === 0, `Expected 0, got ${initialCertCount}`);
  record("0b. Initial AuditLog baseline is 148", initialAuditCount === 148, `Expected 148, got ${initialAuditCount}`);

  const cleanup = {
    users: [],
    students: [],
    enrollments: [],
    certificates: [],
    auditLogs: [],
    storageFiles: [],
  };

  const timestamp = Date.now();
  const defaultPassword = "SafePassword@123";
  const tempPasswordHash = await bcrypt.hash(defaultPassword, 10);

  try {
    // 1. Authenticate All 7 Roles
    console.log("\n--- SECTION 1: AUTHENTICATING ALL 7 ROLES ---");

    // 1.1 SUPER_ADMIN
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || "muhamadrivqi83@gmail.com";
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "rivqi240205";
    const superAdminCookies = await login(superAdminEmail, superAdminPassword);
    record("1. Authenticate SUPER_ADMIN session", !!superAdminCookies, "Failed to login as SUPER_ADMIN");

    // 1.2 Helper to provision test user with role
    async function provisionUser(roleName) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new Error(`Role ${roleName} not found in database`);
      const email = `test.${roleName.toLowerCase()}.${timestamp}@ghs.test`;
      const user = await prisma.user.create({
        data: {
          email,
          name: `Test ${roleName} ${timestamp}`,
          passwordHash: tempPasswordHash,
          roleId: role.id,
        },
      });
      cleanup.users.push(user.id);
      const cookies = await login(email, defaultPassword);
      return { user, cookies };
    }

    const admin = await provisionUser("ADMIN");
    record("2. Authenticate ADMIN session", !!admin.cookies, "Failed to login as ADMIN");

    const mgmt = await provisionUser("MANAGEMENT");
    record("3. Authenticate MANAGEMENT session", !!mgmt.cookies, "Failed to login as MANAGEMENT");

    const acad = await provisionUser("ACADEMIC_STAFF");
    record("4. Authenticate ACADEMIC_STAFF session", !!acad.cookies, "Failed to login as ACADEMIC_STAFF");

    const inst = await provisionUser("INSTRUCTOR");
    record("5. Authenticate INSTRUCTOR session", !!inst.cookies, "Failed to login as INSTRUCTOR");

    const place = await provisionUser("PLACEMENT_STAFF");
    record("6. Authenticate PLACEMENT_STAFF session", !!place.cookies, "Failed to login as PLACEMENT_STAFF");

    // Student 1 (Recipient/Owner)
    const studentUser1 = await provisionUser("STUDENT");
    const student1 = await prisma.student.create({
      data: {
        userId: studentUser1.user.id,
        nim: `NIM-5F1-A-${timestamp.toString().slice(-6)}`,
        name: `Student 5F1 Recipient ${timestamp}`,
      },
    });
    cleanup.students.push(student1.id);
    record("7. Authenticate STUDENT (Owner) session", !!studentUser1.cookies, "Failed to login as STUDENT");

    // 2. Fetch active Program and Batch fixtures
    const program = await prisma.program.findFirst({
      where: { deletedAt: null, batches: { some: { deletedAt: null } } },
      include: { batches: { where: { deletedAt: null } } },
    });
    const batch = program?.batches?.[0];
    if (!program || !batch) {
      throw new Error("Missing active program with active batch in test environment");
    }

    // 3. Create Enrollment for Student 1
    const enrollment1 = await prisma.enrollment.create({
      data: {
        studentId: student1.id,
        batchId: batch.id,
        status: "ACTIVE",
      },
    });
    cleanup.enrollments.push(enrollment1.id);

    // 4. Provision dummy PDF in storage
    const storagePath = `certificates/test-5f1-${timestamp}.pdf`;
    const dummyPdfContent = Buffer.from("%PDF-1.4 5F1 Test Certificate Content");
    const storage = getStorageProvider();
    await storage.upload({
      bucket: CERTIFICATES_BUCKET,
      path: storagePath,
      file: dummyPdfContent,
      contentType: "application/pdf",
    });
    cleanup.storageFiles.push(storagePath);

    // Helper to issue an active test certificate
    let certSeq = 1;
    async function issueTestCert(suffix = "") {
      const num = `GHS/5F1/TEST/${timestamp}/${certSeq++}${suffix}`;
      const res = await api("POST", "/api/certificates", superAdminCookies, {
        studentId: student1.id,
        programId: program.id,
        batchId: batch.id,
        certificateNumber: num,
        issuedAt: new Date().toISOString(),
        path: storagePath,
      });
      if (res.status !== 201) {
        throw new Error(`Failed to issue test certificate: ${JSON.stringify(res.data)}`);
      }
      const certId = res.data.data.id;
      cleanup.certificates.push(certId);
      const audit = await prisma.auditLog.findFirst({
        where: { entity: "Certificate", entityId: certId, action: "CREATE" },
      });
      if (audit) cleanup.auditLogs.push(audit.id);
      return { id: certId, certificateNumber: num };
    }

    // =========================================================================
    // SECTION 2: SOFT-DELETE RBAC MATRIX ACROSS ALL ROLES
    // =========================================================================
    console.log("\n--- SECTION 2: SOFT-DELETE RBAC MATRIX ACROSS ALL ROLES ---");

    // 2.1 Unauthenticated -> 401 Unauthorized
    const certUnauth = await issueTestCert("-unauth");
    const delUnauth = await api("DELETE", `/api/certificates/${certUnauth.id}`);
    record("8. Unauthenticated DELETE /api/certificates/[id] rejected with 401 Unauthorized", delUnauth.status === 401, `Status: ${delUnauth.status}`);
    const unauthRow = await prisma.certificate.findUnique({ where: { id: certUnauth.id } });
    record("8b. Unauthenticated request did NOT soft-delete record", unauthRow?.deletedAt === null, `deletedAt: ${unauthRow?.deletedAt}`);

    // 2.2 STUDENT -> 403 Forbidden
    const delStudent = await api("DELETE", `/api/certificates/${certUnauth.id}`, studentUser1.cookies);
    record("9. STUDENT role DELETE /api/certificates/[id] rejected with 403 Forbidden", delStudent.status === 403, `Status: ${delStudent.status}`);

    // 2.3 PLACEMENT_STAFF -> 403 Forbidden
    const delPlacement = await api("DELETE", `/api/certificates/${certUnauth.id}`, place.cookies);
    record("10. PLACEMENT_STAFF role DELETE /api/certificates/[id] rejected with 403 Forbidden", delPlacement.status === 403, `Status: ${delPlacement.status}`);

    // 2.4 INSTRUCTOR -> 403 Forbidden
    const delInstructor = await api("DELETE", `/api/certificates/${certUnauth.id}`, inst.cookies);
    record("11. INSTRUCTOR role DELETE /api/certificates/[id] rejected with 403 Forbidden", delInstructor.status === 403, `Status: ${delInstructor.status}`);

    // 2.5 ACADEMIC_STAFF -> 403 Forbidden
    const delAcademic = await api("DELETE", `/api/certificates/${certUnauth.id}`, acad.cookies);
    record("12. ACADEMIC_STAFF role DELETE /api/certificates/[id] rejected with 403 Forbidden", delAcademic.status === 403, `Status: ${delAcademic.status}`);

    // 2.6 MANAGEMENT -> 403 Forbidden
    const delMgmt = await api("DELETE", `/api/certificates/${certUnauth.id}`, mgmt.cookies);
    record("13. MANAGEMENT role DELETE /api/certificates/[id] rejected with 403 Forbidden", delMgmt.status === 403, `Status: ${delMgmt.status}`);

    // Clean up certUnauth by soft-deleting via superadmin
    await prisma.certificate.update({ where: { id: certUnauth.id }, data: { deletedAt: new Date() } });

    // 2.7 ADMIN -> 200 OK (Allowed to soft-delete)
    const certAdminDel = await issueTestCert("-admin");
    const delAdmin = await api("DELETE", `/api/certificates/${certAdminDel.id}`, admin.cookies);
    record("14. ADMIN role DELETE /api/certificates/[id] succeeds with 200 OK", delAdmin.status === 200, `Status: ${delAdmin.status}`);
    record("14b. ADMIN DELETE response returns deleted record id and deletedAt", delAdmin.data?.data?.id === certAdminDel.id && !!delAdmin.data?.data?.deletedAt, JSON.stringify(delAdmin.data));

    // Track AuditLog created by Admin DELETE
    const adminDelAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certAdminDel.id, action: "DELETE" },
    });
    if (adminDelAudit) cleanup.auditLogs.push(adminDelAudit.id);
    record("14c. ADMIN soft-delete creates DELETE AuditLog", !!adminDelAudit, "AuditLog DELETE not found");

    // Verify record was SOFT-deleted, NOT hard-deleted
    const adminDelRow = await prisma.certificate.findUnique({ where: { id: certAdminDel.id } });
    record("15. Record still exists in database (NOT hard-deleted)", adminDelRow !== null, "Record was deleted from DB!");
    record("15b. Record has non-null deletedAt timestamp", adminDelRow?.deletedAt !== null, `deletedAt: ${adminDelRow?.deletedAt}`);

    // 2.8 SUPER_ADMIN -> 200 OK (Allowed to soft-delete)
    const certSaDel = await issueTestCert("-sa");
    const delSa = await api("DELETE", `/api/certificates/${certSaDel.id}`, superAdminCookies);
    record("16. SUPER_ADMIN role DELETE /api/certificates/[id] succeeds with 200 OK", delSa.status === 200, `Status: ${delSa.status}`);
    const saDelAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certSaDel.id, action: "DELETE" },
    });
    if (saDelAudit) cleanup.auditLogs.push(saDelAudit.id);
    record("16b. SUPER_ADMIN soft-delete creates DELETE AuditLog", !!saDelAudit, "AuditLog DELETE not found");

    const saDelRow = await prisma.certificate.findUnique({ where: { id: certSaDel.id } });
    record("16c. SUPER_ADMIN soft-delete preserves record in DB (NOT hard-deleted)", saDelRow !== null && saDelRow.deletedAt !== null, `Record: ${saDelRow}`);

    // =========================================================================
    // SECTION 3: SOFT-DELETED RECORD ENDPOINT ISOLATION & IDEMPOTENCY
    // =========================================================================
    console.log("\n--- SECTION 3: SOFT-DELETED RECORD ENDPOINT ISOLATION ---");

    // 3.1 Detail endpoint returns 404 for soft-deleted record
    const getDetailSoftDel = await api("GET", `/api/certificates/${certAdminDel.id}`, admin.cookies);
    record("17. GET /api/certificates/[id] returns 404 Not Found for soft-deleted certificate", getDetailSoftDel.status === 404, `Status: ${getDetailSoftDel.status}`);

    // 3.2 Download endpoint returns 404 for soft-deleted record
    const getDownloadSoftDel = await api("GET", `/api/certificates/${certAdminDel.id}/download`, admin.cookies);
    record("18. GET /api/certificates/[id]/download returns 404 Not Found for soft-deleted certificate", getDownloadSoftDel.status === 404, `Status: ${getDownloadSoftDel.status}`);

    // 3.3 List endpoint excludes soft-deleted record
    const getList = await api("GET", "/api/certificates", admin.cookies);
    const inList = Array.isArray(getList.data?.data) && getList.data.data.some((c) => c.id === certAdminDel.id);
    record("19. GET /api/certificates list excludes soft-deleted certificate", !inList, `Found in list: ${inList}`);

    // 3.4 Repeated DELETE returns 404 Not Found
    const delAgain = await api("DELETE", `/api/certificates/${certAdminDel.id}`, admin.cookies);
    record("20. Repeated DELETE returns 404 Not Found", delAgain.status === 404, `Status: ${delAgain.status}`);

    // =========================================================================
    // SECTION 4: REVOCATION VS SOFT-DELETE SEPARATION & ACCESS RULES
    // =========================================================================
    console.log("\n--- SECTION 4: REVOCATION VS SOFT-DELETE SEPARATION ---");

    const certRevoke = await issueTestCert("-revoke-test");

    // 4.1 Revoke is separate: Status changes to REVOKED, deletedAt remains null
    const revokeRes = await api("PATCH", `/api/certificates/${certRevoke.id}/revoke`, admin.cookies, {
      reason: "5F1 Revoke vs SoftDelete Test",
    });
    record("21. Admin revokes certificate -> 200 OK", revokeRes.status === 200, `Status: ${revokeRes.status}`);
    record("21b. Certificate status updated to REVOKED", revokeRes.data?.data?.status === "REVOKED", `Status: ${revokeRes.data?.data?.status}`);

    const revokeAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certRevoke.id, action: "REVOKE" },
    });
    if (revokeAudit) cleanup.auditLogs.push(revokeAudit.id);
    record("21c. REVOKE action logged in AuditLog", !!revokeAudit, "AuditLog REVOKE not found");

    const revokeDbRow = await prisma.certificate.findUnique({ where: { id: certRevoke.id } });
    record("22. Revoked certificate remains active in DB (deletedAt is NULL)", revokeDbRow?.deletedAt === null, `deletedAt: ${revokeDbRow?.deletedAt}`);

    // 4.2 Detail endpoint still serves REVOKED certificate
    const detailRevoked = await api("GET", `/api/certificates/${certRevoke.id}`, studentUser1.cookies);
    record("23. Student can view detail of REVOKED certificate (200 OK)", detailRevoked.status === 200, `Status: ${detailRevoked.status}`);
    record("23b. Detail explicitly reports status REVOKED", detailRevoked.data?.data?.status === "REVOKED", `Status: ${detailRevoked.data?.data?.status}`);

    // 4.3 Student CANNOT download REVOKED certificate -> 403 Forbidden
    const studRevokedDl = await api("GET", `/api/certificates/${certRevoke.id}/download`, studentUser1.cookies);
    record("24. Student download of REVOKED certificate is blocked (403 Forbidden)", studRevokedDl.status === 403, `Status: ${studRevokedDl.status}`);
    record("24b. Student receives NO signedUrl on blocked download", studRevokedDl.data?.data?.signedUrl === undefined, `signedUrl: ${studRevokedDl.data?.data?.signedUrl}`);

    // 4.4 Staff CAN download archive of REVOKED certificate -> 200 OK
    const staffRevokedDl = await api("GET", `/api/certificates/${certRevoke.id}/download`, admin.cookies);
    record("25. Staff download of REVOKED archive succeeds (200 OK)", staffRevokedDl.status === 200, `Status: ${staffRevokedDl.status}`);
    record("25b. Staff download response reports status REVOKED", staffRevokedDl.data?.data?.status === "REVOKED", `Status: ${staffRevokedDl.data?.data?.status}`);
    record("25c. Staff download response contains valid signedUrl", !!staffRevokedDl.data?.data?.signedUrl, "Missing signedUrl");

    // 4.5 Soft-delete the REVOKED certificate
    const delRevoked = await api("DELETE", `/api/certificates/${certRevoke.id}`, admin.cookies);
    record("26. Admin can soft-delete a REVOKED certificate (200 OK)", delRevoked.status === 200, `Status: ${delRevoked.status}`);
    const delRevAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certRevoke.id, action: "DELETE" },
    });
    if (delRevAudit) cleanup.auditLogs.push(delRevAudit.id);

    // 4.6 After soft-delete, staff download now returns 404
    const staffPostSoftDelDl = await api("GET", `/api/certificates/${certRevoke.id}/download`, admin.cookies);
    record("27. Staff download of soft-deleted revoked certificate returns 404 Not Found", staffPostSoftDelDl.status === 404, `Status: ${staffPostSoftDelDl.status}`);

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    failed++;
  } finally {
    console.log("\n--- SECTION 5: CLEANUP & BASELINE RESTORATION ---");
    // Clean up created certificates
    if (cleanup.certificates.length > 0) {
      console.log(`Cleaning up ${cleanup.certificates.length} test certificates...`);
      await prisma.certificate.deleteMany({
        where: { id: { in: cleanup.certificates } },
      });
    }

    // Clean up created audit logs
    if (cleanup.auditLogs.length > 0) {
      console.log(`Cleaning up ${cleanup.auditLogs.length} test audit logs...`);
      await prisma.auditLog.deleteMany({
        where: { id: { in: cleanup.auditLogs } },
      });
    }

    // Clean up created enrollments
    if (cleanup.enrollments.length > 0) {
      console.log(`Cleaning up ${cleanup.enrollments.length} test enrollments...`);
      await prisma.enrollment.deleteMany({
        where: { id: { in: cleanup.enrollments } },
      });
    }

    // Clean up created students
    if (cleanup.students.length > 0) {
      console.log(`Cleaning up ${cleanup.students.length} test students...`);
      await prisma.student.deleteMany({
        where: { id: { in: cleanup.students } },
      });
    }

    // Clean up created users
    if (cleanup.users.length > 0) {
      console.log(`Cleaning up ${cleanup.users.length} test users...`);
      await prisma.user.deleteMany({
        where: { id: { in: cleanup.users } },
      });
    }

    // Clean up storage test files
    if (cleanup.storageFiles.length > 0) {
      console.log(`Cleaning up ${cleanup.storageFiles.length} storage test files...`);
      const storage = getStorageProvider();
      for (const filePath of cleanup.storageFiles) {
        try {
          await storage.delete({ bucket: CERTIFICATES_BUCKET, path: filePath });
        } catch {
          // Ignore
        }
      }
    }

    // Final baseline verification
    const finalCertCount = await prisma.certificate.count();
    const finalAuditCount = await prisma.auditLog.count();
    console.log(`Final DB Baseline -> Certificates: ${finalCertCount}, AuditLogs: ${finalAuditCount}`);

    record("28. Final Certificate count returned exactly to baseline (0)", finalCertCount === initialCertCount, `Expected ${initialCertCount}, got ${finalCertCount}`);
    record("29. Final AuditLog count preserved without artifact leakage (148)", finalAuditCount === initialAuditCount, `Expected ${initialAuditCount}, got ${finalAuditCount}`);
  }

  console.log("\n==========================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error("Test failed fatal:", err);
    process.exit(1);
  });

