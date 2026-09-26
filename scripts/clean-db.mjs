import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.assessmentScore.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.schedule.deleteMany({ where: { class: { name: { contains: "82" } } } });
  await prisma.class.deleteMany({ where: { name: { contains: "82" } } });
  await prisma.certificate.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.application.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: ".test82@ghs.local" } } });

  const [u, i, pr, b, st, e, su, c, sc, em, v, a, it, pl, d, ce] = await Promise.all([
    prisma.user.count(),
    prisma.instructor.count(),
    prisma.program.count(),
    prisma.batch.count(),
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.subject.count(),
    prisma.class.count(),
    prisma.schedule.count(),
    prisma.employer.count(),
    prisma.vacancy.count(),
    prisma.application.count(),
    prisma.interview.count(),
    prisma.placement.count(),
    prisma.document.count(),
    prisma.certificate.count(),
  ]);

  console.log("BASELINE VERIFICATION:", JSON.stringify({
    users: u, instructors: i, programs: pr, batches: b, students: st,
    enrollments: e, subjects: su, classes: c, schedules: sc, employers: em,
    vacancies: v, applications: a, interviews: it, placements: pl,
    documents: d, certificates: ce,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
