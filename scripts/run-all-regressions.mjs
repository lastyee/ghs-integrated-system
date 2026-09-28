// scripts/run-all-regressions.mjs
import { execSync } from "child_process";
// Load the project's .env before the shared safety guard checks DATABASE_URL.
import "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const testScripts = [
  "scripts/test-step64e-schedule.mjs",
  "scripts/test-step65b-attendance.mjs",
  "scripts/test-step68c-employers-vacancies-frontend.mjs",
  "scripts/test-step69c-applications-frontend.mjs",
  "scripts/test-step70c-interviews-frontend.mjs",
  "scripts/test-step71c-placements-frontend.mjs",
  "scripts/test-step72a-full-application-flow.mjs",
  "scripts/test-step72c-final-e2e.mjs",
  "scripts/test-step73b-academic-core.mjs",
  "scripts/test-step73c-academic-core-frontend.mjs",
  "scripts/test-step73d-academic-core-e2e.mjs",
  "scripts/test-step74b-certificates-reports.mjs",
  "scripts/test-step74c-certificates-reports-frontend.mjs",
  "scripts/test-step74d-certificates-reports-e2e.mjs",
  "scripts/test-step78-human-ui.mjs",
];

const requiredSuitePrefixes = [
  "TEST_STEP64E_SCHEDULE",
  "TEST_STEP65B_ATTENDANCE",
  "TEST_STEP68C_EMPLOYERS_VACANCIES_FRONTEND",
  "TEST_STEP69C_APPLICATIONS_FRONTEND",
  "TEST_STEP70C_INTERVIEWS_FRONTEND",
  "TEST_STEP71C_PLACEMENTS_FRONTEND",
  "TEST_STEP72A_FULL_APPLICATION_FLOW",
  "TEST_STEP72C_FINAL_E2E",
  "TEST_STEP73B_ACADEMIC_CORE",
  "TEST_STEP73C_ACADEMIC_CORE_FRONTEND",
  "TEST_STEP73D_ACADEMIC_CORE_E2E",
  "TEST_STEP74B_CERTIFICATES_REPORTS",
  "TEST_STEP74C_CERTIFICATES_REPORTS_FRONTEND",
  "TEST_STEP74D_CERTIFICATES_REPORTS_E2E",
];

console.log(`Starting regression run across ${testScripts.length} suites...\n`);

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
assertSafeMutationTarget({
  mutationFlag: "RUN_ALL_REGRESSIONS_ALLOW_MUTATIONS",
  expectedDatabase: "ghs_integrated_test",
  baseUrl,
  confirmationFlag: "RUN_ALL_REGRESSIONS_CONFIRM_DATABASE",
});

const unconfirmedSuites = requiredSuitePrefixes.filter(
  (prefix) =>
    process.env[`${prefix}_ALLOW_MUTATIONS`] !== "YES" ||
    process.env[`${prefix}_CONFIRM_DATABASE`] !== "ghs_integrated_test"
);
if (unconfirmedSuites.length > 0) {
  throw new Error(
    `Refusing to start a partial regression run. Confirm every suite first: ${unconfirmedSuites.join(", ")}`
  );
}

let totalPassedSuites = 0;

for (const script of testScripts) {
  process.stdout.write(`Running ${script}... `);
  try {
    const output = execSync(`node ${script}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    totalPassedSuites++;
    // Extract summary count if available
    const match = output.match(/(\d+)\/(\d+)\s+PASSED/i) || output.match(/PASSED.*?(\d+)/i);
    const countInfo = match ? `(${match[0]})` : "(PASS)";
    console.log(`PASS ${countInfo}`);
  } catch (err) {
    console.log(`FAIL!`);
    console.error(err.stdout || err.stderr || err.message);
    process.exit(1);
  }
}

console.log(`\n==================================================`);
console.log(`ALL SUITES FINISHED: ${totalPassedSuites}/${testScripts.length} SUITES PASSED (0 FAILURES)`);
console.log(`==================================================`);
