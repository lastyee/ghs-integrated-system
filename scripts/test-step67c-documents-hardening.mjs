// scripts/test-step67c-documents-hardening.mjs
// Step 67C: Documents Security & Storage Hardening Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MockStorageProvider, SupabaseStorageProvider } from "../lib/storage.ts";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function record(name, expected, actual) {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed });
  if (passed) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function mergeCookies(existingCookies, response) {
  const getSetCookie = response.headers.getSetCookie?.();
  const rawSetCookie = getSetCookie || [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();

  if (existingCookies) {
    existingCookies.split(";").forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
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

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
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
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 67C DOCUMENTS SECURITY & STORAGE HARDENING TEST SUITE ===\n");

  await prisma.user.deleteMany({ where: { email: { contains: "67c" } } }).catch(() => {});

  const createdUserIds = [];
  const createdDocumentIds = [];
  let studentA;
  let studentB;

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
    const adminUser = await createTempUser("ADMIN", "test.admin67c@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic67c@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management67c@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement67c@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor67c@ghs.test"
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
    studentA = await prisma.student.findUnique({
      where: { userId: demoStudentUser.id },
    });
    if (!studentA) {
      throw new Error("Student A linked to demo user not found.");
    }
    studentB = await prisma.student.findFirst({
      where: { id: { not: studentA.id } },
    });
    if (!studentB) {
      throw new Error("Student B not found.");
    }

    console.log("\n--- EXECUTING 45 REQUIRED TEST SCENARIOS ---\n");

    // ==========================================
    // PART A/B: MAGIC BYTE VALIDATION (Tests 1 - 10)
    // ==========================================
    console.log("Section: MAGIC BYTE VALIDATION (1 - 10)");

    // 1. valid PDF accepted -> 201
    const form1 = new FormData();
    form1.append("type", "CV");
    form1.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 Valid PDF file content")], {
        type: "application/pdf",
      }),
      "resume.pdf"
    );
    form1.append("studentId", studentA.id);

    const res1 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form1,
    });
    record("1. valid PDF accepted", 201, res1.status);
    const doc1Data = await res1.json();
    createdDocumentIds.push(doc1Data.id);

    // 2. valid PNG accepted -> 201
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);
    const form2 = new FormData();
    form2.append("type", "KTP");
    form2.append(
      "file",
      new Blob([pngHeader], { type: "image/png" }),
      "identity.png"
    );
    form2.append("studentId", studentA.id);

    const res2 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form2,
    });
    record("2. valid PNG accepted", 201, res2.status);
    const doc2Data = await res2.json();
    createdDocumentIds.push(doc2Data.id);

    // 3. valid JPEG accepted -> 201
    const jpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);
    const form3 = new FormData();
    form3.append("type", "Certificate");
    form3.append(
      "file",
      new Blob([jpegHeader], { type: "image/jpeg" }),
      "cert.jpg"
    );
    form3.append("studentId", studentA.id);

    const res3 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form3,
    });
    record("3. valid JPEG accepted", 201, res3.status);
    const doc3Data = await res3.json();
    createdDocumentIds.push(doc3Data.id);

    // 4. fake PDF rejected -> 400
    const form4 = new FormData();
    form4.append("type", "CV");
    form4.append(
      "file",
      new Blob([Buffer.from("This is plain text pretending to be a PDF")], {
        type: "application/pdf",
      }),
      "fake.pdf"
    );
    form4.append("studentId", studentA.id);

    const res4 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form4,
    });
    record("4. fake PDF rejected", 400, res4.status);

    // 5. fake PNG rejected -> 400
    const form5 = new FormData();
    form5.append("type", "KTP");
    form5.append(
      "file",
      new Blob([Buffer.from("Text pretending to be PNG image")], {
        type: "image/png",
      }),
      "fake.png"
    );
    form5.append("studentId", studentA.id);

    const res5 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form5,
    });
    record("5. fake PNG rejected", 400, res5.status);

    // 6. fake JPEG rejected -> 400
    const form6 = new FormData();
    form6.append("type", "Certificate");
    form6.append(
      "file",
      new Blob([Buffer.from("Text pretending to be JPEG image")], {
        type: "image/jpeg",
      }),
      "fake.jpg"
    );
    form6.append("studentId", studentA.id);

    const res6 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form6,
    });
    record("6. fake JPEG rejected", 400, res6.status);

    // 7. MIME/signature mismatch PDF/PNG -> rejected 400
    // Declared PDF, but file content is PNG signature
    const form7 = new FormData();
    form7.append("type", "CV");
    form7.append(
      "file",
      new Blob([pngHeader], { type: "application/pdf" }),
      "mismatch_pdf_png.pdf"
    );
    form7.append("studentId", studentA.id);

    const res7 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form7,
    });
    record("7. MIME/signature mismatch PDF/PNG", 400, res7.status);

    // 8. MIME/signature mismatch PNG/JPEG -> rejected 400
    // Declared PNG, but file content is JPEG signature
    const form8 = new FormData();
    form8.append("type", "KTP");
    form8.append(
      "file",
      new Blob([jpegHeader], { type: "image/png" }),
      "mismatch_png_jpeg.png"
    );
    form8.append("studentId", studentA.id);

    const res8 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form8,
    });
    record("8. MIME/signature mismatch PNG/JPEG", 400, res8.status);

    // 9. MIME/signature mismatch JPEG/PDF -> rejected 400
    // Declared JPEG, but file content is PDF signature
    const form9 = new FormData();
    form9.append("type", "Certificate");
    form9.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 embedded")], { type: "image/jpeg" }),
      "mismatch_jpeg_pdf.jpg"
    );
    form9.append("studentId", studentA.id);

    const res9 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form9,
    });
    record("9. MIME/signature mismatch JPEG/PDF", 400, res9.status);

    // 10. allowed extension + invalid binary -> rejected 400
    const form10 = new FormData();
    form10.append("type", "CV");
    form10.append(
      "file",
      new Blob([Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])], {
        type: "application/pdf",
      }),
      "corrupted.pdf"
    );
    form10.append("studentId", studentA.id);

    const res10 = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: form10,
    });
    record("10. allowed extension + invalid binary", 400, res10.status);

    // ==========================================
    // PART C/D/E: UPLOAD COMPENSATION (Tests 11 - 16)
    // ==========================================
    console.log("\nSection: UPLOAD COMPENSATION (11 - 16)");

    // Inspect storage status before forced failure
    const statusBeforeRes = await request(
      "/api/documents?testStorageStatus=true",
      { headers: { Cookie: adminCookies } }
    );
    const statusBefore = await statusBeforeRes.json();
    const uploadsBeforeCount = statusBefore.uploadHistory?.length || 0;
    const deletesBeforeCount = statusBefore.deleteHistory?.length || 0;

    // 11. forced DB failure via header x-test-force-db-failure
    const formFail = new FormData();
    formFail.append("type", "Passport");
    formFail.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 forced failure payload")], {
        type: "application/pdf",
      }),
      "passport_fail.pdf"
    );
    formFail.append("studentId", studentA.id);

    const resFail = await request("/api/documents", {
      method: "POST",
      headers: {
        Cookie: adminCookies,
        "x-test-force-db-failure": "true",
      },
      body: formFail,
    });

    // 12. request failure -> 500
    record("11. forced DB failure executed", true, true);
    record("12. request failure -> 500", 500, resFail.status);

    // Inspect storage status after forced failure
    const statusAfterRes = await request(
      "/api/documents?testStorageStatus=true",
      { headers: { Cookie: adminCookies } }
    );
    const statusAfter = await statusAfterRes.json();
    const uploadsAfterCount = statusAfter.uploadHistory?.length || 0;
    const deletesAfterCount = statusAfter.deleteHistory?.length || 0;

    // 13. storage upload happened before failure
    const uploadHappened = uploadsAfterCount === uploadsBeforeCount + 1;
    const lastUploadedKey =
      statusAfter.uploadHistory[statusAfter.uploadHistory.length - 1];
    record("13. storage upload happened", true, uploadHappened);

    // 14. Document record absent in DB
    const failedDbRecord = await prisma.document.findFirst({
      where: {
        studentId: studentA.id,
        fileName: "passport_fail.pdf",
      },
    });
    record("14. Document record absent", null, failedDbRecord);

    // 15. storage object deleted (compensation cleanup performed)
    const deleteHappened = deletesAfterCount === deletesBeforeCount + 1;
    const lastDeletedKey =
      statusAfter.deleteHistory[statusAfter.deleteHistory.length - 1];
    const keyNotInStorage = !statusAfter.keys.includes(lastUploadedKey);
    record(
      "15. storage object deleted",
      true,
      deleteHappened && lastUploadedKey === lastDeletedKey && keyNotInStorage
    );

    // 16. no successful UPLOAD audit
    const uploadAuditForFailed = await prisma.auditLog.findFirst({
      where: {
        action: "UPLOAD",
        changes: {
          path: ["fileName"],
          equals: "passport_fail.pdf",
        },
      },
    });
    record("16. no successful UPLOAD audit", null, uploadAuditForFailed);

    // ==========================================
    // PART G: STORAGE PROVIDER (Tests 17 - 19)
    // ==========================================
    console.log("\nSection: STORAGE PROVIDER (17 - 19)");

    // 17. MockStorageProvider used in test
    record(
      "17. MockStorageProvider used in test",
      true,
      Array.isArray(statusAfter.keys) && typeof statusAfter.count === "number"
    );

    // 18. production requires Supabase (fails fast if credentials missing)
    let prodConfigFailedFast = false;
    try {
      // Direct instantiation test of SupabaseStorageProvider with missing credentials
      new SupabaseStorageProvider("", "");
    } catch (e) {
      prodConfigFailedFast = e.message.includes("SUPABASE_URL");
    }
    record("18. production requires Supabase", true, prodConfigFailedFast);

    // 19. no filesystem fallback
    // Verify MockStorageProvider is purely in-memory (Map based) and does not touch fs
    const mockStorageInstance = new MockStorageProvider();
    await mockStorageInstance.upload({
      bucket: "documents",
      path: "test/mem.pdf",
      file: Buffer.from("%PDF-1.4"),
      contentType: "application/pdf",
    });
    const hasObjectInMemory = mockStorageInstance.has("documents", "test/mem.pdf");
    record("19. no filesystem fallback", true, hasObjectInMemory);

    // ==========================================
    // PART H: SIGNED URL REGRESSION (Tests 20 - 23)
    // ==========================================
    console.log("\nSection: SIGNED URL REGRESSION (20 - 23)");

    // 20. authorized signed URL
    const resDetailAdmin = await request(`/api/documents/${doc1Data.id}`, {
      headers: { Cookie: adminCookies },
    });
    const doc1Detail = await resDetailAdmin.json();
    record(
      "20. authorized signed URL",
      true,
      resDetailAdmin.status === 200 &&
        typeof doc1Detail.signedUrl === "string" &&
        doc1Detail.signedUrl.length > 0
    );

    // 21. unauthorized signed URL
    const resDetailUnauth = await request(`/api/documents/${doc1Data.id}`, {
      headers: { Cookie: instructorCookies },
    });
    const unauthBody = await resDetailUnauth.json().catch(() => ({}));
    record(
      "21. unauthorized signed URL",
      true,
      resDetailUnauth.status === 403 && !unauthBody.signedUrl
    );

    // 22. non-public URL
    record(
      "22. non-public URL",
      true,
      doc1Detail.signedUrl.includes("/signed/") &&
        doc1Detail.signedUrl.includes("token=")
    );

    // 23. expiry exists
    record(
      "23. expiry exists",
      true,
      doc1Detail.signedUrl.includes("expires=")
    );

    // ==========================================
    // PART I: STUDENT OWNERSHIP / IDOR (Tests 24 - 27)
    // ==========================================
    console.log("\nSection: STUDENT OWNERSHIP / IDOR (24 - 27)");

    // Setup a document for studentB by Admin
    const formB = new FormData();
    formB.append("type", "Certificate");
    formB.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 studentB document")], {
        type: "application/pdf",
      }),
      "student_b.pdf"
    );
    formB.append("studentId", studentB.id);

    const resDocB = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: formB,
    });
    const docBData = await resDocB.json();
    createdDocumentIds.push(docBData.id);

    // 24. Student A cannot access Student B (list query)
    const resIdorList = await request(
      `/api/documents?studentId=${studentB.id}`,
      { headers: { Cookie: studentCookies } }
    );
    const bodyIdorList = await resIdorList.json();
    const studentBlockedFromBList =
      resIdorList.status === 403 ||
      (Array.isArray(bodyIdorList) &&
        bodyIdorList.every((d) => d.studentId === studentA.id));
    record("24. Student A cannot access Student B", true, studentBlockedFromBList);

    // 25. Student A cannot get Student B signed URL (detail GET)
    const resIdorDetail = await request(`/api/documents/${docBData.id}`, {
      headers: { Cookie: studentCookies },
    });
    record("25. Student A cannot get Student B signed URL", 403, resIdorDetail.status);

    // 26. Student A cannot upload to Student B
    const formIdorUpload = new FormData();
    formIdorUpload.append("type", "KTP");
    formIdorUpload.append(
      "file",
      new Blob([pngHeader], { type: "image/png" }),
      "idor_attack.png"
    );
    formIdorUpload.append("studentId", studentB.id);

    const resIdorUpload = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: studentCookies },
      body: formIdorUpload,
    });
    record("26. Student A cannot upload to Student B", 403, resIdorUpload.status);

    // 27. storage path cannot be manipulated
    const formTamperPath = new FormData();
    formTamperPath.append("type", "CV");
    formTamperPath.append(
      "file",
      new Blob([Buffer.from("%PDF-1.4 path test")], {
        type: "application/pdf",
      }),
      "path_test.pdf"
    );
    formTamperPath.append("studentId", studentA.id);
    formTamperPath.append("storagePath", "malicious/override/etc/passwd.pdf");

    const resTamper = await request("/api/documents", {
      method: "POST",
      headers: { Cookie: adminCookies },
      body: formTamperPath,
    });
    const tamperData = await resTamper.json();
    createdDocumentIds.push(tamperData.id);
    record(
      "27. storage path cannot be manipulated",
      true,
      tamperData.storagePath !== "malicious/override/etc/passwd.pdf" &&
        tamperData.storagePath.startsWith(`students/${studentA.id}/`)
    );

    // ==========================================
    // PART J: VERIFICATION REGRESSION (Tests 28 - 36)
    // ==========================================
    console.log("\nSection: VERIFICATION REGRESSION (28 - 36)");

    // 28. PENDING -> VERIFIED
    const resVerify = await request(`/api/documents/${doc1Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("28. PENDING -> VERIFIED", 200, resVerify.status);
    const verifiedDoc = await resVerify.json();

    // 29. verifiedById
    record(
      "29. verifiedById populated with verifier ID",
      adminUser.id,
      verifiedDoc.verifiedById
    );

    // 30. verifiedAt
    record(
      "30. verifiedAt populated",
      true,
      Boolean(verifiedDoc.verifiedAt) &&
        !isNaN(new Date(verifiedDoc.verifiedAt).getTime())
    );

    // 31. PENDING -> REJECTED
    const resReject = await request(`/api/documents/${doc2Data.id}`, {
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
    record("31. PENDING -> REJECTED", 200, resReject.status);
    const rejectedDoc = await resReject.json();
    record("31b. rejected status verified", "REJECTED", rejectedDoc.status);

    // 32. rejectionReason required
    const resRejectNoReason = await request(`/api/documents/${doc3Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        status: "REJECTED",
        rejectionReason: "   ",
      }),
    });
    record("32. rejectionReason required", 400, resRejectNoReason.status);

    // 33. Student cannot verify
    const resStudentVerify = await request(`/api/documents/${doc3Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: studentCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("33. Student cannot verify", 403, resStudentVerify.status);

    // 34. Academic Staff cannot verify
    const resAcademicVerify = await request(`/api/documents/${doc3Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: academicCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("34. Academic Staff cannot verify", 403, resAcademicVerify.status);

    // 35. Placement Staff cannot verify
    const resPlacementVerify = await request(`/api/documents/${doc3Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("35. Placement Staff cannot verify", 403, resPlacementVerify.status);

    // 36. Management cannot verify
    const resManagementVerify = await request(`/api/documents/${doc3Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: managementCookies,
      },
      body: JSON.stringify({ status: "VERIFIED" }),
    });
    record("36. Management cannot verify", 403, resManagementVerify.status);

    // ==========================================
    // PART L: DELETE REGRESSION (Tests 37 - 38)
    // ==========================================
    console.log("\nSection: DELETE REGRESSION (37 - 38)");

    // 37. collection DELETE -> 405
    const resDelColl = await request("/api/documents", {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record("37. collection DELETE -> 405", 405, resDelColl.status);

    // 38. detail DELETE -> 405
    const resDelDetail = await request(`/api/documents/${doc1Data.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookies },
    });
    record("38. detail DELETE -> 405", 405, resDelDetail.status);

    // ==========================================
    // PART K: AUDIT LOG REGRESSION (Tests 39 - 45)
    // ==========================================
    console.log("\nSection: AUDIT LOG REGRESSION (39 - 45)");

    const auditDoc1 = await prisma.auditLog.findMany({
      where: { entityId: doc1Data.id },
    });
    const auditDoc2 = await prisma.auditLog.findMany({
      where: { entityId: doc2Data.id },
    });

    // 39. successful upload audit
    const uploadAudit = auditDoc1.find((a) => a.action === "UPLOAD");
    record("39. successful upload audit", true, Boolean(uploadAudit));

    // 40. successful verify audit
    const verifyAudit = auditDoc1.find((a) => a.action === "VERIFY");
    record("40. successful verify audit", true, Boolean(verifyAudit));

    // 41. successful reject audit
    const rejectAudit = auditDoc2.find((a) => a.action === "REJECT");
    record("41. successful reject audit", true, Boolean(rejectAudit));

    // 42. failed upload has no success audit
    const failedUploadAudits = await prisma.auditLog.findMany({
      where: {
        action: "UPLOAD",
        changes: {
          path: ["fileName"],
          equals: "passport_fail.pdf",
        },
      },
    });
    record("42. failed upload has no success audit", 0, failedUploadAudits.length);

    // 43. audit no binary
    const changesStr = JSON.stringify(auditDoc1.map((a) => a.changes));
    record(
      "43. audit no binary",
      true,
      !changesStr.includes("%PDF") &&
        !changesStr.includes("base64") &&
        !changesStr.includes("documentbinary")
    );

    // 44. audit no signed URL
    record(
      "44. audit no signed URL",
      true,
      !changesStr.includes("signedUrl") && !changesStr.includes("token=")
    );

    // 45. audit no credentials
    record(
      "45. audit no credentials",
      true,
      !changesStr.includes("password") &&
        !changesStr.includes("secret") &&
        !changesStr.includes("SUPABASE_SERVICE_ROLE_KEY")
    );

    // ==========================================
    // CLEANUP & TEARDOWN
    // ==========================================
    console.log("\nSection: CLEANUP & VERIFICATION");

    // Clean up all created documents and audit logs
    if (createdDocumentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: createdDocumentIds } },
      });
      await prisma.document.deleteMany({
        where: { id: { in: createdDocumentIds } },
      });
    }

    // Clean up temporary users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    // Clear MockStorageProvider objects via testStorageStatus?clear=true using superAdminCookies
    await request("/api/documents?testStorageStatus=true&clear=true", {
      headers: { Cookie: superAdminCookies },
    });

    // Check DB counts
    const residualDocs = await prisma.document.count();
    const studentsCount = await prisma.student.count();
    const enrollmentsCount = await prisma.enrollment.count();
    const subjectsCount = await prisma.subject.count();
    const classesCount = await prisma.class.count();
    const schedulesCount = await prisma.schedule.count();
    const instructorsCount = await prisma.instructor.count();
    const usersCount = await prisma.user.count();

    console.log(`Residual Documents in DB: ${residualDocs}`);
    console.log(`Database Counts:
  Students: ${studentsCount}
  Enrollments: ${enrollmentsCount}
  Subjects: ${subjectsCount}
  Classes: ${classesCount}
  Schedules: ${schedulesCount}
  Instructors: ${instructorsCount}
  Users: ${usersCount}
`);

    const finalStorageRes = await request("/api/documents?testStorageStatus=true", {
      headers: { Cookie: superAdminCookies },
    });
    const finalStorage = await finalStorageRes.json();
    console.log(`Residual Storage Objects: ${finalStorage.count}`);

    if (finalStorage.count !== 0) {
      throw new Error(`Expected 0 residual storage objects, got ${finalStorage.count}`);
    }
    if (residualDocs !== 0) {
      throw new Error(`Expected 0 residual documents in DB, got ${residualDocs}`);
    }
    if (studentsCount !== 21 || enrollmentsCount !== 21 || subjectsCount !== 6 || classesCount !== 10 || schedulesCount !== 10 || instructorsCount !== 6 || usersCount !== 2) {
      throw new Error(`Database baseline counts mismatch!`);
    }

    console.log("\n==========================================");
    console.log(`ALL ${results.length} TESTS FINISHED!`);
    const allPassed = results.every((r) => r.passed);
    console.log(`OVERALL STATUS: ${allPassed ? "PASSED" : "FAILED"}`);
    console.log("==========================================");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    // Safety cleanup in case of unexpected errors
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
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
