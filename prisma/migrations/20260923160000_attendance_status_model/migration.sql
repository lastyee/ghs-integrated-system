-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('SICK', 'PERMITTED', 'UNEXCUSED');

-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'LATE', 'ABSENT');
ALTER TABLE "attendances" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "AttendanceStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN "absenceType" "AbsenceType",
ADD COLUMN "lateMinutes" INTEGER;
