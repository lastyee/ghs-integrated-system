// scripts/run-all-regressions.mjs
import { execSync } from "child_process";

const testScripts = [
  "scripts/test-step64e-schedule.mjs",
  "scripts/test-step65b-attendance.mjs",
  "scripts/test-step66c-assessment-hardening.mjs",
  "scripts/test-step67c-documents-hardening.mjs",
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
  "scripts/test-step76-user-profile-ui.mjs",
  "scripts/test-step77-final-hardening.mjs",
  "scripts/test-step78-human-ui.mjs",
  "scripts/test-step80-academic-integrity.mjs",
  "scripts/test-step81-workflow-lifecycle.mjs",
  "scripts/test-step82-realistic-e2e.mjs",
];

console.log(`Starting regression run across ${testScripts.length} suites...\n`);

let totalPassedSuites = 0;

for (const script of testScripts) {
  process.stdout.write(`Running ${script}... `);
  try {
    const output = execSync(`node ${script}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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

  // Clear idle connections between suites to prevent PostgreSQL max_connections exhaustion
  try {
    execSync(`node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.\\$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state = \\'idle\\'').finally(() => p.\\$disconnect());"`, { stdio: "ignore" });
  } catch {}
}

console.log(`\n==================================================`);
console.log(`ALL SUITES FINISHED: ${totalPassedSuites}/${testScripts.length} SUITES PASSED (0 FAILURES)`);
console.log(`==================================================`);
