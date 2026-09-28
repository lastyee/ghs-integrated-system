import { PrismaClient } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();

const permissions = [
  {
    name: "assessment:delete",
    action: "delete",
    subject: "assessment",
    description: "Delete an OPEN assessment only when it has no scores.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"],
  },
  {
    name: "batch:delete",
    action: "delete",
    subject: "batch",
    description: "Delete a batch only when it has no enrollments, classes, schedules, or certificates.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"],
  },
  {
    name: "instructor:delete",
    action: "delete",
    subject: "instructor",
    description: "Delete an instructor only when it has no classes, schedules, or linked user.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF"],
  },
  {
    name: "document:delete",
    action: "delete",
    subject: "document",
    description: "Delete non-verified documents and their stored objects.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "PLACEMENT_STAFF"],
  },
];

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
  if (process.env.DELETE_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION !== "YES") {
    throw new Error(
      "Set DELETE_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION=YES after reviewing the local-only, permission-scoped synchronization.",
    );
  }
  assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
}

async function main() {
  assertSafeLocalTarget();

  const result = await prisma.$transaction(async (tx) => {
    const roles = await tx.role.findMany({
      where: { name: { in: allRoles } },
      select: { id: true, name: true },
    });
    if (roles.length !== allRoles.length) {
      throw new Error("All seven expected project roles must exist; no permission changes were made.");
    }

    const roleByName = new Map(roles.map((role) => [role.name, role]));
    const permissionRecords = new Map();
    for (const definition of permissions) {
      const existing = await tx.permission.findUnique({
        where: { name: definition.name },
        select: { id: true, action: true, subject: true },
      });
      if (
        existing &&
        (existing.action !== definition.action || existing.subject !== definition.subject)
      ) {
        throw new Error(
          `Existing ${definition.name} has an unexpected action/subject; no permission records were changed.`,
        );
      }
    }

    for (const definition of permissions) {
      const record = await tx.permission.upsert({
        where: { name: definition.name },
        update: {},
        create: {
          name: definition.name,
          action: definition.action,
          subject: definition.subject,
          description: definition.description,
        },
        select: { id: true },
      });
      permissionRecords.set(definition.name, record);
    }

    for (const definition of permissions) {
      const permission = permissionRecords.get(definition.name);
      for (const roleName of definition.roles) {
        const role = roleByName.get(roleName);
        if (!role) throw new Error(`Expected role ${roleName} is missing.`);
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    const matrix = [];
    for (const definition of permissions) {
      const permission = permissionRecords.get(definition.name);
      const assigned = await tx.rolePermission.findMany({
        where: { permissionId: permission.id },
        select: { role: { select: { name: true } } },
      });
      const assignedRoles = assigned.map(({ role }) => role.name).sort();
      const expectedRoles = [...definition.roles].sort();
      if (JSON.stringify(assignedRoles) !== JSON.stringify(expectedRoles)) {
        throw new Error(
          `${definition.name} assignment mismatch. Expected [${expectedRoles.join(", ")}], got [${assignedRoles.join(", ")}].`,
        );
      }
      matrix.push({ permission: definition.name, roles: assignedRoles });
    }

    return matrix;
  });

  console.log(JSON.stringify({ database: "ghs_integrated", synchronized: result }, null, 2));
}

main()
  .catch((error) => {
    console.error("Scoped delete-permission synchronization failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
