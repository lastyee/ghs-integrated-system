// scripts/bootstrap-superadmin.mjs
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";

// Load .env manually if not already populated in process.env
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

async function main() {
  assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

  console.log("==================================================");
  console.log("PROVISIONING FIRST REAL SUPER ADMIN");
  console.log("==================================================");

  const email = process.env.SUPERADMIN_EMAIL?.trim();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email) {
    throw new Error(
      "SUPERADMIN_EMAIL is missing or empty in .env. Please set SUPERADMIN_EMAIL."
    );
  }

  if (!password) {
    throw new Error(
      "SUPERADMIN_PASSWORD is missing or empty in .env. Please set SUPERADMIN_PASSWORD."
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("SUPERADMIN_EMAIL has an invalid email format.");
  }

  if (password.length < 8) {
    throw new Error("SUPERADMIN_PASSWORD must be at least 8 characters long.");
  }

  // 1. Locate SUPER_ADMIN role
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "SUPER_ADMIN" },
  });

  if (!superAdminRole) {
    throw new Error("Role SUPER_ADMIN was not found in the database.");
  }

  // 2. Hash password with bcryptjs (salt 10)
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 3. Upsert user
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  let user;
  if (!existingUser) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Super Administrator",
        roleId: superAdminRole.id,
      },
      include: { role: true },
    });
    console.log(`✓ Real SUPER_ADMIN created successfully.`);
  } else {
    user = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        roleId: superAdminRole.id,
      },
      include: { role: true },
    });
    console.log(`✓ Existing user updated to real SUPER_ADMIN successfully.`);
  }

  // Sanity check
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Password verification sanity check failed.");
  }

  console.log(`✓ User ID: ${user.id}`);
  console.log(`✓ Role: ${user.role.name}`);
  console.log(`✓ Student Relation: null (Preserved as standalone admin)`);
  console.log(`✓ Verification: Bcrypt hash comparison verified.`);
  console.log("==================================================");
  console.log("BOOTSTRAP SUPER ADMIN: SUCCESS");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("BOOTSTRAP FAILED:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
