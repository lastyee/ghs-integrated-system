import { PrismaClient } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();

export const assignmentPermissions = [
  {
    name: "assignment:create",
    action: "create",
    subject: "assignment",
    description: "Create an assignment for a class and subject.",
    roles: ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"],
  },
  {
    name: "assignment:read",
    action: "read",
    subject: "assignment",
    description: "View assignments and assignment details.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "INSTRUCTOR", "MANAGEMENT", "STUDENT"],
  },
  {
    name: "assignment:update",
    action: "update",
    subject: "assignment",
    description: "Update assignment instructions, deadlines, or settings.",
    roles: ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"],
  },
  {
    name: "assignment:delete",
    action: "delete",
    subject: "assignment",
    description: "Soft-archive an assignment; student submissions remain intact.",
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    name: "assignment-submission:create",
    action: "create",
    subject: "assignmentSubmission",
    description: "Submit assignment file and notes.",
    roles: ["SUPER_ADMIN", "ADMIN", "STUDENT"],
  },
  {
    name: "assignment-submission:read",
    action: "read",
    subject: "assignmentSubmission",
    description: "View assignment submissions according to authority.",
    roles: ["SUPER_ADMIN", "ADMIN", "ACADEMIC_STAFF", "INSTRUCTOR", "MANAGEMENT", "STUDENT"],
  },
  {
    name: "assignment-submission:grade",
    action: "grade",
    subject: "assignmentSubmission",
    description: "Grade assignment submissions and provide feedback.",
    roles: ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"],
  },
  {
    name: "assignment-submission:delete",
    action: "delete",
    subject: "assignmentSubmission",
    description: "Soft-archive an assignment submission.",
    roles: ["SUPER_ADMIN", "ADMIN"],
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
  if (process.env.ASSIGNMENT_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION !== "YES") {
    throw new Error(
      "Set ASSIGNMENT_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION=YES after reviewing the local-only, permission-scoped synchronization.",
    );
  }
  assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
}

export async function syncAssignmentPermissions() {
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
    const permissionRecords = new Map();

    for (const definition of assignmentPermissions) {
      const record = await tx.permission.upsert({
        where: { name: definition.name },
        update: {
          action: definition.action,
          subject: definition.subject,
          description: definition.description,
        },
        create: {
          name: definition.name,
          action: definition.action,
          subject: definition.subject,
          description: definition.description,
        },
        select: { id: true, name: true },
      });
      permissionRecords.set(definition.name, record);
    }

    for (const definition of assignmentPermissions) {
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
    for (const definition of assignmentPermissions) {
      const permission = permissionRecords.get(definition.name);
      const assigned = await tx.rolePermission.findMany({
        where: { permissionId: permission.id },
        select: { role: { select: { name: true } } },
      });
      const assignedRoles = assigned.map(({ role }) => role.name).sort();
      matrix.push({ permission: definition.name, roles: assignedRoles });
    }

    return matrix;
  });
}

async function main() {
  const result = await syncAssignmentPermissions();
  console.log(JSON.stringify({ database: "ghs_integrated", synchronized: result }, null, 2));
}

if (process.argv[1]?.endsWith("sync-assignment-permissions.mjs")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
