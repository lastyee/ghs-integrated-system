// scripts/verify-real-superadmin-login.mjs
import fs from "fs";
import path from "path";
import {
  assertSafeLocalApplicationTarget,
  assertSafeLocalDatabase,
} from "./lib/test-safety.mjs";

// Load .env
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

const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });
assertSafeLocalApplicationTarget({ baseUrl });

function mergeCookies(existingCookies, response) {
  const getSetCookie = response.headers.getSetCookie?.();
  const rawSetCookie =
    getSetCookie || [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();

  if (existingCookies) {
    existingCookies.split(";").forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(
          trimmed.slice(0, idx).trim(),
          trimmed.slice(idx + 1).trim()
        );
      }
    });
  }

  rawSetCookie.forEach((headerVal) => {
    headerVal.split(",").forEach((single) => {
      const part = single.split(";")[0].trim();
      const idx = part.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
    });
  });

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${baseUrl}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  if (response.status !== 302 && response.status !== 303 && response.status !== 200) {
    throw new Error(`Login failed for [REDACTED]: HTTP ${response.status}`);
  }
  return cookies;
}

async function main() {
  console.log("==================================================");
  console.log("REAL SUPER ADMIN LOGIN & CAPABILITIES VERIFICATION");
  console.log("==================================================\n");

  const email = process.env.SUPERADMIN_EMAIL?.trim();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD in environment.");
  }

  // 1. Perform Login
  const authCookies = await login(email, password);
  console.log("1. Login HTTP Authentication:");
  console.log("   ✓ REAL SUPER_ADMIN_LOGIN = PASS");

  // 2. Verify Session
  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: authCookies },
  });
  const session = await sessionRes.json();

  if (!session?.user) {
    throw new Error("Failed to retrieve valid session after login.");
  }

  console.log("\n2. Session Verification:");
  console.log(`   ✓ Authenticated: true`);
  console.log(`   ✓ Role: ${session.user.role}`);
  console.log(`   ✓ User ID: ${session.user.id}`);
  console.log(`   ✓ passwordHash in session: ${"passwordHash" in session.user ? "LEAKED!" : "None (SAFE)"}`);

  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error(`Expected role SUPER_ADMIN, received: ${session.user.role}`);
  }

  // Helper for authenticated GET requests
  async function testRoute(name, url, expectedStatus = 200) {
    const res = await fetch(`${baseUrl}${url}`, {
      headers: { Cookie: authCookies },
    });
    const statusPass = res.status === expectedStatus;
    console.log(`   - [${res.status}] ${name} (${url}) -> ${statusPass ? "PASS" : "FAIL"}`);
    if (!statusPass) {
      throw new Error(`Route check failed: ${name} returned ${res.status}, expected ${expectedStatus}`);
    }
    return res;
  }

  // 3. Test Dashboard & UI Routes
  console.log("\n3. Testing Dashboard & Administrative Pages:");
  await testRoute("Super Admin Dashboard", "/dashboard");
  await testRoute("Management Dashboard", "/dashboard/management");
  await testRoute("User Management Page", "/users");

  // 4. Test User Management API & Secret Leak Prevention
  console.log("\n4. Testing User Management API Security:");
  const usersRes = await testRoute("Users API Endpoint", "/api/users");
  const usersData = await usersRes.json();
  console.log(`   ✓ Total Users in API: ${usersData.stats?.totalUsers}`);
  
  let leakDetected = false;
  for (const u of usersData.users || []) {
    if ("passwordHash" in u || "password" in u) {
      leakDetected = true;
    }
  }
  console.log(`   ✓ passwordHash exposed in Users API: ${leakDetected ? "LEAK DETECTED!" : "0 (SAFE)"}`);
  if (leakDetected) {
    throw new Error("Security Violation: passwordHash exposed in API response!");
  }

  // 5. Test Academic Modules
  console.log("\n5. Testing Academic Modules Access:");
  await testRoute("Students API", "/api/students");
  await testRoute("Programs API", "/api/programs");
  await testRoute("Batches API", "/api/batches");
  await testRoute("Classes API", "/api/classes");
  await testRoute("Subjects API", "/api/subjects");
  await testRoute("Schedules API", "/api/schedules");

  // 6. Test Placement Modules
  console.log("\n6. Testing Placement Modules Access:");
  await testRoute("Employers API", "/api/employers");
  await testRoute("Vacancies API", "/api/vacancies");
  await testRoute("Applications API", "/api/applications");
  await testRoute("Interviews API", "/api/interviews");
  await testRoute("Placements API", "/api/placements");

  // 7. Test Reports Modules
  console.log("\n7. Testing Reports Modules Access:");
  await testRoute("Academic Reports API", "/api/reports/academic");
  await testRoute("Attendance Reports API", "/api/reports/attendance");
  await testRoute("Placement Reports API", "/api/reports/placement");

  // 8. Test Certificate Management
  console.log("\n8. Testing Certificate Management Access:");
  await testRoute("Certificates API", "/api/certificates");

  console.log("\n==================================================");
  console.log("ALL REAL SUPER ADMIN VERIFICATIONS: 100% PASS");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("VERIFICATION ERROR:", err.message);
  process.exit(1);
});
