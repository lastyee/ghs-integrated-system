import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("==================================================");
  console.log("STEP 84C: DATABASE BASELINE INTEGRITY AUDIT");
  console.log("==================================================");

  // 1. Exact model counts
  const [
    users,
    instructors,
    programs,
    batches,
    students,
    enrollments,
    subjects,
    classes,
    schedules,
    employers,
    vacancies,
    applications,
    interviews,
    placements,
    documents,
    certificates,
  ] = await Promise.all([
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

  const counts = {
    users,
    instructors,
    programs,
    batches,
    students,
    enrollments,
    subjects,
    classes,
    schedules,
    employers,
    vacancies,
    applications,
    interviews,
    placements,
    documents,
    certificates,
  };

  console.log("\n1. Current Database Table Counts:");
  console.log(JSON.stringify(counts, null, 2));

  // Expected baseline
  const expected = {
    users: 1, // Updated in STEP 88: demo accounts removed, only real SUPER_ADMIN remains
    instructors: 6,
    programs: 1,
    batches: 2,
    students: 21,
    enrollments: 21,
    subjects: 6,
    classes: 10,
    schedules: 10,
    employers: 0,
    vacancies: 0,
    applications: 0,
    interviews: 0,
    placements: 0,
    documents: 0,
    certificates: 0,
  };

  let countsMatch = true;
  for (const [key, expVal] of Object.entries(expected)) {
    if (counts[key] !== expVal) {
      console.error(`MISMATCH: ${key} = ${counts[key]}, expected ${expVal}`);
      countsMatch = false;
    }
  }

  if (countsMatch) {
    console.log("✓ ALL 16 MODEL COUNTS EXACTLY MATCH BASELINE.");
  } else {
    console.error("✗ DATABASE BASELINE MISMATCH DETECTED!");
  }

  // 2. Batch breakdown: GHI-07 and GHI-08
  console.log("\n2. Batch Breakdown & Student Counts:");
  const batchRecords = await prisma.batch.findMany({
    include: {
      enrollments: {
        include: {
          student: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const batchCounts = {};
  for (const b of batchRecords) {
    batchCounts[b.name] = b.enrollments.length;
    console.log(`- Batch ${b.name}: ${b.enrollments.length} enrollments`);
  }

  const ghi07Count = batchCounts["GHI-07"] || 0;
  const ghi08Count = batchCounts["GHI-08"] || 0;

  const batchMatch = ghi07Count === 12 && ghi08Count === 9;
  if (batchMatch) {
    console.log(`✓ GHI-07 = ${ghi07Count} (expected 12), GHI-08 = ${ghi08Count} (expected 9). Sum = ${ghi07Count + ghi08Count} (expected 21).`);
  } else {
    console.error(`✗ BATCH BREAKDOWN MISMATCH! GHI-07: ${ghi07Count} (exp 12), GHI-08: ${ghi08Count} (exp 9)`);
  }

  // 3. Referential integrity verification
  console.log("\n3. Referential Integrity Check:");

  // 3a. All 21 students have enrollment
  const allStudents = await prisma.student.findMany({
    include: { enrollments: true },
  });
  const studentsWithoutEnrollment = allStudents.filter(s => s.enrollments.length === 0);
  console.log(`- Students without enrollment: ${studentsWithoutEnrollment.length}`);

  // 3b. Enrollments pointing to invalid student or batch
  const allEnrollments = await prisma.enrollment.findMany({
    include: { student: true, batch: true },
  });
  const orphanEnrollments = allEnrollments.filter(e => !e.student || !e.batch);
  console.log(`- Orphan enrollments (missing student or batch): ${orphanEnrollments.length}`);

  // 3c. Schedules pointing to invalid class, subject, or instructor
  const allSchedules = await prisma.schedule.findMany({
    include: { class: true, subject: true, instructor: true },
  });
  const orphanSchedules = allSchedules.filter(s => !s.class || !s.subject || !s.instructor);
  console.log(`- Orphan schedules (missing class, subject, or instructor): ${orphanSchedules.length}`);

  // 3d. Classes pointing to invalid batch
  const allClasses = await prisma.class.findMany({
    include: { batch: true },
  });
  const orphanClasses = allClasses.filter(c => !c.batch);
  console.log(`- Orphan classes (missing batch): ${orphanClasses.length}`);

  // 3e. Users breakdown
  const allUsers = await prisma.user.findMany({
    include: { role: true, student: true },
  });
  console.log(`- Users in system: ${allUsers.map(u => `${u.email} (${u.role.name})`).join(", ")} [Real SUPER_ADMIN only after STEP 88]`);

  const refIntegrityPass =
    studentsWithoutEnrollment.length === 0 &&
    orphanEnrollments.length === 0 &&
    orphanSchedules.length === 0 &&
    orphanClasses.length === 0;

  if (refIntegrityPass) {
    console.log("✓ REFERENTIAL INTEGRITY: 100% VALID. ZERO ORPHANS.");
  } else {
    console.error("✗ REFERENTIAL INTEGRITY FAILURES DETECTED!");
  }

  // Summary
  const overallPass = countsMatch && batchMatch && refIntegrityPass;
  console.log("\n==================================================");
  console.log(`STEP 84C VERIFICATION RESULT: ${overallPass ? "PASS" : "FAILED"}`);
  console.log("==================================================");

  await prisma.$disconnect();
  process.exit(overallPass ? 0 : 1);
}

main().catch(err => {
  console.error("Error executing baseline verification:", err);
  process.exit(1);
});
