INSERT INTO "permissions" ("id", "name", "action", "subject", "description", "createdAt", "updatedAt")
VALUES (
  'soft-delete-phase3-user',
  'user:delete',
  'delete',
  'user',
  'Disable a user account without changing linked profiles or history.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

DELETE FROM "role_permissions" AS role_permission
USING "roles" AS role_row, "permissions" AS permission_row
WHERE role_permission."roleId" = role_row."id"
  AND role_permission."permissionId" = permission_row."id"
  AND role_row."name" NOT IN ('SUPER_ADMIN', 'ADMIN')
  AND permission_row."name" IN (
    'user:delete',
    'student:delete',
    'program:delete',
    'subject:delete',
    'batch:delete',
    'instructor:delete',
    'employer:delete',
    'vacancy:delete',
    'assessment:delete',
    'document:delete',
    'enrollment:delete',
    'class:delete',
    'schedule:delete',
    'attendance:delete',
    'assessment-score:delete',
    'application:delete',
    'interview:delete',
    'placement:delete'
  );

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "roles" AS role_row
JOIN "permissions" AS permission_row
  ON permission_row."name" = 'user:delete'
WHERE role_row."name" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
