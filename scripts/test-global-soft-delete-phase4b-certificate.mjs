import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

nextEnv.loadEnvConfig(process.cwd());

const databaseName = "ghs_soft_delete_phase4b_cert_20261001_run2";
const baseUrl = process.env.TEST_BASE_URL;
assertSafeMutationTarget({
  mutationFlag: "TEST_GLOBAL_SOFT_DELETE_PHASE4B_ALLOW_MUTATIONS",
  expectedDatabase: databaseName,
  baseUrl,
  confirmationFlag: "TEST_GLOBAL_SOFT_DELETE_PHASE4B_CONFIRM_DATABASE",
});
if (process.env.TEST_APP_DATABASE_CONFIRM !== databaseName) {
  throw new Error(`Set TEST_APP_DATABASE_CONFIRM=${databaseName} after verifying the isolated application database.`);
}

const prisma = new PrismaClient();
const password = "Phase4B-Disposable-Password-2026!";
const tag = `PHASE4B-${Date.now()}`;
let assertions = 0;

function check(name, condition) {
  assertions += 1;
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}

async function request(path, { cookie = "", method = "GET" } = {}) {
  return fetch(new URL(path, baseUrl), {
    method,
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
}

function mergeCookies(existing, response) {
  const cookies = new Map();
  for (const part of existing.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  for (const header of response.headers.getSetCookie?.() ?? []) {
    const pair = header.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function login(email) {
  const csrf = await request("/api/auth/csrf");
  check(`CSRF response ${email}`, csrf.status === 200);
  let cookie = mergeCookies("", csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(new URL("/api/auth/callback/credentials", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
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
  cookie = mergeCookies(cookie, response);
  check(`Login ${email}`, [200, 302, 303].includes(response.status) && cookie.includes("authjs.session-token"));
  return cookie;
}

async function createFixture() {
  const initialCounts = await Promise.all([
    prisma.user.count(),
    prisma.student.count(),
    prisma.program.count(),
    prisma.batch.count(),
    prisma.certificate.count(),
    prisma.auditLog.count(),
  ]);
  check("Dedicated database starts without business fixtures or AuditLogs", initialCounts.every((count) => count === 0));

  const roleNames = [
    "SUPER_ADMIN",
    "ADMIN",
    "ACADEMIC_STAFF",
    "INSTRUCTOR",
    "PLACEMENT_STAFF",
    "MANAGEMENT",
    "STUDENT",
  ];
  const roles = await Promise.all(roleNames.map((name) =>
    prisma.role.create({ data: { name, description: `Phase 4B fixture ${name}` } }),
  ));
  const roleByName = new Map(roles.map((role) => [role.name, role]));

  await prisma.permission.createMany({
    data: [
      { name: "certificate:read", action: "read", subject: "certificate" },
      { name: "certificate:delete", action: "delete", subject: "certificate" },
    ],
    skipDuplicates: true,
  });
  const permissions = await prisma.permission.findMany({
    where: { name: { in: ["certificate:read", "certificate:delete"] } },
  });
  const permissionByName = new Map(permissions.map((permission) => [permission.name, permission]));
  const grants = roleNames.flatMap((name) => [
    { roleId: roleByName.get(name).id, permissionId: permissionByName.get("certificate:read").id },
    ...(["SUPER_ADMIN", "ADMIN"].includes(name)
      ? [{ roleId: roleByName.get(name).id, permissionId: permissionByName.get("certificate:delete").id }]
      : []),
  ]);
  await prisma.rolePermission.createMany({ data: grants });

  const passwordHash = await bcrypt.hash(password, 10);
  const users = {};
  for (const name of roleNames) {
    users[name] = await prisma.user.create({
      data: {
        email: `${name.toLowerCase()}-${tag}@phase4b.test`,
        passwordHash,
        name: `${tag} ${name}`,
        roleId: roleByName.get(name).id,
      },
    });
  }

  const program = await prisma.program.create({
    data: { code: `${tag}-PROGRAM`, name: `${tag} Program` },
  });
  const student = await prisma.student.create({
    data: { nim: `${Date.now()}`, name: `${tag} Student`, userId: users.STUDENT.id },
  });
  const batch = await prisma.batch.create({
    data: {
      name: `${tag} Batch`,
      programId: program.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const createCertificate = (label, status) => prisma.certificate.create({
    data: {
      studentId: student.id,
      programId: program.id,
      batchId: batch.id,
      certificateNumber: `${tag}-${label}`,
      issuedAt: new Date("2026-05-01T00:00:00.000Z"),
      status,
      path: `certificates/${tag}-${label}.pdf`,
    },
  });
  const active = await createCertificate("ACTIVE", "ACTIVE");
  const revoked = await createCertificate("REVOKED", "REVOKED");
  const ui = await createCertificate("UI", "ACTIVE");
  return { users, program, student, batch, certificates: { active, revoked, ui } };
}

async function assertDeleteScenario({ label, certificate, cookie, expectedStatus = 200 }) {
  const response = await request(`/api/certificates/${certificate.id}`, { method: "DELETE", cookie });
  check(`${label} DELETE HTTP ${expectedStatus}`, response.status === expectedStatus);
  return response;
}

async function run() {
  const fixture = await createFixture();
  const sessions = {};
  for (const name of [
    "SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "INSTRUCTOR",
    "PLACEMENT_STAFF", "MANAGEMENT", "STUDENT",
  ]) {
    sessions[name] = await login(fixture.users[name].email);
  }

  for (const certificate of [fixture.certificates.active, fixture.certificates.revoked]) {
    const anonymous = await assertDeleteScenario({
      label: `Anonymous ${certificate.status}`,
      certificate,
      cookie: "",
      expectedStatus: 401,
    });
    check(`Anonymous response does not mutate ${certificate.certificateNumber}`, !anonymous.ok &&
      (await prisma.certificate.findUnique({ where: { id: certificate.id } })).deletedAt === null);
  }

  for (const role of ["ACADEMIC_STAFF", "INSTRUCTOR", "PLACEMENT_STAFF", "MANAGEMENT", "STUDENT"]) {
    const response = await assertDeleteScenario({
      label: `${role} denied`,
      certificate: fixture.certificates.active,
      cookie: sessions[role],
      expectedStatus: 403,
    });
    check(`${role} cannot mutate Certificate`, !response.ok &&
      (await prisma.certificate.findUnique({ where: { id: fixture.certificates.active.id } })).deletedAt === null);
  }

  const missing = await request("/api/certificates/cm00000000000000000000000", {
    method: "DELETE",
    cookie: sessions.ADMIN,
  });
  check("Authorized DELETE nonexistent Certificate returns 404", missing.status === 404);

  for (const [label, certificate, role] of [
    ["Admin ACTIVE certificate", fixture.certificates.active, "ADMIN"],
    ["Super Admin REVOKED certificate", fixture.certificates.revoked, "SUPER_ADMIN"],
  ]) {
    const before = await request("/api/certificates", { cookie: sessions.ADMIN });
    check(`${label} is present before delete`, before.status === 200 &&
      JSON.stringify(await before.json()).includes(certificate.certificateNumber));

    const response = await assertDeleteScenario({
      label,
      certificate,
      cookie: sessions[role],
    });
    const payload = await response.json();
    const retained = await prisma.certificate.findUnique({ where: { id: certificate.id } });
    check(`${label} row retained with deletedAt`, retained?.deletedAt instanceof Date);
    check(`${label} lifecycle status preserved`, retained?.status === certificate.status);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "DELETE", entity: "Certificate", entityId: certificate.id },
    });
    check(`${label} AuditLog records actor`, audit?.userId === fixture.users[role].id);
    check(`${label} AuditLog records timestamp and before/after`, Boolean(
      audit?.createdAt &&
      audit.changes?.fields?.deletedAt?.before === null &&
      audit.changes?.fields?.deletedAt?.after === retained?.deletedAt?.toISOString(),
    ));
    check(`${label} DELETE response retains business status`, payload.data?.status === certificate.status);

    const after = await request("/api/certificates", { cookie: sessions.ADMIN });
    check(`${label} omitted from active list`, after.status === 200 &&
      !JSON.stringify(await after.json()).includes(certificate.certificateNumber));
    check(`${label} active detail returns 404`,
      (await request(`/api/certificates/${certificate.id}`, { cookie: sessions.ADMIN })).status === 404);
    check(`${label} active download returns 404 without signed URL`,
      (await request(`/api/certificates/${certificate.id}/download`, { cookie: sessions.ADMIN })).status === 404);
    check(`${label} repeated DELETE returns 404`,
      (await request(`/api/certificates/${certificate.id}`, { method: "DELETE", cookie: sessions.ADMIN })).status === 404);
    check(`${label} Student/Program/Batch relations remain`,
      retained?.studentId === fixture.student.id &&
      retained.programId === fixture.program.id &&
      retained.batchId === fixture.batch.id);
  }

  const uiCertificate = await prisma.certificate.findUnique({
    where: { id: fixture.certificates.ui.id },
  });
  check("UI fixture remains active for browser confirmation checks", uiCertificate?.deletedAt === null);
  check("Admin and Super Admin certificate delete permission grants are present", Boolean(
    await prisma.rolePermission.findFirst({
      where: {
        permission: { name: "certificate:delete" },
        role: { name: "ADMIN" },
      },
    }) &&
    await prisma.rolePermission.findFirst({
      where: {
        permission: { name: "certificate:delete" },
        role: { name: "SUPER_ADMIN" },
      },
    }),
  ));
  check("All Certificate fixture relations remain", Boolean(
    await prisma.student.findUnique({ where: { id: fixture.student.id } }) &&
    await prisma.program.findUnique({ where: { id: fixture.program.id } }) &&
    await prisma.batch.findUnique({ where: { id: fixture.batch.id } }),
  ));
  console.log(`Phase 4B Certificate API assertions passed: ${assertions}.`);
  console.log(JSON.stringify({
    fixtureTag: tag,
    browserUserEmail: fixture.users.SUPER_ADMIN.email,
    browserPassword: password,
    uiCertificateId: fixture.certificates.ui.id,
    uiCertificateNumber: fixture.certificates.ui.certificateNumber,
  }));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
