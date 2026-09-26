/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function verify() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  const instructors = await prisma.instructor.findMany({ select: { id: true, name: true, userId: true } });
  const programs = await prisma.program.findMany();
  const batches = await prisma.batch.findMany({ select: { id: true, name: true } });
  const students = await prisma.student.findMany();
  const enrollments = await prisma.enrollment.findMany();
  const subjects = await prisma.subject.findMany({ select: { id: true, code: true, name: true } });
  const classes = await prisma.class.findMany({ select: { id: true, name: true, batchId: true } });
  const schedules = await prisma.schedule.findMany({
    include: {
      class: {
        include: {
          batch: true,
        },
      },
      subject: true,
      instructor: true,
    },
    orderBy: [
      { date: "asc" },
      { startTime: "asc" },
    ],
  });

  const ghi07Schedules = schedules.filter(s => s.class?.batch?.name === "GHI-07");
  const ghi08Schedules = schedules.filter(s => s.class?.batch?.name === "GHI-08");

  console.log("=== COUNTS ===");
  console.log("Users:", users.length);
  console.log("Instructors:", instructors.length);
  console.log("Programs:", programs.length);
  console.log("Batches:", batches.length);
  console.log("Students:", students.length);
  console.log("Enrollments:", enrollments.length);
  console.log("Subjects:", subjects.length);
  console.log("Classes:", classes.length);
  console.log("Schedules:", schedules.length);
  console.log("GHI-07 Schedules:", ghi07Schedules.length);
  console.log("GHI-08 Schedules:", ghi08Schedules.length);

  console.log("\n=== USERS ===");
  users.forEach(u => console.log(`- ${u.email} (${u.name})`));

  console.log("\n=== INSTRUCTORS ===");
  instructors.forEach(i => console.log(`- ${i.name} (userId: ${i.userId})`));

  console.log("\n=== SUBJECTS ===");
  subjects.forEach(s => console.log(`- [${s.code}] ${s.name}`));

  console.log("\n=== SCHEDULE TABLE ===");
  console.log("| Batch | Date | Start | End | Subject | Instructor | Room | Dresscode | Topic | Status |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");

  // Sort GHI-07 then GHI-08 or chronological
  const sortedSchedules = [
    ...ghi07Schedules.sort((a,b) => a.date - b.date || a.startTime - b.startTime),
    ...ghi08Schedules.sort((a,b) => a.date - b.date || a.startTime - b.startTime)
  ];

  for (const s of sortedSchedules) {
    const batch = s.class?.batch?.name || "-";
    const date = s.date.toISOString().split("T")[0];
    const start = s.startTime.toISOString().split("T")[1].substring(0, 5);
    const end = s.endTime.toISOString().split("T")[1].substring(0, 5);
    const subject = s.subject.name;
    const instructor = s.instructor.name;
    const room = s.room;
    const dress = s.dressCode;
    const topic = s.topic ? s.topic : "null";
    const status = s.status;
    console.log(`| ${batch} | ${date} | ${start} | ${end} | ${subject} | ${instructor} | ${room} | ${dress} | ${topic} | ${status} |`);
  }
}

verify().catch(console.error).finally(() => prisma.$disconnect());
