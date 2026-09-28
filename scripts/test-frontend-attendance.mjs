import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "TEST_FRONTEND_ATTENDANCE_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "TEST_FRONTEND_ATTENDANCE_CONFIRM_DATABASE",
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
  console.log("=== ATTENDANCE FRONTEND VERIFICATION ===\n");

  // 1. Static check on components
  const pageCode = readFileSync("components/attendance/attendance-page.tsx", "utf-8");
  const detailCode = readFileSync("components/attendance/attendance-session-detail.tsx", "utf-8");

  record("attendance-page.tsx does not import mock-data", true, !pageCode.includes("mock-data"));
  record("attendance-page.tsx does not use managedAttendanceRecords", true, !pageCode.includes("managedAttendanceRecords"));
  record("attendance-page.tsx does not use legacy EXCUSED", true, !/\bEXCUSED\b/.test(pageCode));

  record("attendance-session-detail.tsx does not import mock-data", true, !detailCode.includes("mock-data"));
  record("attendance-session-detail.tsx does not use managedAttendanceRecords", true, !detailCode.includes("managedAttendanceRecords"));
  record("attendance-session-detail.tsx does not use legacy EXCUSED", true, !/\bEXCUSED\b/.test(detailCode));

  // Check state handling
  record("attendance-page.tsx handles loading state", true, pageCode.includes("Memuat sesi absensi"));
  record("attendance-page.tsx handles unauthorized state", true, pageCode.includes("Akses Ditolak"));
  record("attendance-page.tsx handles error state", true, pageCode.includes("Gagal Memuat Data"));
  record("attendance-page.tsx handles empty state", true, pageCode.includes("Tidak Ada Sesi"));

  record("attendance-session-detail.tsx handles loading state", true, detailCode.includes("Memuat sesi absensi"));
  record("attendance-session-detail.tsx handles unauthorized state", true, detailCode.includes("Akses Ditolak"));
  record("attendance-session-detail.tsx handles not found state", true, detailCode.includes("Sesi Tidak Ditemukan"));

  // 2. HTTP SSR route testing
  const unauthRes = await request("/attendance", { redirect: "manual" });
  record("Unauthenticated /attendance redirects to login", true, unauthRes.status === 307 || unauthRes.status === 302);

  const superAdminPassword = process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
  const cookies = await login("admin.demo@ghs.local", superAdminPassword);

  const authPageRes = await request("/attendance", {
    headers: { Cookie: cookies },
  });
  record("Authenticated /attendance returns 200", 200, authPageRes.status);
  const pageHtml = await authPageRes.text();
  record("HTML renders Attendance title", true, pageHtml.includes("Attendance"));

  const sampleSchedule = await prisma.schedule.findFirst();
  const authDetailRes = await request(`/attendance/schedule/${sampleSchedule.id}`, {
    headers: { Cookie: cookies },
  });
  record(`Authenticated /attendance/schedule/${sampleSchedule.id} returns 200`, 200, authDetailRes.status);
  const detailHtml = await authDetailRes.text();
  record("HTML renders Attendance Session title", true, detailHtml.includes("Attendance Session"));

  console.log("\nALL FRONTEND VERIFICATION CHECKS PASSED!");
}

run()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
