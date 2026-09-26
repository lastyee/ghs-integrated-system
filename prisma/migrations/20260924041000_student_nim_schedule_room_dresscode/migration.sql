-- AlterTable
ALTER TABLE "schedules" ADD COLUMN "dressCode" TEXT,
ADD COLUMN "room" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN "nim" TEXT NOT NULL,
ALTER COLUMN "nik" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "students_nim_key" ON "students"("nim");
