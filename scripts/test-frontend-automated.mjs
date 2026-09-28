import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_FRONTEND_AUTOMATED_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_FRONTEND_AUTOMATED_CONFIRM_DATABASE",
});

function record(name, expected, actual, passCondition) {
  const pass = passCondition !== undefined ? Boolean(passCondition) : expected === actual;
  if (!pass) {
    throw new Error(`TEST FAILED: ${name}\nExpected: ${expected}\nActual: ${actual}`);
  }
  console.log(`✓ ${name}`);
}

function getCookies(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies.map((c) => c.split(";")[0]);
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

function mergeCookies(existing, response) {
  const values = new Map();
  for (const cookie of [...existing.split("; "), ...getCookies(response)]) {
    const separator = cookie.indexOf("=");
    if (separator > 0) values.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfResponse = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfResponse);
  const { csrfToken } = await csrfResponse.json();

  const response = await request("/api/auth/callback/credentials", {
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
  return cookies;
}

async function run() {
  console.log("=== FRONTEND AUTOMATED VERIFICATION ===\n");

  // 1. Static code check: No mock data in schedule components
  const schedulesPageCode = readFileSync("components/schedules/schedules-page.tsx", "utf-8");
  const scheduleDetailCode = readFileSync("components/schedules/schedule-detail.tsx", "utf-8");

  record("schedules-page.tsx does not import mock-data", true, !schedulesPageCode.includes("mock-data"));
  record("schedules-page.tsx does not use managedSchedules", true, !schedulesPageCode.includes("managedSchedules"));
  record("schedule-detail.tsx does not import mock-data", true, !scheduleDetailCode.includes("mock-data"));
  record("schedule-detail.tsx does not use managedSchedules", true, !scheduleDetailCode.includes("managedSchedules"));

  // Check state handling in schedules-page.tsx
  record("schedules-page.tsx implements loading state", true, schedulesPageCode.includes("Loading State"));
  record("schedules-page.tsx implements unauthorized state", true, schedulesPageCode.includes("Unauthorized State"));
  record("schedules-page.tsx implements error state", true, schedulesPageCode.includes("API Error State"));
  record("schedules-page.tsx implements empty state", true, schedulesPageCode.includes("Empty State"));
  record("schedules-page.tsx implements successful data rendering", true, schedulesPageCode.includes("Successful Data"));

  // Check detail handling in schedule-detail.tsx
  record("schedule-detail.tsx implements loading state", true, scheduleDetailCode.includes("Memuat detail jadwal"));
  record("schedule-detail.tsx implements unauthorized state", true, scheduleDetailCode.includes("Akses Ditolak"));
  record("schedule-detail.tsx implements not found state", true, scheduleDetailCode.includes("Jadwal Tidak Ditemukan"));
  record("schedule-detail.tsx displays room", true, scheduleDetailCode.includes("schedule.room"));
  record("schedule-detail.tsx displays dressCode", true, scheduleDetailCode.includes("schedule.dressCode"));
  record("schedule-detail.tsx displays topic", true, scheduleDetailCode.includes("schedule.topic"));

  // 2. HTTP Server SSR & Route protection check
  // Without cookies -> redirects to login
  const unauthPageRes = await request("/schedules", { redirect: "manual" });
  record("Unauthenticated /schedules redirects to login", true, unauthPageRes.status === 307 || unauthPageRes.status === 302);
  const location = unauthPageRes.headers.get("location");
  record("Redirect location contains /login", true, location?.includes("/login"));

  // Authenticate as Super Admin
  const adminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
  const adminCookies = await login("admin.demo@ghs.local", adminPassword);

  // Authenticated /schedules -> 200 OK
  const authPageRes = await request("/schedules", {
    headers: { Cookie: adminCookies },
  });
  record("Authenticated /schedules returns 200 OK", 200, authPageRes.status);
  const authHtml = await authPageRes.text();
  record("HTML renders Jadwal title", true, authHtml.includes("Jadwal"));

  // Authenticated /schedules/[id] -> 200 OK
  const sampleSchedule = await prisma.schedule.findFirst({
    where: { topic: "FINAL TEST" },
  });
  if (!sampleSchedule) throw new Error("Sample schedule with FINAL TEST not found!");

  const detailPageRes = await request(`/schedules/${sampleSchedule.id}`, {
    headers: { Cookie: adminCookies },
  });
  record(`Authenticated /schedules/${sampleSchedule.id} returns 200 OK`, 200, detailPageRes.status);
  const detailHtml = await detailPageRes.text();
  record("Detail HTML renders Detail Jadwal title", true, detailHtml.includes("Detail Jadwal"));

  console.log("\nALL FRONTEND AUTOMATED CHECKS PASSED!");
}

run()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
