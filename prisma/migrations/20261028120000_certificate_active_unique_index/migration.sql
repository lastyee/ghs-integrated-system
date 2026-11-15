-- Create partial unique index to guarantee only one ACTIVE certificate per student, program, and batch
CREATE UNIQUE INDEX "certificates_active_student_program_batch_key"
ON "certificates"("studentId", "programId", "batchId")
WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

