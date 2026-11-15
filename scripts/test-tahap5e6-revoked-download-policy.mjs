// scripts/test-tahap5e6-revoked-download-policy.mjs
// Dedicated test suite for Tahap 5E.6: Revoked Certificate Download Access Policy

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
  console.log("========================================================");
  console.log("TAHAP 5E.6: REVOKED CERTIFICATE DOWNLOAD ACCESS POLICY");
  console.log("========================================================\n");

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
    // 1. Authenticate Staff Roles
    console.log("\n--- SECTION 1: AUTHENTICATING ROLES ---");
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || "muhamadrivqi83@gmail.com";
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "rivqi240205";
    const adminCookies = await login(superAdminEmail, superAdminPassword);
    record("1. Authenticate Admin/SuperAdmin session", !!adminCookies, "Failed to login as Super Admin");

    const mgmtRole = await prisma.role.findUnique({ where: { name: "MANAGEMENT" } });
    if (!mgmtRole) throw new Error("Role MANAGEMENT not found in database");
    const tempMgmtEmail = `test.mgmt.5e6.${timestamp}@ghs.test`;
    const tempMgmtUser = await prisma.user.create({
      data: {
        email: tempMgmtEmail,
        name: `Test Management 5E6 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: mgmtRole.id,
      },
    });
    cleanup.users.push(tempMgmtUser.id);
    const mgmtCookies = await login(tempMgmtEmail, defaultPassword);
    record("2. Authenticate Management session", !!mgmtCookies, "Failed to login as Management");

    const instructorRole = await prisma.role.findUnique({ where: { name: "INSTRUCTOR" } });
    if (!instructorRole) throw new Error("Role INSTRUCTOR not found in database");
    const tempInstructorEmail = `test.instructor.5e6.${timestamp}@ghs.test`;
    const tempInstructorUser = await prisma.user.create({
      data: {
        email: tempInstructorEmail,
        name: `Test Instructor 5E6 ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: instructorRole.id,
      },
    });
    cleanup.users.push(tempInstructorUser.id);
    const instructorCookies = await login(tempInstructorEmail, defaultPassword);
    record("2b. Authenticate Instructor session (staff without certificate:read)", !!instructorCookies, "Failed to login as Instructor");

    // 2. Setup Student 1 (Certificate recipient)
    const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });
    if (!studentRole) throw new Error("Role STUDENT not found in database");

    const tempStudent1Email = `student1.5e6.${timestamp}@ghs.test`;
    const userStudent1 = await prisma.user.create({
      data: {
        email: tempStudent1Email,
        name: `Student 5E6 Recipient ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: studentRole.id,
      },
    });
    cleanup.users.push(userStudent1.id);

    const student1 = await prisma.student.create({
      data: {
        userId: userStudent1.id,
        nim: `NIM-5E6-A-${timestamp.toString().slice(-6)}`,
        name: `Student 5E6 Recipient ${timestamp}`,
      },
    });
    cleanup.students.push(student1.id);
    const student1Cookies = await login(tempStudent1Email, defaultPassword);
    record("3. Authenticate Student 1 (Recipient) session", !!student1Cookies, "Failed to login as Student 1");

    // 3. Setup Student 2 (Unauthorized bystander)
    const tempStudent2Email = `student2.5e6.${timestamp}@ghs.test`;
    const userStudent2 = await prisma.user.create({
      data: {
        email: tempStudent2Email,
        name: `Student 5E6 Bystander ${timestamp}`,
        passwordHash: tempPasswordHash,
        roleId: studentRole.id,
      },
    });
    cleanup.users.push(userStudent2.id);

    const student2 = await prisma.student.create({
      data: {
        userId: userStudent2.id,
        nim: `NIM-5E6-B-${timestamp.toString().slice(-6)}`,
        name: `Student 5E6 Bystander ${timestamp}`,
      },
    });
    cleanup.students.push(student2.id);
    const student2Cookies = await login(tempStudent2Email, defaultPassword);
    record("4. Authenticate Student 2 (Bystander) session", !!student2Cookies, "Failed to login as Student 2");

    // 4. Fetch valid active Program and Batch
    const program = await prisma.program.findFirst({
      where: { deletedAt: null, batches: { some: { deletedAt: null } } },
      include: { batches: { where: { deletedAt: null } } },
    });
    const batch = program?.batches?.[0];
    if (!program || !batch) {
      throw new Error("Missing active program or batch in test environment");
    }

    // 5. Create official Enrollment with status COMPLETED for student 1
    const enrollment1 = await prisma.enrollment.create({
      data: {
        studentId: student1.id,
        batchId: batch.id,
        status: "COMPLETED",
      },
    });
    cleanup.enrollments.push(enrollment1.id);

    // 6. Upload test PDF to Supabase CERTIFICATES_BUCKET
    const storagePath = `certificates/test-5e6-${timestamp}.pdf`;
    const dummyPdfContent = Buffer.from("%PDF-1.4 5E6 Test Certificate Content");
    const storage = getStorageProvider();
    await storage.upload({
      bucket: CERTIFICATES_BUCKET,
      path: storagePath,
      file: dummyPdfContent,
      contentType: "application/pdf",
    });
    cleanup.storageFiles.push(storagePath);
    console.log(`✓ Provisioned test file in storage: ${storagePath}`);

    // 7. Issue Certificate as ACTIVE
    console.log("\n--- SECTION 2: CERTIFICATE ISSUANCE ---");
    const certNumber = `GHS/5E6/TEST/${timestamp}`;
    const issueRes = await api("POST", "/api/certificates", adminCookies, {
      studentId: student1.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: certNumber,
      issuedAt: new Date().toISOString(),
      path: storagePath,
    });
    record("5. Admin successfully issues certificate (201 Created)", issueRes.status === 201, `Status: ${issueRes.status}`);
    const certId = issueRes.data?.data?.id;
    if (certId) cleanup.certificates.push(certId);

    // Track AuditLog created
    const issueAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certId, action: "CREATE" },
    });
    if (issueAudit) cleanup.auditLogs.push(issueAudit.id);
    record("5b. Issuance creates CREATE AuditLog", !!issueAudit, "AuditLog CREATE not found");

    // 8. Test ACTIVE Certificate Download
    console.log("\n--- SECTION 3: ACTIVE CERTIFICATE DOWNLOAD ---");
    const unauthActiveDl = await api("GET", `/api/certificates/${certId}/download`);
    record("6. Unauthenticated download rejected (401 Unauthorized)", unauthActiveDl.status === 401, `Status: ${unauthActiveDl.status}`);

    const otherStudentActiveDl = await api("GET", `/api/certificates/${certId}/download`, student2Cookies);
    record("7. Other student download rejected (403 Forbidden)", otherStudentActiveDl.status === 403, `Status: ${otherStudentActiveDl.status}`);

    const instructorActiveDl = await api("GET", `/api/certificates/${certId}/download`, instructorCookies);
    record("7b. Staff without permission (Instructor) download rejected on ACTIVE cert (403 Forbidden)", instructorActiveDl.status === 403, `Status: ${instructorActiveDl.status}`);
    record("7c. Staff without permission active response does NOT contain signedUrl", instructorActiveDl.data?.data?.signedUrl === undefined, `signedUrl: ${instructorActiveDl.data?.data?.signedUrl}`);

    const ownerActiveDl = await api("GET", `/api/certificates/${certId}/download`, student1Cookies);
    record("8. Owner student can download ACTIVE certificate (200 OK)", ownerActiveDl.status === 200, `Status: ${ownerActiveDl.status}`);
    record("8b. Owner active download returns signedUrl", !!ownerActiveDl.data?.data?.signedUrl, "Missing signedUrl");
    record("8c. Owner active download returns status ACTIVE", ownerActiveDl.data?.data?.status === "ACTIVE", `Status: ${ownerActiveDl.data?.data?.status}`);

    const staffActiveDl = await api("GET", `/api/certificates/${certId}/download`, adminCookies);
    record("9. Staff can download ACTIVE certificate (200 OK)", staffActiveDl.status === 200, `Status: ${staffActiveDl.status}`);
    record("9b. Staff active download returns signedUrl", !!staffActiveDl.data?.data?.signedUrl, "Missing signedUrl");

    // 9. Revoke Certificate
    console.log("\n--- SECTION 4: CERTIFICATE REVOCATION ---");
    const revokeRes = await api("PATCH", `/api/certificates/${certId}/revoke`, adminCookies, {
      reason: "5E6 Revocation Policy Test",
    });
    record("10. Admin revokes certificate (200 OK)", revokeRes.status === 200, `Status: ${revokeRes.status}`);
    record("10b. Revoke returns status REVOKED", revokeRes.data?.data?.status === "REVOKED", `Status: ${revokeRes.data?.data?.status}`);

    const revokeAudit = await prisma.auditLog.findFirst({
      where: { entity: "Certificate", entityId: certId, action: "REVOKE" },
    });
    if (revokeAudit) cleanup.auditLogs.push(revokeAudit.id);
    record("10c. Revocation creates REVOKE AuditLog", !!revokeAudit, "AuditLog REVOKE not found");

    // 10. Test REVOKED Certificate Download Policy
    console.log("\n--- SECTION 5: REVOKED CERTIFICATE DOWNLOAD ACCESS POLICY ---");
    // 10.1 Student owner access to REVOKED cert
    const studentRevokedDl = await api("GET", `/api/certificates/${certId}/download`, student1Cookies);
    record("11. Student owner download on REVOKED certificate is blocked (403 Forbidden)", studentRevokedDl.status === 403, `Status: ${studentRevokedDl.status}`);
    record("11b. Student blocked response does NOT contain signedUrl", studentRevokedDl.data?.data?.signedUrl === undefined, `signedUrl: ${studentRevokedDl.data?.data?.signedUrl}`);
    record("11c. Student blocked response provides clear explanation",
      typeof studentRevokedDl.data?.error === "string" && studentRevokedDl.data.error.toLowerCase().includes("revoked"),
      `Error msg: ${studentRevokedDl.data?.error}`);

    // 10.2 Other student access to REVOKED cert
    const bystanderRevokedDl = await api("GET", `/api/certificates/${certId}/download`, student2Cookies);
    record("12. Other student download on REVOKED certificate is blocked (403 Forbidden)", bystanderRevokedDl.status === 403, `Status: ${bystanderRevokedDl.status}`);
    record("12b. Other student response does NOT contain signedUrl", bystanderRevokedDl.data?.data?.signedUrl === undefined, `signedUrl: ${bystanderRevokedDl.data?.data?.signedUrl}`);

    // 10.3 Unauthenticated access to REVOKED cert
    const unauthRevokedDl = await api("GET", `/api/certificates/${certId}/download`);
    record("13. Unauthenticated download on REVOKED certificate rejected (401 Unauthorized)", unauthRevokedDl.status === 401, `Status: ${unauthRevokedDl.status}`);

    // 10.3b Staff without permission (Instructor) access to REVOKED cert
    const instructorRevokedDl = await api("GET", `/api/certificates/${certId}/download`, instructorCookies);
    record("13b. Staff without permission (Instructor) download rejected on REVOKED cert (403 Forbidden)", instructorRevokedDl.status === 403, `Status: ${instructorRevokedDl.status}`);
    record("13c. Staff without permission revoked response does NOT contain signedUrl", instructorRevokedDl.data?.data?.signedUrl === undefined, `signedUrl: ${instructorRevokedDl.data?.data?.signedUrl}`);

    // 10.4 Authorized Staff (Admin) can download archive of REVOKED certificate
    const adminRevokedDl = await api("GET", `/api/certificates/${certId}/download`, adminCookies);
    record("14. Admin can download archived REVOKED certificate (200 OK)", adminRevokedDl.status === 200, `Status: ${adminRevokedDl.status}`);
    record("14b. Admin download preserves explicit status REVOKED", adminRevokedDl.data?.data?.status === "REVOKED", `Status: ${adminRevokedDl.data?.data?.status}`);
    record("14c. Admin download returns valid signedUrl", !!adminRevokedDl.data?.data?.signedUrl, "Missing signedUrl");

    // 10.5 Authorized Staff (Management) can download archive of REVOKED certificate
    const mgmtRevokedDl = await api("GET", `/api/certificates/${certId}/download`, mgmtCookies);
    record("15. Management can download archived REVOKED certificate (200 OK)", mgmtRevokedDl.status === 200, `Status: ${mgmtRevokedDl.status}`);
    record("15b. Management download preserves explicit status REVOKED", mgmtRevokedDl.data?.data?.status === "REVOKED", `Status: ${mgmtRevokedDl.data?.data?.status}`);
    record("15c. Management download returns valid signedUrl", !!mgmtRevokedDl.data?.data?.signedUrl, "Missing signedUrl");

    // 11. Soft-deleted certificate security check
    console.log("\n--- SECTION 6: SOFT-DELETED CERTIFICATE DOWNLOAD SECURITY ---");
    // Soft-delete the certificate directly in DB
    await prisma.certificate.update({
      where: { id: certId },
      data: { deletedAt: new Date() },
    });

    const staffDlAfterSoftDelete = await api("GET", `/api/certificates/${certId}/download`, adminCookies);
    record("16. Staff download of soft-deleted certificate returns 404 Not Found", staffDlAfterSoftDelete.status === 404, `Status: ${staffDlAfterSoftDelete.status}`);

    const studentDlAfterSoftDelete = await api("GET", `/api/certificates/${certId}/download`, student1Cookies);
    record("17. Student download of soft-deleted certificate returns 404 Not Found", studentDlAfterSoftDelete.status === 404, `Status: ${studentDlAfterSoftDelete.status}`);

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    failed++;
  } finally {
    console.log("\n--- SECTION 7: CLEANUP & BASELINE RESTORATION ---");
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

    // Clean up storage files
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

    record("18. Final Certificate count returned exactly to baseline (0)", finalCertCount === initialCertCount, `Expected ${initialCertCount}, got ${finalCertCount}`);
    record("19. Final AuditLog count preserved without artifact leakage (148)", finalAuditCount === initialAuditCount, `Expected ${initialAuditCount}, got ${finalAuditCount}`);
  }

  console.log("\n========================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("========================================================");

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
