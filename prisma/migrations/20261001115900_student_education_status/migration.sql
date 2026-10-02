-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'DROPPED');

-- AlterTable
ALTER TABLE "students" ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';
