ALTER TABLE "enrollments" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "classes" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "schedules" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "attendances" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "assessment_scores" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "applications" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "interviews" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "placements" ADD COLUMN "deletedAt" TIMESTAMP(3);

INSERT INTO "permissions" ("id", "name", "action", "subject", "description", "createdAt", "updatedAt")
VALUES
  ('soft-delete-phase2-enrollment', 'enrollment:delete', 'delete', 'enrollment', 'Soft-archive an enrollment without changing linked records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-class', 'class:delete', 'delete', 'class', 'Soft-archive a class; schedules, attendance, and assessments remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-schedule', 'schedule:delete', 'delete', 'schedule', 'Soft-archive a schedule; attendance records remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-attendance', 'attendance:delete', 'delete', 'attendance', 'Soft-archive an attendance record; the student and schedule remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-assessment-score', 'assessment-score:delete', 'delete', 'assessmentScore', 'Soft-archive a score; the assessment and student remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-application', 'application:delete', 'delete', 'application', 'Soft-archive an application; interviews and placements remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-interview', 'interview:delete', 'delete', 'interview', 'Soft-archive an interview; the application remains intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('soft-delete-phase2-placement', 'placement:delete', 'delete', 'placement', 'Soft-archive a placement; linked career and application history remain intact.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "roles" AS role_row
JOIN "permissions" AS permission_row
  ON permission_row."name" IN (
    'student:delete',
    'enrollment:delete',
    'class:delete',
    'schedule:delete',
    'attendance:delete',
    'assessment-score:delete',
    'application:delete',
    'interview:delete',
    'placement:delete'
  )
WHERE role_row."name" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
