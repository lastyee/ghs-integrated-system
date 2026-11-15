// scripts/sync-certificate-permissions.mjs
// Idempotent permission sync script for certificate:delete
// Strictly grants certificate:delete ONLY to SUPER_ADMIN and ADMIN.

import { PrismaClient } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();

export const certificateDeletePermission = {
  name: "certificate:delete",
  action: "delete",
  subject: "certificate",
  description: "Soft-archive a certificate; status, issue history, and audit log remain intact.",
  allowedRoles: ["SUPER_ADMIN", "ADMIN"],
};

const allRoles = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACADEMIC_STAFF",
  "INSTRUCTOR",
  "PLACEMENT_STAFF",
  "MANAGEMENT",
  "STUDENT",
];

function assertSafeLocalTarget() {
  if (process.env.CERTIFICATE_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION !== "YES") {
    throw new Error(
      "Set CERTIFICATE_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION=YES after reviewing the local-only, permission-scoped synchronization.",
    );
  }
  assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
}

export async function syncCertificatePermissions() {
  assertSafeLocalTarget();

  return prisma.$transaction(async (tx) => {
    const roles = await tx.role.findMany({
      where: { name: { in: allRoles } },
      select: { id: true, name: true },
    });
    if (roles.length !== allRoles.length) {
      throw new Error("All seven expected project roles must exist; no permission changes were made.");
    }

    const roleByName = new Map(roles.map((role) => [role.name, role]));

    // 1. Upsert permission record
    const permRecord = await tx.permission.upsert({
      where: { name: certificateDeletePermission.name },
      update: {
        action: certificateDeletePermission.action,
        subject: certificateDeletePermission.subject,
        description: certificateDeletePermission.description,
      },
      create: {
        name: certificateDeletePermission.name,
        action: certificateDeletePermission.action,
        subject: certificateDeletePermission.subject,
        description: certificateDeletePermission.description,
      },
      select: { id: true, name: true },
    });

    // 2. Grant only to allowed roles (SUPER_ADMIN, ADMIN)
    for (const roleName of certificateDeletePermission.allowedRoles) {
      const role = roleByName.get(roleName);
      if (!role) throw new Error(`Expected role ${roleName} is missing.`);
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permRecord.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permRecord.id,
        },
      });
    }

    // 3. Ensure disallowed roles do NOT have certificate:delete
    const disallowedRoles = allRoles.filter(
      (r) => !certificateDeletePermission.allowedRoles.includes(r),
    );
    for (const roleName of disallowedRoles) {
      const role = roleByName.get(roleName);
      if (!role) continue;
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: permRecord.id,
        },
      });
    }

    // 4. Return verification matrix
    const assigned = await tx.rolePermission.findMany({
      where: { permissionId: permRecord.id },
      select: { role: { select: { name: true } } },
    });
    const assignedRoles = assigned.map(({ role }) => role.name).sort();

    return {
      permission: permRecord.name,
      grantedRoles: assignedRoles,
    };
  });
}

async function main() {
  const result = await syncCertificatePermissions();
  console.log(JSON.stringify({ database: "ghs_integrated", synchronized: result }, null, 2));
}

if (process.argv[1]?.endsWith("sync-certificate-permissions.mjs")) {
  main()
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

