import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DOCUMENTS_BUCKET, MockStorageProvider, SupabaseStorageProvider } from "../lib/storage.ts";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "");
const password = `Step97-${randomUUID()}!`;
const created = {
  users: [],
  studentId: null,
  documents: [],
  missingObjectDocumentId: null,
  paths: [],
};
let adminCookies = "";
let fixtureUsers = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, passed, details = "") {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
  if (!passed) throw new Error(`Test failed: ${name}`);
}

function assertSafeTarget() {
  assertSafeMutationTarget({
    mutationFlag: "STEP97_TEST_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated",
    confirmationFlag: "STEP97_TEST_CONFIRM_DATABASE",
    baseUrl,
  });
}

function mergeCookies(existing, response) {
  const headers = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();
  for (const pair of existing.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  for (const header of headers) {
    const pair = header.split(";")[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookieMap.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return [...cookieMap].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function login(email) {
  let cookies = "";
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  cookies = mergeCookies(cookies, csrfResponse);
  assert(csrfResponse.ok, `Unable to retrieve CSRF token (HTTP ${csrfResponse.status}).`);
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${baseUrl}/`, json: "true" }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  assert([302, 303].includes(response.status), `Login failed for fixture ${email} (HTTP ${response.status}).`);
  return cookies;
}

async function api(path, cookies, method = "GET", body, extraHeaders = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookies ? { Cookie: cookies } : {}),
      ...((body !== undefined) ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function uploadDocument(cookies, studentId, label) {
  const form = new FormData();
  form.set("type", `STEP97 ${label}`);
  form.set("studentId", studentId);
  form.set("file", new Blob([Buffer.from("%PDF-1.7\nSTEP97\n")], { type: "application/pdf" }), `step97-${label}-${suffix}.pdf`);
  const response = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Cookie: cookies },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.status === 201, `Document fixture upload failed (HTTP ${response.status}): ${payload.message || "no message"}`);
  created.documents.push(payload.id);
  created.paths.push(payload.storagePath);
  return payload;
}

async function readMockStorage(cookies) {
  const response = await api("/api/documents?testStorageStatus=true", cookies);
  assert(response.ok, `Mock storage status unavailable (HTTP ${response.status}).`);
  const payload = await response.json();
  assert(Array.isArray(payload.keys) && Array.isArray(payload.deleteHistory), "Application is not using MockStorageProvider.");
  return payload;
}

async function ensurePermissionAndUsers() {
  const permission = await prisma.permission.findUnique({
    where: { name: "document:delete" },
    select: { id: true, action: true, subject: true },
  });
  assert(
    permission?.action === "delete" && permission.subject === "document",
    "document:delete must be synchronized from the permission source before testing.",
  );

  const roles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "PLACEMENT_STAFF", "INSTRUCTOR", "MANAGEMENT", "STUDENT"] } },
    select: { id: true, name: true },
  });
  assert(roles.length === 7, "All required test roles must exist.");
  const allowed = new Set(["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "PLACEMENT_STAFF"]);
  const assignments = await prisma.rolePermission.findMany({
    where: { permissionId: permission.id },
    select: { role: { select: { name: true } } },
  });
  const assignedRoles = assignments.map(({ role }) => role.name).sort();
  const expectedRoles = [...allowed].sort();
  assert(
    JSON.stringify(assignedRoles) === JSON.stringify(expectedRoles),
    "document:delete role assignments must match the source policy before testing.",
  );

  fixtureUsers = Object.fromEntries(await Promise.all(roles.map(async ({ id, name }) => {
    const user = await prisma.user.create({
      data: {
        email: `step97-${name.toLowerCase()}-${suffix}@ghs.test`,
        name: `STEP 97 ${name}`,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: id,
      },
      select: { id: true, email: true },
    });
    created.users.push(user.id);
    return [name, user];
  })));
}

async function assertManualRecords() {
  const batches = await prisma.batch.findMany({ where: { name: "GHI-09" }, select: { id: true, name: true } });
  const student = await prisma.student.findUnique({ where: { nim: "269067460" }, select: { id: true, nim: true, name: true } });
  const employers = await prisma.employer.findMany({
    where: { name: { equals: "bounty", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      vacancies: { where: { title: "KITCHEN" }, select: { id: true, title: true } },
      placements: { select: { id: true } },
    },
  });
  const ktpDocuments = await prisma.document.findMany({
    where: { type: "KTP" },
    select: { id: true, type: true, studentId: true, fileName: true },
  });
  assert(
    batches.length > 0 &&
      student &&
      employers.some((employer) => employer.vacancies.length > 0 && employer.placements.length > 0) &&
      ktpDocuments.length > 0,
    "Required manual records are missing; test stopped before fixture creation.",
  );
  return JSON.stringify({
    batches,
    student,
    employers: employers.map(({ id, name, vacancies, placements }) => ({
      id,
      name,
      vacancies,
      placements: placements.map(({ id }) => id).sort(),
    })),
    ktpDocuments,
  });
}

async function getCounts() {
  const models = ["document", "auditLog", "student", "user"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
}

async function testStorageProviderContracts() {
  const mock = new MockStorageProvider();
  const file = Buffer.from("test");
  await mock.upload({ bucket: DOCUMENTS_BUCKET, path: `contract/${suffix}.pdf`, file, contentType: "application/pdf" });
  record("Mock storage delete removes an existing object", (await mock.delete({ bucket: DOCUMENTS_BUCKET, path: `contract/${suffix}.pdf` })).outcome === "deleted");
  record("Mock storage delete reports already-missing object idempotently", (await mock.delete({ bucket: DOCUMENTS_BUCKET, path: `contract/${suffix}.pdf` })).outcome === "already_absent");
  mock.failNextDeleteForTest();
  let mockFailure = false;
  try {
    await mock.delete({ bucket: DOCUMENTS_BUCKET, path: `contract/${suffix}.pdf` });
  } catch {
    mockFailure = true;
  }
  record("Mock storage delete surfaces explicit failure", mockFailure);

  const requests = [];
  const responses = [
    new Response(JSON.stringify([{ name: `students/${suffix}/stored.pdf` }]), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify({ statusCode: "500", error: "Internal Server Error", message: "simulated provider failure" }), { status: 500, headers: { "Content-Type": "application/json" } }),
  ];
  const supabase = new SupabaseStorageProvider(
    "https://storage.example.invalid",
    "non-production-test-key",
    async (input, init) => {
      requests.push({ url: String(input), method: init?.method, body: init?.body });
      return responses.shift();
    },
  );
  record("Supabase provider maps removed object response", (await supabase.delete({
    bucket: DOCUMENTS_BUCKET,
    path: `students/${suffix}/stored.pdf`,
  })).outcome === "deleted");
  record("Supabase provider maps empty successful remove response as already absent", (await supabase.delete({
    bucket: DOCUMENTS_BUCKET,
    path: `students/${suffix}/absent.pdf`,
  })).outcome === "already_absent");
  let supabaseFailure = false;
  try {
    await supabase.delete({ bucket: DOCUMENTS_BUCKET, path: `students/${suffix}/failed.pdf` });
  } catch {
    supabaseFailure = true;
  }
  record("Supabase provider surfaces operational delete failure", supabaseFailure);
  const firstRequest = requests[0];
  const requestBody = JSON.parse(firstRequest.body);
  record(
    "Supabase delete uses the exact bucket and supplied server path",
    firstRequest.method === "DELETE" &&
      firstRequest.url.endsWith(`/object/${DOCUMENTS_BUCKET}`) &&
      requestBody.prefixes[0] === `students/${suffix}/stored.pdf`,
  );
}

async function cleanup() {
  const errors = [];
  const attempt = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push(`${label}: ${String(error)}`);
    }
  };

  for (const documentId of created.documents) {
    await attempt(`document fixture ${documentId}`, async () => {
      const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true } });
      if (!document) return;
      await prisma.document.update({ where: { id: documentId }, data: { status: "PENDING" } });
      const response = await api(`/api/documents/${documentId}`, adminCookies, "DELETE");
      if (response.status !== 200) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(`fixture cleanup DELETE returned HTTP ${response.status}: ${payload.message || "no message"}`);
      }
    });
  }
  if (created.documents.length) {
    await attempt("manually created absent-object Document fixture", async () => {
      if (created.missingObjectDocumentId) {
        await prisma.document.deleteMany({ where: { id: created.missingObjectDocumentId } });
      }
    });
  }
  let finalStorage;
  await attempt("Mock storage snapshot before fixture-account removal", async () => {
    finalStorage = await readMockStorage(adminCookies);
  });
  if (created.studentId) {
    await attempt("Student fixture", async () => {
      await prisma.student.deleteMany({ where: { id: created.studentId } });
    });
  }
  if (created.users.length) {
    await attempt("User fixtures", async () => {
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return finalStorage;
}

async function run() {
  assertSafeTarget();
  await testStorageProviderContracts();
  const manualBaseline = await assertManualRecords();
  const baseline = await getCounts();
  let cleanupError;
  let finalStorage;

  try {
    await ensurePermissionAndUsers();
    const sessions = Object.fromEntries(await Promise.all(Object.entries(fixtureUsers).map(async ([role, user]) => [role, await login(user.email)])));
    adminCookies = sessions.ADMIN;
    const student = await prisma.student.create({
      data: { nim: `97${suffix.slice(0, 9)}`, name: `STEP 97 Student ${suffix}` },
      select: { id: true },
    });
    created.studentId = student.id;
    await readMockStorage(adminCookies);

    record("Unauthenticated DELETE returns 401", (await api(`/api/documents/step97-missing-${suffix}`, undefined, "DELETE")).status === 401);
    for (const role of ["STUDENT", "INSTRUCTOR", "MANAGEMENT"]) {
      record(`${role} DELETE returns 403`, (await api(`/api/documents/step97-missing-${suffix}`, sessions[role], "DELETE")).status === 403);
    }
    record("Nonexistent Document returns 404", (await api(`/api/documents/step97-missing-${suffix}`, adminCookies, "DELETE")).status === 404);

    const deleteByRole = [
      ["SUPER_ADMIN", sessions.SUPER_ADMIN],
      ["ADMIN", sessions.ADMIN],
      ["ACADEMIC_STAFF", sessions.ACADEMIC_STAFF],
      ["PLACEMENT_STAFF", sessions.PLACEMENT_STAFF],
    ];
    for (const [role, cookies] of deleteByRole) {
      const document = await uploadDocument(adminCookies, student.id, `allowed-${role.toLowerCase()}`);
      const response = await api(`/api/documents/${document.id}`, cookies, "DELETE");
      record(`${role} may delete an eligible Document`, response.status === 200);
      record(`${role} successful DELETE removes its database record`, !await prisma.document.findUnique({ where: { id: document.id }, select: { id: true } }));
      record(`${role} successful DELETE removes its storage object`, !(await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${document.storagePath}`));
      record(`${role} successful DELETE has actor audit`, Boolean(await prisma.auditLog.findFirst({
        where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: document.id, userId: fixtureUsers[role].id },
        select: { id: true },
      })));
    }

    const verified = await uploadDocument(adminCookies, student.id, "verified");
    await prisma.document.update({ where: { id: verified.id }, data: { status: "VERIFIED" } });
    const verifiedResponse = await api(`/api/documents/${verified.id}`, adminCookies, "DELETE");
    const verifiedRecord = await prisma.document.findUnique({ where: { id: verified.id }, select: { id: true, status: true } });
    record("VERIFIED document returns 409", verifiedResponse.status === 409);
    record("VERIFIED database row remains", verifiedRecord?.status === "VERIFIED");
    record("VERIFIED storage object remains", (await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${verified.storagePath}`));
    record("VERIFIED rejection creates no success audit", !(await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: verified.id },
      select: { id: true },
    })));

    const pending = await uploadDocument(adminCookies, student.id, "pending");
    const pendingRecord = await prisma.document.findUnique({
      where: { id: pending.id },
      select: { storagePath: true, studentId: true, status: true },
    });
    const beforePendingDeletes = await readMockStorage(adminCookies);
    const maliciousPath = `students/other/${suffix}-arbitrary.pdf`;
    const pendingDelete = await api(`/api/documents/${pending.id}`, adminCookies, "DELETE", {
      storagePath: maliciousPath,
      status: "VERIFIED",
      studentId: "client-controlled-student",
    });
    record("PENDING document with storage object returns 200", pendingDelete.status === 200);
    record("PENDING database record is removed", !await prisma.document.findUnique({ where: { id: pending.id }, select: { id: true } }));
    const afterPendingDeletes = await readMockStorage(adminCookies);
    record("PENDING storage object is removed by DB-stored path", !afterPendingDeletes.keys.includes(`${DOCUMENTS_BUCKET}/${pendingRecord.storagePath}`) &&
      afterPendingDeletes.deleteHistory.includes(`${DOCUMENTS_BUCKET}/${pendingRecord.storagePath}`) &&
      afterPendingDeletes.deleteHistory.length === beforePendingDeletes.deleteHistory.length + 1);
    const pendingAudit = await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: pending.id, userId: fixtureUsers.ADMIN.id },
      select: { changes: true },
    });
    record("PENDING delete writes metadata audit without trusting request fields", Boolean(pendingAudit) &&
      pendingAudit.changes.status === pendingRecord.status &&
      pendingAudit.changes.storagePath === pendingRecord.storagePath &&
      pendingAudit.changes.studentId === pendingRecord.studentId &&
      pendingAudit.changes.storageOutcome === "deleted" &&
      pendingAudit.changes.storagePath !== maliciousPath);

    const rejected = await uploadDocument(adminCookies, student.id, "rejected");
    const rejectResponse = await api(`/api/documents/${rejected.id}`, adminCookies, "PATCH", {
      status: "REJECTED",
      rejectionReason: "STEP 97 test fixture",
    });
    record("Existing document rejection PATCH still works", rejectResponse.ok);
    record("REJECTED document DELETE returns 200", (await api(`/api/documents/${rejected.id}`, adminCookies, "DELETE")).status === 200);
    record("REJECTED DB record and object are removed", !await prisma.document.findUnique({ where: { id: rejected.id }, select: { id: true } }) &&
      !(await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${rejected.storagePath}`));

    const expired = await uploadDocument(adminCookies, student.id, "expired");
    await prisma.document.update({ where: { id: expired.id }, data: { status: "EXPIRED" } });
    record("EXPIRED document DELETE returns 200", (await api(`/api/documents/${expired.id}`, adminCookies, "DELETE")).status === 200);
    record("EXPIRED DB record and object are removed", !await prisma.document.findUnique({ where: { id: expired.id }, select: { id: true } }) &&
      !(await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${expired.storagePath}`));

    const missingId = `doc_step97_${suffix}`;
    const missingPath = `students/${student.id}/${missingId}.pdf`;
    const missing = await prisma.document.create({
      data: {
        id: missingId,
        studentId: student.id,
        type: `STEP97 MISSING ${suffix}`,
        storagePath: missingPath,
        fileName: `missing-${suffix}.pdf`,
        fileSize: 12,
        fileType: "application/pdf",
        status: "PENDING",
      },
      select: { id: true, storagePath: true },
    });
    created.documents.push(missing.id);
    created.missingObjectDocumentId = missing.id;
    created.paths.push(missing.storagePath);
    record("Missing-object fixture has DB row and no object", Boolean(
      await prisma.document.findUnique({ where: { id: missing.id } }) &&
      !(await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${missing.storagePath}`)
    ));
    const missingDelete = await api(`/api/documents/${missing.id}`, adminCookies, "DELETE");
    record("DELETE of Document with missing object returns 200", missingDelete.status === 200);
    record("Missing-object Document DB record is removed", !await prisma.document.findUnique({ where: { id: missing.id }, select: { id: true } }));
    const missingAudit = await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: missing.id },
      select: { changes: true },
    });
    record("Missing-object success audit records already_absent", missingAudit?.changes.storageOutcome === "already_absent");

    const storageFailure = await uploadDocument(adminCookies, student.id, "storage-failure");
    const storageFailureResponse = await api(
      `/api/documents/${storageFailure.id}`,
      adminCookies,
      "DELETE",
      undefined,
      { "x-test-force-storage-failure": "true" },
    );
    record("Storage failure returns non-success", storageFailureResponse.status === 502);
    record("Storage failure retains DB record and object", Boolean(await prisma.document.findUnique({ where: { id: storageFailure.id } }) &&
      (await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${storageFailure.storagePath}`)));
    record("Storage failure creates no success audit", !await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: storageFailure.id },
      select: { id: true },
    }));
    record("Retry after storage failure completes deletion", (await api(`/api/documents/${storageFailure.id}`, adminCookies, "DELETE")).status === 200);

    const databaseFailure = await uploadDocument(adminCookies, student.id, "database-failure");
    const databaseFailureResponse = await api(
      `/api/documents/${databaseFailure.id}`,
      adminCookies,
      "DELETE",
      undefined,
      { "x-test-force-db-failure": "true" },
    );
    record("DB failure after storage removal returns retryable non-success", databaseFailureResponse.status === 503);
    record("DB failure retains Document but storage object is absent", Boolean(
      await prisma.document.findUnique({ where: { id: databaseFailure.id }, select: { id: true } }) &&
      !(await readMockStorage(adminCookies)).keys.includes(`${DOCUMENTS_BUCKET}/${databaseFailure.storagePath}`),
    ));
    record("DB failure creates no success audit", !await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: databaseFailure.id },
      select: { id: true },
    }));
    const retryResponse = await api(`/api/documents/${databaseFailure.id}`, adminCookies, "DELETE");
    record("Retry after DB failure treats storage absence as success", retryResponse.status === 200);
    const retryAudit = await prisma.auditLog.findFirst({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: databaseFailure.id },
      select: { changes: true },
    });
    record("Retry completes DB delete with exactly one already_absent audit", !await prisma.document.findUnique({
      where: { id: databaseFailure.id },
      select: { id: true },
    }) && await prisma.auditLog.count({
      where: { action: "DOCUMENT_DELETE", entity: "Document", entityId: databaseFailure.id },
    }) === 1 && retryAudit?.changes.storageOutcome === "already_absent");

    const regression = await uploadDocument(adminCookies, student.id, "regression");
    record("Document GET and signed URL flow remains available", (await api(`/api/documents/${regression.id}`, adminCookies)).ok);
    record("Document upload flow remains available", Boolean(await prisma.document.findUnique({ where: { id: regression.id } })));
    const verifyResponse = await api(`/api/documents/${regression.id}`, adminCookies, "PATCH", { status: "VERIFIED" });
    record("Document verification PATCH remains available", verifyResponse.ok);
    await prisma.document.update({ where: { id: regression.id }, data: { status: "PENDING" } });
    record("Document rejection flow remains available", (await api(`/api/documents/${regression.id}`, adminCookies, "PATCH", {
      status: "REJECTED",
      rejectionReason: "STEP 97 regression",
    })).ok);
    await prisma.document.update({ where: { id: regression.id }, data: { status: "PENDING" } });
    record("Document DELETE after regression restores retryable fixture state", (await api(`/api/documents/${regression.id}`, adminCookies, "DELETE")).status === 200);

    record("Required manual GHS records remain unchanged", (await assertManualRecords()) === manualBaseline);
  } finally {
    try {
      finalStorage = await cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw new Error(`Fixture cleanup failed; inspect only exact STEP 97 fixture IDs/paths. ${String(cleanupError)}`);

  const finalCounts = await getCounts();
  for (const [model, count] of Object.entries(baseline)) {
    if (model === "auditLog") {
      record("Document upload/delete audit history is retained", finalCounts.auditLog > count, `${count} → ${finalCounts.auditLog}`);
      continue;
    }
    record(`Database baseline preserved for ${model}`, finalCounts[model] === count, `${count} → ${finalCounts[model]}`);
  }
  const fixtureKeysRemaining = created.paths.filter((path) => finalStorage.keys.includes(`${DOCUMENTS_BUCKET}/${path}`));
  record("No STEP 97 fixture storage objects remain", fixtureKeysRemaining.length === 0, `${created.paths.length - fixtureKeysRemaining.length}/${created.paths.length} removed`);
  record("Manual KTP documents remain", (await prisma.document.count({ where: { type: "KTP" } })) > 0);
  record("No orphan Document-to-Student records remain", await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM documents d LEFT JOIN students s ON s.id = d."studentId"
    WHERE s.id IS NULL
  `.then(([row]) => row.count === 0));
}

run()
  .catch((error) => {
    console.error("STEP 97 test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
