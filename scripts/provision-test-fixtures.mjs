// scripts/provision-test-fixtures.mjs
// Creates temporary test fixtures needed for regression test suite.
// These are test-only accounts; they are NOT demo accounts.
// Must be cleaned up after testing via cleanup-test-fixtures.mjs.
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}
loadEnv();

const prisma = new PrismaClient();

// Fixed passwords for test fixtures (NOT production)
const TEST_ADMIN_EMAIL = "admin.demo@ghs.local";
const TEST_STUDENT_EMAIL = "student.demo@ghs.local";
const TEST_ADMIN_PASS = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
const TEST_STUDENT_PASS = process.env.DEMO_STUDENT_PASSWORD || "murid123";

async function main() {
  assertSafeMutationTarget({
    mutationFlag: "PROVISION_TEST_FIXTURES_ALLOW_MUTATIONS",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "PROVISION_TEST_FIXTURES_CONFIRM_DATABASE",
  });

  console.log("==================================================");
  console.log("PROVISIONING REGRESSION TEST FIXTURES");
  console.log("==================================================\n");

  const superAdminRole = await prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } });
  const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });

  if (!superAdminRole || !studentRole) {
    throw new Error("Required roles not found in database.");
  }

  const adminHash = await bcrypt.hash(TEST_ADMIN_PASS, 10);
  const studentHash = await bcrypt.hash(TEST_STUDENT_PASS, 10);

  // Create test admin fixture
  const adminFixture = await prisma.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: { passwordHash: adminHash, roleId: superAdminRole.id },
    create: {
      email: TEST_ADMIN_EMAIL,
      name: "Test Fixture Super Admin",
      passwordHash: adminHash,
      roleId: superAdminRole.id,
    },
    include: { role: true },
  });
  console.log(`✓ Test Admin Fixture: ${adminFixture.email} (${adminFixture.role.name})`);

  // Create test student user fixture
  const studentFixture = await prisma.user.upsert({
    where: { email: TEST_STUDENT_EMAIL },
    update: { passwordHash: studentHash, roleId: studentRole.id },
    create: {
      email: TEST_STUDENT_EMAIL,
      name: "Test Fixture Student",
      passwordHash: studentHash,
      roleId: studentRole.id,
    },
    include: { role: true, student: true },
  });
  console.log(`✓ Test Student Fixture: ${studentFixture.email} (${studentFixture.role.name})`);

  // Link student fixture to TIARA ISMI LAILA (NIM 260405066) if not already linked
  const tiara = await prisma.student.findUnique({ where: { nim: "260405066" } });
  if (tiara && tiara.userId === null) {
    await prisma.student.update({
      where: { id: tiara.id },
      data: { userId: studentFixture.id },
    });
    console.log(`✓ Linked student fixture to TIARA ISMI LAILA (NIM 260405066)`);
  } else if (tiara && tiara.userId === studentFixture.id) {
    console.log(`✓ TIARA ISMI LAILA already linked to test student fixture`);
  } else {
    console.log(`  Note: TIARA ISMI LAILA link status: ${tiara?.userId ? "linked to another user" : "not found"}`);
  }

  const userCount = await prisma.user.count();
  console.log(`\n✓ Total users after fixture provisioning: ${userCount}`);
  console.log("\n==================================================");
  console.log("TEST FIXTURES PROVISIONED SUCCESSFULLY");
  console.log("Run: npm run test:regression");
  console.log("Then run: node scripts/cleanup-test-fixtures.mjs");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("FIXTURE PROVISIONING ERROR:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
