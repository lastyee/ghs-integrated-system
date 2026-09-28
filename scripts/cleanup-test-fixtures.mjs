// scripts/cleanup-test-fixtures.mjs
// Removes temporary regression test fixture accounts after testing.
// Preserves all academic data and the real SUPER_ADMIN.
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();

const TEST_ADMIN_EMAIL = "admin.demo@ghs.local";
const TEST_STUDENT_EMAIL = "student.demo@ghs.local";

async function main() {
  assertSafeMutationTarget({
    mutationFlag: "CLEANUP_TEST_FIXTURES_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "CLEANUP_TEST_FIXTURES_CONFIRM_DATABASE",
  });

  console.log("==================================================");
  console.log("CLEANING UP REGRESSION TEST FIXTURES");
  console.log("==================================================\n");

  // Unlink student fixture from TIARA before deleting user
  const studentFixture = await prisma.user.findUnique({
    where: { email: TEST_STUDENT_EMAIL },
    include: { student: true },
  });

  if (studentFixture) {
    if (studentFixture.student) {
      await prisma.student.update({
        where: { id: studentFixture.student.id },
        data: { userId: null },
      });
      console.log(`✓ Unlinked ${studentFixture.student.name} from test student fixture`);
    }
    await prisma.user.delete({ where: { email: TEST_STUDENT_EMAIL } });
    console.log(`✓ Deleted test fixture: ${TEST_STUDENT_EMAIL}`);
  } else {
    console.log(`  ${TEST_STUDENT_EMAIL}: Not found (already cleaned up)`);
  }

  // Null out audit logs from test admin before deleting
  const adminFixture = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
  if (adminFixture) {
    const updated = await prisma.auditLog.updateMany({
      where: { userId: adminFixture.id },
      data: { userId: null },
    });
    console.log(`✓ Nulled ${updated.count} audit log(s) from test admin fixture`);
    await prisma.user.delete({ where: { email: TEST_ADMIN_EMAIL } });
    console.log(`✓ Deleted test fixture: ${TEST_ADMIN_EMAIL}`);
  } else {
    console.log(`  ${TEST_ADMIN_EMAIL}: Not found (already cleaned up)`);
  }

  // Verify post-cleanup baseline
  const userCount = await prisma.user.count();
  const studentCount = await prisma.student.count();
  const tiara = await prisma.student.findUnique({ where: { nim: "260405066" } });

  console.log(`\n✓ Users remaining: ${userCount} (Expected: 1, real SUPER_ADMIN only)`);
  console.log(`✓ Students remaining: ${studentCount} (Expected: 21)`);
  console.log(`✓ TIARA ISMI LAILA userId: ${tiara?.userId ?? "null (safe)"}`);

  console.log("\n==================================================");
  console.log("TEST FIXTURES CLEANED UP SUCCESSFULLY");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("FIXTURE CLEANUP ERROR:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
