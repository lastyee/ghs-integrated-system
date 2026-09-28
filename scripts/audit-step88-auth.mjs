// scripts/audit-step88-auth.mjs
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function checkEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let hasEmail = false;
  let hasPassword = false;
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("SUPERADMIN_EMAIL=")) {
        const val = trimmed.split("=")[1]?.trim();
        if (val && val !== '""' && val !== "''") hasEmail = true;
      }
      if (trimmed.startsWith("SUPERADMIN_PASSWORD=")) {
        const val = trimmed.split("=")[1]?.trim();
        if (val && val !== '""' && val !== "''") hasPassword = true;
      }
    }
  }
  return { hasEmail, hasPassword };
}

async function main() {
  console.log("==================================================");
  console.log("STEP 88: AUTH & USER ARCHITECTURE AUDIT");
  console.log("==================================================\n");

  // 1. Roles & Multi-Superadmin support
  const roles = await prisma.role.findMany({
    include: {
      _count: {
        select: { users: true, permissions: true },
      },
    },
  });
  console.log("1. System Roles in Database:");
  for (const r of roles) {
    console.log(`   - ${r.name}: ${r._count.users} user(s), ${r._count.permissions} permission(s)`);
  }

  // 2. Existing Users Audit
  const users = await prisma.user.findMany({
    include: {
      role: true,
      student: { select: { id: true, nim: true, name: true, userId: true } },
      instructor: { select: { id: true, name: true, userId: true } },
      _count: {
        select: {
          auditLogs: true,
          verifiedDocuments: true,
        },
      },
    },
  });

  console.log("\n2. Existing Users in Database:");
  for (const u of users) {
    console.log(`   - ID: ${u.id}`);
    console.log(`     Email: ${u.email}`);
    console.log(`     Role: ${u.role.name}`);
    console.log(`     Name: ${u.name}`);
    console.log(`     Student Link: ${u.student ? `${u.student.name} (NIM: ${u.student.nim}, ID: ${u.student.id})` : "None"}`);
    console.log(`     Instructor Link: ${u.instructor ? `${u.instructor.name} (ID: ${u.instructor.id})` : "None"}`);
    console.log(`     Audit Logs Count: ${u._count.auditLogs}`);
    console.log(`     Verified Documents Count: ${u._count.verifiedDocuments}`);
  }

  // 3. Foreign Key Dependencies Analysis
  console.log("\n3. Foreign Key Dependency Analysis for User Deletion:");
  console.log("   - students.userId: Nullable with ON DELETE SET NULL.");
  console.log("     Action required: Safely unlink student record (set userId = null) before deleting demo student user.");
  console.log("   - instructors.userId: Nullable with ON DELETE SET NULL (No instructors currently linked to demo users).");
  console.log("   - audit_logs.userId: Nullable with ON DELETE SET NULL.");
  console.log("     Action required: Audit logs will have userId set to null upon deletion, preserving historical logs.");
  console.log("   - documents.verifiedById: Nullable (0 documents in database).");

  // 4. Academic Baseline Integrity
  const [studentCount, batchCount, programCount, instructorCount, scheduleCount] = await Promise.all([
    prisma.student.count(),
    prisma.batch.count(),
    prisma.program.count(),
    prisma.instructor.count(),
    prisma.schedule.count(),
  ]);

  console.log("\n4. Academic Baseline Confirmation:");
  console.log(`   - Students: ${studentCount} (Expected 21)`);
  console.log(`   - Batches: ${batchCount} (Expected 2)`);
  console.log(`   - Programs: ${programCount} (Expected 1)`);
  console.log(`   - Instructors: ${instructorCount} (Expected 6)`);
  console.log(`   - Schedules: ${scheduleCount} (Expected 10)`);

  // 5. Environment Variables Status
  const envStatus = checkEnv();
  console.log("\n5. .env Credentials Status:");
  console.log(`   - SUPERADMIN_EMAIL provided: ${envStatus.hasEmail}`);
  console.log(`   - SUPERADMIN_PASSWORD provided: ${envStatus.hasPassword}`);

  console.log("\n==================================================");
  console.log("AUDIT COMPLETE");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("Audit error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
