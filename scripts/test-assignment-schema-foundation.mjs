import assert from "node:assert/strict";
import { PrismaClient, AssignmentStatus, SubmissionStatus } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

console.log("=== RUNNING ASSIGNMENT DATA FOUNDATION & RBAC TEST SUITE ===\n");

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

const prisma = new PrismaClient();

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✓ ${name}`);
    })
    .catch((err) => {
      console.error(`✗ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function run() {
  let testAssignmentId = null;
  let testSubmissionId = null;

  try {
    // 1. Fetch prerequisite records (Class, Subject, Instructor, Student)
    const [existingClass, existingSubject, existingInstructor, existingStudent] =
      await Promise.all([
        prisma.class.findFirst({
          where: { deletedAt: null },
          include: { instructor: true, schedules: { where: { deletedAt: null }, take: 1 } },
        }),
        prisma.subject.findFirst({ where: { deletedAt: null } }),
        prisma.instructor.findFirst({ where: { deletedAt: null } }),
        prisma.student.findFirst({ where: { deletedAt: null, user: { deletedAt: null } } }),
      ]);

    assert.ok(existingClass, "Prerequisite: Active Class must exist");
    assert.ok(existingSubject, "Prerequisite: Active Subject must exist");
    assert.ok(existingInstructor, "Prerequisite: Active Instructor must exist");
    assert.ok(existingStudent, "Prerequisite: Active Student must exist");

    const scheduleId = existingClass.schedules[0]?.id ?? null;

    // 2. Test Assignment Creation
    await test("DB: Create Assignment with full relational metadata", async () => {
      const dueDate = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days ahead
      const assignment = await prisma.assignment.create({
        data: {
          title: "Tugas Pengantar Arsitektur Sistem",
          description: "Pelajari dan buat analisis diagram relasi database.",
          classId: existingClass.id,
          subjectId: existingSubject.id,
          scheduleId: scheduleId,
          instructorId: existingInstructor.id,
          dueDate,
          allowLateSubmission: true,
          maxScore: 100,
          status: AssignmentStatus.PUBLISHED,
          attachmentPath: "assignments/instructions/test-guide.pdf",
          attachmentName: "Panduan_Tugas.pdf",
          attachmentSize: 102400,
          attachmentType: "application/pdf",
        },
      });

      testAssignmentId = assignment.id;
      assert.equal(assignment.title, "Tugas Pengantar Arsitektur Sistem");
      assert.equal(assignment.status, AssignmentStatus.PUBLISHED);
      assert.equal(assignment.allowLateSubmission, true);
      assert.equal(assignment.maxScore, 100);
      assert.equal(assignment.attachmentName, "Panduan_Tugas.pdf");
      assert.equal(assignment.deletedAt, null);
    });

    // 3. Test Assignment Query with Relations
    await test("DB: Query Assignment including Class, Subject, Schedule, and Instructor", async () => {
      const assignment = await prisma.assignment.findUnique({
        where: { id: testAssignmentId },
        include: {
          class: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
          schedule: { select: { id: true, topic: true } },
          instructor: { select: { id: true, name: true } },
        },
      });

      assert.ok(assignment, "Assignment should be found");
      assert.equal(assignment.class.id, existingClass.id);
      assert.equal(assignment.subject.id, existingSubject.id);
      assert.equal(assignment.instructor.id, existingInstructor.id);
      if (scheduleId) {
        assert.equal(assignment.schedule?.id, scheduleId);
      }
    });

    // 4. Test AssignmentSubmission Creation
    await test("DB: Create AssignmentSubmission for student", async () => {
      const submission = await prisma.assignmentSubmission.create({
        data: {
          assignmentId: testAssignmentId,
          studentId: existingStudent.id,
          status: SubmissionStatus.SUBMITTED,
          content: "Berikut laporan penugasan saya.",
          storagePath: `assignments/submissions/${testAssignmentId}/${existingStudent.id}/jawaban.pdf`,
          fileName: "Jawaban_Tugas_Mahasiswa.pdf",
          fileSize: 204800,
          fileType: "application/pdf",
          attemptCount: 1,
        },
      });

      testSubmissionId = submission.id;
      assert.equal(submission.status, SubmissionStatus.SUBMITTED);
      assert.equal(submission.attemptCount, 1);
      assert.equal(submission.score, null);
      assert.equal(submission.feedback, null);
      assert.equal(submission.deletedAt, null);
    });

    // 5. Test Unique Constraint on (assignmentId, studentId)
    await test("DB: Reject duplicate submission for the same student and assignment", async () => {
      await assert.rejects(
        async () => {
          await prisma.assignmentSubmission.create({
            data: {
              assignmentId: testAssignmentId,
              studentId: existingStudent.id,
              status: SubmissionStatus.SUBMITTED,
              storagePath: "duplicate.pdf",
              fileName: "duplicate.pdf",
              fileSize: 100,
              fileType: "application/pdf",
            },
          });
        },
        (err) => {
          assert.equal(err.code, "P2002", "Expected P2002 unique constraint violation");
          return true;
        },
      );
    });

    // 6. Test Resubmission / File Replacement (Update attemptCount)
    await test("DB: Update submission for resubmission workflow", async () => {
      const updated = await prisma.assignmentSubmission.update({
        where: { id: testSubmissionId },
        data: {
          fileName: "Jawaban_Tugas_Revisi.docx",
          storagePath: `assignments/submissions/${testAssignmentId}/${existingStudent.id}/revisi.docx`,
          fileSize: 350000,
          fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          status: SubmissionStatus.RESUBMITTED,
          attemptCount: { increment: 1 },
          submittedAt: new Date(),
        },
      });

      assert.equal(updated.attemptCount, 2);
      assert.equal(updated.status, SubmissionStatus.RESUBMITTED);
      assert.equal(updated.fileName, "Jawaban_Tugas_Revisi.docx");
    });

    // 7. Test Grading and Feedback Update
    await test("DB: Grade submission with score and feedback", async () => {
      const graderUser = await prisma.user.findFirst({
        where: { role: { name: "INSTRUCTOR" }, deletedAt: null },
      });

      const graded = await prisma.assignmentSubmission.update({
        where: { id: testSubmissionId },
        data: {
          score: 95.5,
          feedback: "Analisis diagram sangat mendalam dan terstruktur rapi.",
          status: SubmissionStatus.GRADED,
          gradedById: graderUser?.id ?? null,
          gradedAt: new Date(),
        },
        include: {
          gradedBy: { select: { id: true, name: true } },
        },
      });

      assert.equal(graded.score, 95.5);
      assert.equal(graded.status, SubmissionStatus.GRADED);
      assert.match(graded.feedback, /Analisis diagram sangat mendalam/);
    });

    // 8. Test Soft Delete Behavior
    await test("DB: Soft delete assignment and check deletedAt exclusion", async () => {
      const deletedAt = new Date();
      await prisma.assignment.update({
        where: { id: testAssignmentId },
        data: { deletedAt },
      });

      const activeAssignments = await prisma.assignment.findMany({
        where: { id: testAssignmentId, deletedAt: null },
      });
      assert.equal(activeAssignments.length, 0, "Soft-deleted assignment must not appear in active queries");

      const softDeleted = await prisma.assignment.findUnique({
        where: { id: testAssignmentId },
      });
      assert.ok(softDeleted?.deletedAt, "Record must retain deletedAt timestamp");
    });

    // 9. Test RBAC Permissions in Database
    await test("RBAC: Validate permissions assigned to INSTRUCTOR", async () => {
      const instructorRole = await prisma.role.findUnique({
        where: { name: "INSTRUCTOR" },
        include: { permissions: { include: { permission: true } } },
      });
      assert.ok(instructorRole, "INSTRUCTOR role must exist");
      const permNames = instructorRole.permissions.map((p) => p.permission.name);

      assert.ok(permNames.includes("assignment:create"), "Instructor must have assignment:create");
      assert.ok(permNames.includes("assignment:read"), "Instructor must have assignment:read");
      assert.ok(permNames.includes("assignment:update"), "Instructor must have assignment:update");
      assert.ok(permNames.includes("assignment-submission:read"), "Instructor must have assignment-submission:read");
      assert.ok(permNames.includes("assignment-submission:grade"), "Instructor must have assignment-submission:grade");

      // Negative check: Instructor must NOT have assignment:delete
      assert.ok(!permNames.includes("assignment:delete"), "Instructor must NOT have assignment:delete");
    });

    await test("RBAC: Validate permissions assigned to STUDENT", async () => {
      const studentRole = await prisma.role.findUnique({
        where: { name: "STUDENT" },
        include: { permissions: { include: { permission: true } } },
      });
      assert.ok(studentRole, "STUDENT role must exist");
      const permNames = studentRole.permissions.map((p) => p.permission.name);

      assert.ok(permNames.includes("assignment:read"), "Student must have assignment:read");
      assert.ok(permNames.includes("assignment-submission:create"), "Student must have assignment-submission:create");
      assert.ok(permNames.includes("assignment-submission:read"), "Student must have assignment-submission:read");

      // Negative checks: Student must NOT have administrative permissions
      assert.ok(!permNames.includes("assignment:create"), "Student must NOT have assignment:create");
      assert.ok(!permNames.includes("assignment:update"), "Student must NOT have assignment:update");
      assert.ok(!permNames.includes("assignment:delete"), "Student must NOT have assignment:delete");
      assert.ok(!permNames.includes("assignment-submission:grade"), "Student must NOT have assignment-submission:grade");
    });

    await test("RBAC: Validate SUPER_ADMIN and ADMIN have full assignment permissions", async () => {
      for (const roleName of ["SUPER_ADMIN", "ADMIN"]) {
        const role = await prisma.role.findUnique({
          where: { name: roleName },
          include: { permissions: { include: { permission: true } } },
        });
        assert.ok(role, `${roleName} role must exist`);
        const permNames = role.permissions.map((p) => p.permission.name);

        const requiredPerms = [
          "assignment:create",
          "assignment:read",
          "assignment:update",
          "assignment:delete",
          "assignment-submission:create",
          "assignment-submission:read",
          "assignment-submission:grade",
          "assignment-submission:delete",
        ];
        for (const req of requiredPerms) {
          assert.ok(permNames.includes(req), `${roleName} must have ${req}`);
        }
      }
    });
  } finally {
    // Cleanup temporary test records
    if (testSubmissionId) {
      await prisma.assignmentSubmission.deleteMany({ where: { id: testSubmissionId } });
    }
    if (testAssignmentId) {
      await prisma.assignment.deleteMany({ where: { id: testAssignmentId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n==================================================`);
  console.log(`ALL DATA & RBAC FOUNDATION TESTS: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
