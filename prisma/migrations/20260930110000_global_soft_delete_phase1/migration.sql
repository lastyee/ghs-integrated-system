ALTER TABLE "programs" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "subjects" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "batches" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "instructors" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "employers" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "vacancies" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "assessments" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "deletedAt" TIMESTAMP(3);
