import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const enrollmentStatusCounts = await prisma.enrollment.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const studentStatusCounts = await prisma.student.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const studentCount = await prisma.student.count();
  const enrollmentCount = await prisma.enrollment.count();
  const assessmentCount = await prisma.assessment.count();
  const assessmentScoreCount = await prisma.assessmentScore.count();
  const attendanceCount = await prisma.attendance.count();
  const attendanceStatusCounts = await prisma.attendance.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const assignmentCount = await prisma.assignment.count();
  const submissionCount = await prisma.assignmentSubmission.count();
  const submissionStatusCounts = await prisma.assignmentSubmission.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const certCount = await prisma.certificate.count();

  console.log(
    JSON.stringify(
      {
        studentCount,
        studentStatusCounts,
        enrollmentCount,
        enrollmentStatusCounts,
        assessmentCount,
        assessmentScoreCount,
        attendanceCount,
        attendanceStatusCounts,
        assignmentCount,
        submissionCount,
        submissionStatusCounts,
        certCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

