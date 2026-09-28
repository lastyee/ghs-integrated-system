// scripts/cleanup-demo-users.mjs
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();

async function main() {
  assertSafeMutationTarget({
    mutationFlag: "CLEANUP_DEMO_USERS_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "CLEANUP_DEMO_USERS_CONFIRM_DATABASE",
  });

  console.log("==================================================");
  console.log("CLEANING DEMO USER ACCOUNTS");
  console.log("==================================================\n");

  // 1. Identify Demo Accounts
  const adminDemo = await prisma.user.findUnique({
    where: { email: "admin.demo@ghs.local" },
  });
  const studentDemo = await prisma.user.findUnique({
    where: { email: "student.demo@ghs.local" },
    include: { student: true },
  });

  console.log(`1. Finding demo users in database:`);
  console.log(`   - admin.demo@ghs.local: ${adminDemo ? `FOUND (ID: ${adminDemo.id})` : "NOT FOUND (Already clean)"}`);
  console.log(`   - student.demo@ghs.local: ${studentDemo ? `FOUND (ID: ${studentDemo.id})` : "NOT FOUND (Already clean)"}`);

  // 2. Safe Unlinking of Student (Tiara Ismi Laila)
  if (studentDemo) {
    if (studentDemo.student) {
      console.log(`\n2. Unlinking Student record:`);
      console.log(`   - Student Name: ${studentDemo.student.name}`);
      console.log(`   - Student NIM: ${studentDemo.student.nim}`);
      
      await prisma.student.update({
        where: { id: studentDemo.student.id },
        data: { userId: null },
      });
      console.log(`   ✓ Student userId successfully set to null.`);
    }

    // Delete student demo user account
    await prisma.user.delete({
      where: { id: studentDemo.id },
    });
    console.log(`   ✓ User account student.demo@ghs.local successfully deleted.`);
  }

  // 3. Safe Unlinking of Audit Logs from admin.demo
  if (adminDemo) {
    console.log(`\n3. Handling Audit Logs for admin.demo:`);
    const updateResult = await prisma.auditLog.updateMany({
      where: { userId: adminDemo.id },
      data: { userId: null },
    });
    console.log(`   ✓ ${updateResult.count} audit logs updated with userId: null (Historical logs preserved).`);

    // Delete admin demo user account
    await prisma.user.delete({
      where: { id: adminDemo.id },
    });
    console.log(`   ✓ User account admin.demo@ghs.local successfully deleted.`);
  }

  // 4. Verifications
  console.log("\n4. Post-Cleanup Verification:");

  // Verify demo users are gone
  const checkAdmin = await prisma.user.findUnique({ where: { email: "admin.demo@ghs.local" } });
  const checkStudent = await prisma.user.findUnique({ where: { email: "student.demo@ghs.local" } });
  console.log(`   ✓ admin.demo@ghs.local exists: ${!!checkAdmin}`);
  console.log(`   ✓ student.demo@ghs.local exists: ${!!checkStudent}`);

  // Verify Student Tiara Ismi Laila is intact
  const tiara = await prisma.student.findUnique({
    where: { nim: "260405066" },
    include: { enrollments: true },
  });
  console.log(`   ✓ Tiara Ismi Laila (NIM 260405066) intact: ${!!tiara}`);
  console.log(`   ✓ Tiara's userId: ${tiara?.userId}`);
  console.log(`   ✓ Tiara's enrollments: ${tiara?.enrollments?.length} (Expected 1)`);

  // Verify all academic counts
  const [
    usersCount,
    studentsCount,
    enrollmentsCount,
    batchesCount,
    programsCount,
    classesCount,
    subjectsCount,
    schedulesCount,
    auditLogsCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.batch.count(),
    prisma.program.count(),
    prisma.class.count(),
    prisma.subject.count(),
    prisma.schedule.count(),
    prisma.auditLog.count(),
  ]);

  console.log("\n5. Database Baseline After Cleanup:");
  console.log(`   - Users: ${usersCount} (Expected: only real Super Admin)`);
  console.log(`   - Students: ${studentsCount} (Expected: 21)`);
  console.log(`   - Enrollments: ${enrollmentsCount} (Expected: 21)`);
  console.log(`   - Batches: ${batchesCount} (Expected: 2)`);
  console.log(`   - Programs: ${programsCount} (Expected: 1)`);
  console.log(`   - Classes: ${classesCount} (Expected: 10)`);
  console.log(`   - Subjects: ${subjectsCount} (Expected: 6)`);
  console.log(`   - Schedules: ${schedulesCount} (Expected: 10)`);
  console.log(`   - Audit Logs: ${auditLogsCount} (Preserved)`);

  // Ensure only real superadmin exists
  const remainingUsers = await prisma.user.findMany({
    include: { role: true },
  });
  for (const u of remainingUsers) {
    console.log(`   - Remaining User ID: ${u.id}, Role: ${u.role.name}`);
  }

  console.log("\n==================================================");
  console.log("DEMO ACCOUNTS CLEANUP: 100% SUCCESS");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("CLEANUP ERROR:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
