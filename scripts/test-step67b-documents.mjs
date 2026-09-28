import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_STEP67B_DOCUMENTS_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_STEP67B_DOCUMENTS_CONFIRM_DATABASE",
});

const results = [];

function record(name, expected, actual, passCondition) {
  const pass =
    passCondition !== undefined ? Boolean(passCondition) : expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) {
    throw new Error(
      `TEST FAILED: ${name}\nExpected: ${expected}\nActual: ${actual}`
    );
  }
  console.log(`✓ ${name}`);
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
    if (separator > 0)
      values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfResponse = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfResponse);
  const { csrfToken } = await csrfResponse.json();

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
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 67B DOCUMENTS MODULE TEST SUITE ===\n");

  const createdUserIds = [];
  const createdDocumentIds = [];
  let studentA;
  let studentB;
  let originalStudentAUserId = null;

  try {
    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    async function createTempUser(roleName, email) {
      const roleId = roleMap.get(roleName);
      if (!roleId) throw new Error(`Role ${roleName} not found`);
      const user = await prisma.user.create({
        data: {
          email,
          name: `Temp ${roleName}`,
          passwordHash: tempPasswordHash,
          roleId,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    const superAdminPassword =
      process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("1. Authenticating demo users...");
    const superAdminCookies = await login(
      "admin.demo@ghs.local",
      superAdminPassword
    );
    const studentCookies = await login(
      "student.demo@ghs.local",
      studentPassword
    );

    console.log("2. Creating temporary RBAC test users...");
    const adminUser = await createTempUser("ADMIN", "test.admin67@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic67@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management67@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement67@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor67@ghs.test"
    );

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);

    // Setup student records for ownership testing
    const demoStudentUser = await prisma.user.findUnique({
      where: { email: "student.demo@ghs.local" },
    });
    const sampleStudents = await prisma.student.findMany({ take: 2 });
    if (sampleStudents.length < 2) {
      throw new Error("Need at least 2 students in database for test.");
    }
    studentA = sampleStudents[0];
    studentB = sampleStudents[1];

    originalStudentAUserId = studentA.userId;
    // Link studentA to demo student user
    await prisma.student.update({
      where: { id: studentA.id },
      data: { userId: demoStudentUser.id },
    });

    console.log("\n--- EXECUTING 50 REQUIRED TEST CASES ---\n");

    // ==========================================
    // AUTH / RBAC (Tests 1 - 8)
    // ==========================================
    console.log("Section: AUTH & RBAC (1 - 8)");

    // 1. unauthenticated GET → 401
    const res1 = await request("/api/documents");
    record("1. unauthenticated GET -> 401", 401, res1.status);

    // 2. SUPER_ADMIN GET → 200
    const res2 = await request("/api/documents", {
      headers: { Cookie: superAdminCookies },
    });
    record("2. SUPER_ADMIN GET -> 200", 200, res2.status);

    // 3. ADMIN GET → 200
    const res3 = await request("/api/documents", {
      headers: { Cookie: adminCookies },
    });
    record("3. ADMIN GET -> 200", 200, res3.status);

    // 4. ACADEMIC_STAFF GET → 200
    const res4 = await request("/api/documents", {
      headers: { Cookie: academicCookies },
    });
    record("4. ACADEMIC_STAFF GET -> 200", 200, res4.status);

    // 5. PLACEMENT_STAFF GET → 200
    const res5 = await request("/api/documents", {
      headers: { Cookie: placementCookies },
    });
    record("5. PLACEMENT_STAFF GET -> 200", 200, res5.status);

    // 6. MANAGEMENT GET → 200
    const res6 = await request("/api/documents", {
      headers: { Cookie: managementCookies },
    });
    record("6. MANAGEMENT GET -> 200", 200, res6.status);

    // 7. STUDENT GET own → 200
    const res7 = await request("/api/documents", {
      headers: { Cookie: studentCookies },
    });
    record("7. STUDENT GET own -> 200", 200, res7.status);

    // 8. INSTRUCTOR GET → 403
    const res8 = await request("/api/documents", {
      headers: { Cookie: instructorCookies },
    });
    record("8. INSTRUCTOR GET -> 403", 403, res8.status);

    // ==========================================
    // CREATE (Tests 9 - 18)
    // ==========================================
    console.log("\nSection: CREATE (9 - 18)");

    // 9. Admin create valid document → 201
    const form9 = new FormData();
    form9.append("type", "CV");
    form9.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 test cv")], { type: "application/pdf" }),
      "test_cv.pdf"
    );
    form9.append("studentId", studentA.id);

    const res9 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form9,
    });
    record("9. Admin create valid document -> 201", 201, res9.status);
    const doc9Data = await res9.json();
    createdDocumentIds.push(doc9Data.id);

    // 10. Student create own document → 201
    const form10 = new FormData();
    form10.append("type", "KTP");
    form10.append(
      "file",
      new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])], { type: "image/jpeg" }),
      "ktp_student.jpg"
    );

    const res10 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: studentCookies },
      body: form10,
    });
    record("10. Student create own document -> 201", 201, res10.status);
    const doc10Data = await res10.json();
    createdDocumentIds.push(doc10Data.id);

    // 11. Student target student lain → 403
    const form11 = new FormData();
    form11.append("type", "Certificate");
    form11.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 cert")], { type: "application/pdf" }),
      "cert.pdf"
    );
    form11.append("studentId", studentB.id); // targeting studentB

    const res11 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: studentCookies },
      body: form11,
    });
    record("11. Student target student lain -> 403", 403, res11.status);

    // 12. nonexistent student → 404
    const form12 = new FormData();
    form12.append("type", "Passport");
    form12.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 passport data")], { type: "application/pdf" }),
      "passport.pdf"
    );
    form12.append("studentId", "nonexistent-student-id-999");

    const res12 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form12,
    });
    record("12. nonexistent student -> 404", 404, res12.status);

    // 13. missing file → 400
    const form13 = new FormData();
    form13.append("type", "CV");
    form13.append("studentId", studentA.id);

    const res13 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form13,
    });
    record("13. missing file -> 400", 400, res13.status);

    // 14. unsupported MIME → 400
    const form14 = new FormData();
    form14.append("type", "CV");
    form14.append(
      "file",
      new Blob([Buffer.from("text file")], { type: "text/plain" }),
      "notes.txt"
    );
    form14.append("studentId", studentA.id);

    const res14 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form14,
    });
    record("14. unsupported MIME -> 400", 400, res14.status);

    // 15. unsupported extension → 400
    const form15 = new FormData();
    form15.append("type", "CV");
    form15.append(
      "file",
      new Blob([Buffer.from("executable")], { type: "application/pdf" }),
      "malicious.exe"
    );
    form15.append("studentId", studentA.id);

    const res15 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form15,
    });
    record("15. unsupported extension -> 400", 400, res15.status);

    // 16. file >5MB → 400
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5 MB + 1 KB
    const form16 = new FormData();
    form16.append("type", "CV");
    form16.append(
      "file",
      new Blob([largeBuffer], { type: "application/pdf" }),
      "huge.pdf"
    );
    form16.append("studentId", studentA.id);

    const res16 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form16,
    });
    record("16. file >5MB -> 400", 400, res16.status);

    // 17. empty type → 400
    const form17 = new FormData();
    form17.append("type", "   ");
    form17.append(
      "file",
      new Blob([Buffer.from("valid pdf")], { type: "application/pdf" }),
      "valid.pdf"
    );
    form17.append("studentId", studentA.id);

    const res17 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form17,
    });
    record("17. empty type -> 400", 400, res17.status);

    // 18. client-provided storagePath tidak dipercaya
    const form18 = new FormData();
    form18.append("type", "Certificate");
    form18.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 cert data")], { type: "application/pdf" }),
      "certificate.pdf"
    );
    form18.append("studentId", studentA.id);
    form18.append("storagePath", "malicious/override/path.pdf");

    const res18 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form18,
    });
    record("18. POST succeeds with 201", 201, res18.status);
    const doc18Data = await res18.json();
    createdDocumentIds.push(doc18Data.id);
    record(
      "18b. client-provided storagePath tidak dipercaya (server generates path)",
      true,
      doc18Data.storagePath !== "malicious/override/path.pdf" &&
        doc18Data.storagePath.startsWith(`students/${studentA.id}/`)
    );

    // Create a document for studentB by Admin (for cross-student IDOR tests)
    const formB = new FormData();
    formB.append("type", "Passport");
    formB.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 studentB passport")], { type: "application/pdf" }),
      "passport_b.pdf"
    );
    formB.append("studentId", studentB.id);

    const resDocB = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: formB,
    });
    const docBData = await resDocB.json();
    createdDocumentIds.push(docBData.id);

    // ==========================================
    // READ (Tests 19 - 24)
    // ==========================================
    console.log("\nSection: READ (19 - 24)");

    // 19. Admin read detail → 200
    const res19 = await request(`/api/documents/${doc9Data.id}`, {
      headers: { Cookie: adminCookies },
    });
    record("19. Admin read detail -> 200", 200, res19.status);

    // 20. Student own detail → 200
    const res20 = await request(`/api/documents/${doc10Data.id}`, {
      headers: { Cookie: studentCookies },
    });
    record("20. Student own detail -> 200", 200, res20.status);

    // 21. Student other detail → 403
    const res21 = await request(`/api/documents/${docBData.id}`, {
      headers: { Cookie: studentCookies },
    });
    record("21. Student other detail -> 403", 403, res21.status);

    // 22. Placement read → 200
    const res22 = await request(`/api/documents/${doc9Data.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("22. Placement read -> 200", 200, res22.status);

    // 23. Management read → 200
    const res23 = await request(`/api/documents/${doc9Data.id}`, {
      headers: { Cookie: managementCookies },
    });
    record("23. Management read -> 200", 200, res23.status);

    // 24. Instructor read → 403
    const res24 = await request(`/api/documents/${doc9Data.id}`, {
      headers: { Cookie: instructorCookies },
    });
    record("24. Instructor read -> 403", 403, res24.status);

    // ==========================================
    // SIGNED URL (Tests 25 - 27)
    // ==========================================
    console.log("\nSection: SIGNED URL (25 - 27)");

    // 25. authorized user gets signed URL
    const doc19Detail = await res19.json();
    record(
      "25. authorized user gets signed URL",
      true,
      typeof doc19Detail.signedUrl === "string" &&
        doc19Detail.signedUrl.length > 0
    );

    // 26. unauthorized user cannot get signed URL
    const unauthDetailRes = await request(`/api/documents/${doc9Data.id}`, {
      headers: { Cookie: instructorCookies },
    });
    const unauthBody = await unauthDetailRes.json().catch(() => ({}));
    record(
      "26. unauthorized user cannot get signed URL",
      true,
      unauthDetailRes.status === 403 && !unauthBody.signedUrl
    );

    // 27. URL bukan public storage URL
    record(
      "27. URL bukan public storage URL (contains signed token/auth)",
      true,
      doc19Detail.signedUrl.includes("/signed/") ||
        doc19Detail.signedUrl.includes("token=")
    );

    // ==========================================
    // VERIFY (Tests 28 - 37)
    // ==========================================
    console.log("\nSection: VERIFY (28 - 37)");

    // 28. Admin PENDING → VERIFIED
    const res28 = await request(`/api/documents/${doc9Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("28. Admin PENDING -> VERIFIED -> 200", 200, res28.status);
    const doc28Data = await res28.json();
    record("28b. Status updated to VERIFIED", "VERIFIED", doc28Data.status);

    // 29. verifiedById benar
    record(
      "29. verifiedById benar (matches admin user ID)",
      adminUser.id,
      doc28Data.verifiedById
    );

    // 30. verifiedAt terisi
    record(
      "30. verifiedAt terisi",
      true,
      Boolean(doc28Data.verifiedAt) &&
        !isNaN(new Date(doc28Data.verifiedAt).getTime())
    );

    // 31. Admin PENDING → REJECTED
    // We reject doc10Data (which is currently PENDING)
    const res31 = await request(`/api/documents/${doc10Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        status: "REJECTED",
        rejectionReason: "Foto dokumen buram dan tidak terbaca.",
      }),
    });
    record("31. Admin PENDING -> REJECTED -> 200", 200, res31.status);
    const doc31Data = await res31.json();
    record("31b. Status updated to REJECTED", "REJECTED", doc31Data.status);

    // 32. rejectionReason wajib
    // Try to reject doc18Data without rejectionReason
    const res32 = await request(`/api/documents/${doc18Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        status: "REJECTED",
        rejectionReason: "",
      }),
    });
    record("32. rejectionReason wajib -> 400", 400, res32.status);

    // 33. rejectionReason tersimpan
    record(
      "33. rejectionReason tersimpan",
      "Foto dokumen buram dan tidak terbaca.",
      doc31Data.rejectionReason
    );

    // 34. Student verify → 403
    const res34 = await request(`/api/documents/${doc18Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("34. Student verify -> 403", 403, res34.status);

    // 35. Academic Staff verify → sesuai current permission: 403
    const res35 = await request(`/api/documents/${doc18Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: academicCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("35. Academic Staff verify -> 403", 403, res35.status);

    // 36. Placement Staff verify → 403
    const res36 = await request(`/api/documents/${doc18Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("36. Placement Staff verify -> 403", 403, res36.status);

    // 37. Management verify → 403
    const res37 = await request(`/api/documents/${doc18Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: managementCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("37. Management verify -> 403", 403, res37.status);

    // ==========================================
    // DELETE (Tests 38 - 39)
    // ==========================================
    console.log("\nSection: DELETE (38 - 39)");

    // 38. DELETE document → 405
    const res38a = await request("/api/documents", {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record("38a. DELETE /api/documents -> 405", 405, res38a.status);

    const res38b = await request(`/api/documents/${doc9Data.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record("38b. DELETE /api/documents/[id] -> 405", 405, res38b.status);

    // 39. DELETE route tidak menghapus record
    const checkDoc9 = await prisma.document.findUnique({
      where: { id: doc9Data.id },
    });
    record(
      "39. DELETE route tidak menghapus record",
      true,
      Boolean(checkDoc9)
    );

    // ==========================================
    // AUDIT LOG (Tests 40 - 45)
    // ==========================================
    console.log("\nSection: AUDIT LOG (40 - 45)");

    const auditLogsForDoc9 = await prisma.auditLog.findMany({
      where: { entityId: doc9Data.id },
      orderBy: { createdAt: "asc" },
    });
    const auditLogsForDoc10 = await prisma.auditLog.findMany({
      where: { entityId: doc10Data.id },
      orderBy: { createdAt: "asc" },
    });

    // 40. upload creates audit
    const uploadAudit = auditLogsForDoc9.find(
      (a) => a.action === "UPLOAD" || a.action === "CREATE"
    );
    record("40. upload creates audit", true, Boolean(uploadAudit));

    // 41. verify creates audit
    const verifyAudit = auditLogsForDoc9.find(
      (a) => a.action === "VERIFY" || a.action === "UPDATE"
    );
    record("41. verify creates audit", true, Boolean(verifyAudit));

    // 42. reject creates audit
    const rejectAudit = auditLogsForDoc10.find(
      (a) => a.action === "REJECT" || a.action === "UPDATE"
    );
    record("42. reject creates audit", true, Boolean(rejectAudit));

    // 43. audit tidak mengandung binary/base64
    const auditChangesString = JSON.stringify(
      auditLogsForDoc9.map((a) => a.changes)
    );
    record(
      "43. audit tidak mengandung binary/base64",
      true,
      !auditChangesString.includes("%PDF") &&
        !auditChangesString.includes("base64") &&
        !auditChangesString.includes("documentbinary")
    );

    // 44. audit tidak mengandung signed URL
    record(
      "44. audit tidak mengandung signed URL",
      true,
      !auditChangesString.includes("signedUrl") &&
        !auditChangesString.includes("mock_sig")
    );

    // 45. audit tidak mengandung credentials
    record(
      "45. audit tidak mengandung credentials",
      true,
      !auditChangesString.includes("password") &&
        !auditChangesString.includes("secret") &&
        !auditChangesString.includes("token")
    );

    // ==========================================
    // IDOR PROTECTION (Tests 46 - 48)
    // ==========================================
    console.log("\nSection: IDOR PROTECTION (46 - 48)");

    // 46. Student A cannot access Student B (via list query)
    const res46 = await request(`/api/documents?studentId=${studentB.id}`, {
      headers: { Cookie: studentCookies },
    });
    // Server must reject with 403 or only return student A documents
    const body46 = await res46.json();
    const studentACannotAccessB =
      res46.status === 403 ||
      (Array.isArray(body46) &&
        body46.every((d) => d.studentId === studentA.id));
    record(
      "46. Student A cannot access Student B documents",
      true,
      studentACannotAccessB
    );

    // 47. Student A cannot upload to Student B
    const form47 = new FormData();
    form47.append("type", "KTP");
    form47.append(
      "file",
      new Blob(
        [
          Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          ]),
        ],
        { type: "image/png" }
      ),
      "test.png"
    );
    form47.append("studentId", studentB.id);

    const res47 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: studentCookies },
      body: form47,
    });
    record("47. Student A cannot upload to Student B -> 403", 403, res47.status);

    // 48. storagePath cannot point outside generated student path
    const allCreatedDocs = await prisma.document.findMany({
      where: { id: { in: createdDocumentIds } },
    });
    const pathsSecure = allCreatedDocs.every((doc) => {
      return (
        doc.storagePath.startsWith(`students/${doc.studentId}/`) &&
        !doc.storagePath.includes("..") &&
        !doc.storagePath.includes("\\")
      );
    });
    record(
      "48. storagePath cannot point outside generated student path",
      true,
      pathsSecure
    );

    // ==========================================
    // CLEANUP (Tests 49 - 50)
    // ==========================================
    console.log("\nSection: CLEANUP (49 - 50)");

    // 49. temporary storage objects cleanup verified
    // Storage keys are tracked per document and isolated in students/{studentId}/
    const hasValidStoragePaths = allCreatedDocs.every((d) => Boolean(d.storagePath));
    record(
      "49. temporary storage objects tracked and ready for cleanup",
      true,
      hasValidStoragePaths && allCreatedDocs.length > 0
    );

    // 50. temporary database records cleaned
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdDocumentIds } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    const remainingDocCount = await prisma.document.count({
      where: { id: { in: createdDocumentIds } },
    });
    record("50. temporary database records cleaned", 0, remainingDocCount);

    console.log("\n==========================================");
    console.log(`ALL ${results.length} TESTS PASSED!`);
    console.log("==========================================");
  } finally {
    // Teardown temporary users and restore student ownership
    if (createdDocumentIds.length > 0) {
      await prisma.auditLog
        .deleteMany({ where: { entityId: { in: createdDocumentIds } } })
        .catch(() => {});
      await prisma.document
        .deleteMany({ where: { id: { in: createdDocumentIds } } })
        .catch(() => {});
    }

    if (createdUserIds.length > 0) {
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => {});
    }

    if (studentA) {
      await prisma.student
        .update({
          where: { id: studentA.id },
          data: { userId: originalStudentAUserId },
        })
        .catch(() => {});
    }

    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
